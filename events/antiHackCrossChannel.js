const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const messageCache = require('../utils/messageCache');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore bots et messages sans contenu
    if (message.author.bot) return;
    if (!message.content || message.content.trim().length === 0) return;
    if (!message.guild) return;

    const userId = message.author.id;
    const channelId = message.channelId;
    const content = message.content;
    const timestamp = Date.now();

    // Hash du contenu
    const messageHash = messageCache.hashContent(content);

    // Ajoute au cache
    const data = messageCache.addMessage(userId, messageHash, channelId, timestamp, content);

    // Fenêtres temporelles
    const window60s = 60 * 1000;
    const window5min = 5 * 60 * 1000;

    // Compte duplicates
    const count60s = messageCache.countInWindow(userId, messageHash, window60s);
    const count5min = messageCache.countInWindow(userId, messageHash, window5min);

    // Récupère le niveau actuel
    const currentLevel = data.level;

    // ========== NIVEAU 1: 2+ duplicates en 60s ==========
    if (count60s >= 2 && currentLevel === 0) {
      messageCache.incrementLevel(userId, messageHash);

      // Supprime tous les duplicates
      await deleteDuplicates(message.guild, data.channels, userId, content);

      // DM warning
      try {
        await message.author.send('⚠️ **Comportement suspect détecté**\nVous avez envoyé des messages identiques dans plusieurs salons. Vérifiez que votre compte n\'est pas compromis.');
      } catch (err) {
        console.log(`[LVL1] Impossible d'envoyer DM à ${message.author.tag}`);
      }

      // Log
      await sendLog(message.guild, 1, message.author, data, null);

      console.log(`🚨 [LVL1] ${message.author.tag} - ${count60s} duplicates détectés`);
    }

    // ========== NIVEAU 2: 3+ duplicates en 5min ==========
    else if (count5min >= 3 && currentLevel === 1) {
      messageCache.incrementLevel(userId, messageHash);

      // Supprime duplicates
      await deleteDuplicates(message.guild, data.channels, userId, content);

      // Mute 10min
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member) {
        try {
          await member.timeout(10 * 60 * 1000, 'Anti-hack LVL2: Spam cross-channel');
          
          // DM
          try {
            await message.author.send('⚠️ **Mute 10min appliqué**\nSpam cross-channel détecté. Vérifiez votre compte.');
          } catch {}
        } catch (err) {
          console.log(`[LVL2] Impossible de mute ${message.author.tag}: ${err.message}`);
        }
      }

      // Log
      await sendLog(message.guild, 2, message.author, data, member);

      console.log(`⚠️ [LVL2] ${message.author.tag} - Mute 10min appliqué`);
    }

    // ========== NIVEAU 3: 5+ duplicates ==========
    else if (count5min >= 5 && currentLevel === 2) {
      messageCache.incrementLevel(userId, messageHash);

      // Cleanup total: purge tous les messages du user
      await cleanupUserMessages(message.guild, userId, content);

      const member = await message.guild.members.fetch(userId).catch(() => null);

      if (member) {
        try {
          // Ban 1h
          await member.ban({ 
            deleteMessageSeconds: 600, 
            reason: 'Anti-hack LVL3: Spam cross-channel critique' 
          });

          // Unban auto après 1h
          setTimeout(async () => {
            try {
              await message.guild.members.unban(userId, 'Anti-hack LVL3: Ban temporaire expiré (1h)');
              console.log(`✅ Unban auto: ${message.author.tag}`);
            } catch (err) {
              console.log(`[LVL3] Impossible d'unban ${message.author.tag}: ${err.message}`);
            }
          }, 60 * 60 * 1000); // 1h

          // DM
          try {
            await message.author.send('🚨 **Compte compromis détecté**\nBan temporaire 1h appliqué. Changez immédiatement votre mot de passe Discord.');
          } catch {}

        } catch (err) {
          console.log(`[LVL3] Impossible de ban ${message.author.tag}: ${err.message}`);
        }
      }

      // Log avec ping staff
      await sendLog(message.guild, 3, message.author, data, member);

      console.log(`🚨🚨 [LVL3] ${message.author.tag} - Ban 1h + cleanup total`);

      // Nettoie le cache
      messageCache.remove(userId, messageHash);
    }
  }
};

// ========== FONCTIONS HELPER ==========

// Supprime tous les messages duplicates
async function deleteDuplicates(guild, channelIds, userId, content) {
  let deleted = 0;

  for (const channelId of channelIds) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) continue;

    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const userMessages = messages.filter(m => 
        m.author.id === userId && 
        messageCache.hashContent(m.content) === messageCache.hashContent(content)
      );

      for (const msg of userMessages.values()) {
        await msg.delete().catch(() => {});
        deleted++;
      }
    } catch (err) {
      console.log(`[Delete] Erreur dans ${channelId}: ${err.message}`);
    }
  }

  console.log(`🗑️ ${deleted} message(s) duplicate(s) supprimé(s)`);
  return deleted;
}

// Cleanup total des messages du user (LVL3)
async function cleanupUserMessages(guild, userId, content) {
  let purged = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased()) continue;

    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const userMessages = messages.filter(m => 
        m.author.id === userId && 
        messageCache.hashContent(m.content) === messageCache.hashContent(content)
      );

      for (const msg of userMessages.values()) {
        await msg.delete().catch(() => {});
        purged++;
      }
    } catch (err) {
      console.log(`[Cleanup] Erreur dans ${channel.id}: ${err.message}`);
    }
  }

  console.log(`🧹 Cleanup total: ${purged} message(s) purgé(s)`);
  return purged;
}

// Envoie le log dans le salon security
async function sendLog(guild, level, user, data, member) {
  const logChannelId = process.env.SECURITY_LOG_CHANNEL_ID;
  if (!logChannelId) {
    console.log('[Log] SECURITY_LOG_CHANNEL_ID non configuré');
    return;
  }

  const logChannel = guild.channels.cache.get(logChannelId);
  if (!logChannel) {
    console.log('[Log] Salon security logs introuvable');
    return;
  }

  // Couleurs
  const colors = {
    1: 0x00ff00, // Vert
    2: 0xff9900, // Orange
    3: 0xff0000  // Rouge
  };

  // Titres
  const titles = {
    1: '🚨 HACK SUSPECT LVL1',
    2: '⚠️ HACK LVL2',
    3: '🚨🚨 HACK CRITIQUE LVL3'
  };

  // Actions
  const actions = {
    1: 'Duplicates supprimés + DM warning',
    2: 'Mute 10min appliqué',
    3: 'Ban 1h + cleanup total'
  };

  // Score de suspicion (basique)
  const velocity = data.timestamps.length;
  const spread = data.channels.length;
  const score = Math.min(10, velocity + spread);

  // Formate les channels avec liens
  const channelLinks = [...new Set(data.channels)]
    .slice(0, 6)
    .map(chId => {
      const ch = guild.channels.cache.get(chId);
      return ch ? `<#${chId}>` : `\`${chId}\``;
    })
    .join(', ');

  // Timestamps
  const firstTime = new Date(data.timestamps[0]).toLocaleTimeString('fr-FR');
  const lastTime = new Date(data.timestamps[data.timestamps.length - 1]).toLocaleTimeString('fr-FR');

  const embed = new EmbedBuilder()
    .setTitle(titles[level])
    .setColor(colors[level])
    .addFields(
      { name: '👤 Utilisateur', value: `${user.tag}\n(\`${user.id}\`)`, inline: true },
      { name: '📊 Duplicates', value: `${data.timestamps.length} messages`, inline: true },
      { name: '📈 Score suspicion', value: `${score}/10`, inline: true },
      { name: '⏰ Période', value: `${firstTime} → ${lastTime}` },
      { name: '📍 Channels touchés', value: channelLinks || 'Aucun' },
      { name: '💬 Contenu', value: `\`\`\`${data.content.slice(0, 200)}\`\`\`` },
      { name: '🛡️ Action', value: actions[level] }
    )
    .setFooter({ text: `Anti-hack Cross-Channel • Level ${level}` })
    .setTimestamp();

  // Bouton False Positive
  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hack_false_${user.id}_${level}`)
      .setLabel('False Positive')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✅')
  );

  // Ping staff si LVL3
  const staffRoleId = process.env.STAFF_ROLE_ID;
  const content = level === 3 && staffRoleId ? `<@&${staffRoleId}>` : null;

  await logChannel.send({
    content,
    embeds: [embed],
    components: [button]
  });
}
