require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  Partials,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  AttachmentBuilder
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.GuildMember],
});

// ================== COMMANDES ==================
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[AVERTISSEMENT] La commande ${file} n'a pas "data" ou "execute".`);
  }
}

// ================== EVENTS ==================
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);

  console.log(`📡 Event chargé : ${event.name}`);

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// ================== READY ==================
client.once(Events.ClientReady, c => {
  console.log(`✅ Connecté en tant que ${c.user.tag}`);
  console.log(`📊 ${c.guilds.cache.size} serveur(s) | Cache membres prêt`);

  c.user.setPresence({
    activities: [{
      name: 'je vois tout',
      type: 1,
      url: 'https://www.twitch.tv/gmnzzz'
    }],
    status: 'dnd'
  });

  console.log('🎥 Statut streaming activé');
});

client.webhooksCache = new Map();

client.on(Events.ClientReady, async () => {
  console.log("📡 Initialisation du cache des webhooks...");

  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== 0 && channel.type !== 5) continue;

      try {
        const ws = await channel.fetchWebhooks();
        client.webhooksCache.set(channel.id, ws.map(w => w.id));
      } catch (err) {
        console.log(`[WebhookCache] Impossible de fetch les webhooks pour ${channel.id}: ${err.message}`);
      }
    }
  }

  console.log("✅ Cache des webhooks initialisé");
});

// ================== STOCKAGE RAID (pour les boutons) ==================
client.raidJoins = new Map();

// ================== PROTECTION ADMIN ==================
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (oldMember.roles.cache.size === newMember.roles.cache.size) return;

  const addedRoles = newMember.roles.cache.filter(
    role => !oldMember.roles.cache.has(role.id)
  );

  for (const [roleId, role] of addedRoles) {
    if (!role.permissions.has(PermissionFlagsBits.Administrator)) continue;

    await role.setPermissions(
      role.permissions.remove(PermissionFlagsBits.Administrator),
      'Protection anti-raid : attribution admin non autorisée'
    );

    const auditLogs = await newMember.guild.fetchAuditLogs({
      type: 25,
      limit: 1
    });

    const log = auditLogs.entries.first();
    const executor = log?.executor;

    const alertChannel = newMember.guild.channels.cache.get(process.env.ALERT_CHANNEL_ID);
    if (!alertChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('🚨 TENTATIVE D\'ATTRIBUTION ADMIN')
      .setColor(0xff0000)
      .addFields(
        { name: '👤 Cible', value: `${newMember.user.tag}`, inline: true },
        { name: '👮 Exécuteur', value: executor ? executor.tag : 'Inconnu', inline: true },
        { name: '🎭 Rôle', value: role.name }
      )
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin_approve_${newMember.id}_${roleId}_${executor?.id || 'unknown'}`)
        .setLabel('✅ Valider')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`admin_deny_${newMember.id}_${roleId}_${executor?.id || 'unknown'}`)
        .setLabel('❌ Refuser & Ban')
        .setStyle(ButtonStyle.Danger)
    );

    const allowedUsers = process.env.ALLOWED_USERS.split(',');
    await alertChannel.send({
      content: allowedUsers.map(id => `<@${id}>`).join(' '),
      embeds: [embed],
      components: [buttons]
    });

    console.log(`⚠️ Attribution admin bloquée : ${newMember.user.tag} par ${executor?.tag || 'inconnu'}`);
  }
});

const webhookWhitelist = require("./utils/webhookWhitelist");
client.on(Events.InteractionCreate, async interaction => {

  // -------------------- Slash Commands --------------------
  if (interaction.isChatInputCommand()) {
    const allowedUsers = process.env.ALLOWED_USERS.split(',');
    if (!allowedUsers.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Non autorisé.', ephemeral: true });
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Erreur commande.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Erreur commande.', ephemeral: true });
      }
    }
  }

  // -------------------- Gestion des boutons --------------------
  if (interaction.isButton()) {
    const allowedUsers = process.env.ALLOWED_USERS.split(',');
    
    if (!allowedUsers.includes(interaction.user.id)) {
      return interaction.reply({ 
        content: '❌ Seuls les administrateurs principaux peuvent valider.', 
        ephemeral: true 
      });
    }

    const [type, action, targetId, roleId, executorId] = interaction.customId.split('_');

    // -------- Admin buttons (approve / deny) --------
    if (type === 'admin') {
      const guild = interaction.guild;
      const target = await guild.members.fetch(targetId).catch(() => null);
      const executor = executorId !== 'unknown' ? await guild.members.fetch(executorId).catch(() => null) : null;
      const role = guild.roles.cache.get(roleId);

      if (action === 'approve') {
        if (role) {
          await role.setPermissions(
            role.permissions.add(PermissionsBitField.Flags.Administrator),
            `Approuvé par ${interaction.user.tag}`
          );
        }

        const approveEmbed = new EmbedBuilder()
          .setTitle('✅ Attribution Admin Validée')
          .setColor(0x00ff00)
          .setDescription(`**${target?.user.tag || 'Membre introuvable'}** peut maintenant avoir les permissions admin via ${role?.name || 'rôle supprimé'}`)
          .setFooter({ text: `Validé par ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.update({ embeds: [approveEmbed], components: [] });
        console.log(`✅ Admin validé pour ${target?.user.tag} par ${interaction.user.tag}`);

      } else if (action === 'deny') {
        const denyEmbed = new EmbedBuilder()
          .setTitle('🔨 Attribution Admin Refusée')
          .setColor(0x000000)
          .setDescription(`**Action de bannissement en cours...**`)
          .addFields(
            { name: 'Banni', value: target ? `${target.user.tag}` : 'Déjà parti', inline: true },
            { name: 'Banni', value: executor ? `${executor.user.tag}` : 'Inconnu', inline: true }
          )
          .setFooter({ text: `Refusé par ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.update({ embeds: [denyEmbed], components: [] });

        if (target) await target.ban({ reason: `Attribution admin non autorisée - Refusé par ${interaction.user.tag}` }).catch(err => console.error(err));
        if (executor) await executor.ban({ reason: `Tentative attribution admin non autorisée - Refusé par ${interaction.user.tag}` }).catch(err => console.error(err));

        console.log(`🔨 Bans exécutés par ${interaction.user.tag}`);
      }
    }

    // -------- Anti-Webhook buttons (ban / allow) --------
    if (type === 'wh') {
      const guild = interaction.guild;
      const target = await guild.members.fetch(targetId).catch(() => null);

      if (action === 'ban') {
        if (target) {
          await target.ban({ reason: `Anti-Webhook - Ban manuel par ${interaction.user.tag}` }).catch(err => console.error(err));
        }
        
        const banEmbed = new EmbedBuilder()
          .setTitle('🔨 Utilisateur Banni')
          .setColor('Red')
          .setDescription(`**${target?.user.tag || 'Membre introuvable'}** a été banni`)
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp();

        return interaction.update({
          embeds: [banEmbed],
          components: []
        });
      }

      if (action === 'allow') {
        if (target) {
          const key = `${guild.id}-${target.id}`;
          webhookWhitelist.set(key, 1);
          
          const allowEmbed = new EmbedBuilder()
            .setTitle('✅ Webhook Autorisé')
            .setColor('Green')
            .setDescription(`**${target.user.tag}** peut maintenant créer 1 webhook`)
            .setFooter({ text: `Autorisé par ${interaction.user.tag}` })
            .setTimestamp();

          return interaction.update({
            embeds: [allowEmbed],
            components: []
          });
        }
      }
    }

    // -------- Raid buttons (banall / kicksuspects / ignore) --------
    if (type === 'raid') {
      const guild = interaction.guild;
      const inviteCode = interaction.customId.split('_')[2];

      if (action === 'banall') {
        const inviterId = interaction.customId.split('_')[2];
        
        await interaction.deferUpdate();

        const raidData = client.raidJoins.get(inviteCode);
        let bannedCount = 0;

        const inviter = await guild.members.fetch(inviterId).catch(() => null);
        if (inviter) {
          await inviter.ban({ reason: `Raid détecté - Invite suspecte (Action par ${interaction.user.tag})` }).catch(err => console.error(err));
          bannedCount++;
        }

        if (raidData && raidData.length > 0) {
          for (const joinData of raidData) {
            const member = await guild.members.fetch(joinData.member.id).catch(() => null);
            if (member) {
              await member.ban({ reason: `Raid - Invite suspecte ${inviteCode} (Action par ${interaction.user.tag})` }).catch(err => console.error(err));
              bannedCount++;
            }
          }
        }

        const banEmbed = new EmbedBuilder()
          .setTitle('🔨 Action Exécutée - Ban Massif')
          .setColor('Red')
          .setDescription(`**${bannedCount} membre(s) banni(s)**\n\nInviter: ${inviter ? inviter.user.tag : 'Déjà parti'}\nCode invite: \`${inviteCode}\``)
          .setFooter({ text: `Action par ${interaction.user.tag}` })
          .setTimestamp();

        client.raidJoins.delete(inviteCode);

        return interaction.editReply({
          embeds: [banEmbed],
          components: []
        });
      }

      if (action === 'kicksuspects') {
        await interaction.deferUpdate();

        const raidData = client.raidJoins.get(inviteCode);
        let kickedCount = 0;

        if (raidData && raidData.length > 0) {
          for (const joinData of raidData) {
            const member = joinData.member;
            const accountAge = Date.now() - member.user.createdTimestamp;
            const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
            const hasAvatar = member.user.displayAvatarURL() !== member.user.defaultAvatarURL;

            if (accountAgeDays < 7 || !hasAvatar) {
              const m = await guild.members.fetch(member.id).catch(() => null);
              if (m) {
                await m.kick(`Raid - Membre suspect (Action par ${interaction.user.tag})`).catch(err => console.error(err));
                kickedCount++;
              }
            }
          }
        }

        const kickEmbed = new EmbedBuilder()
          .setTitle('⚠️ Action Exécutée - Kick Suspects')
          .setColor('Orange')
          .setDescription(`**${kickedCount} membre(s) suspect(s) kick(s)**\n\nCode invite: \`${inviteCode}\``)
          .setFooter({ text: `Action par ${interaction.user.tag}` })
          .setTimestamp();

        client.raidJoins.delete(inviteCode);

        return interaction.editReply({
          embeds: [kickEmbed],
          components: []
        });
      }

      if (action === 'ignore') {
        const ignoreEmbed = new EmbedBuilder()
          .setTitle('✅ Faux Positif')
          .setColor('Green')
          .setDescription(`Alerte marquée comme faux positif.\nCode invite: \`${inviteCode}\``)
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp();

        client.raidJoins.delete(inviteCode);

        return interaction.update({
          embeds: [ignoreEmbed],
          components: []
        });
      }
    }

    // -------- Audit buttons (export / fix orphans) --------
    if (interaction.customId === 'audit_export') {
      const auditData = client.auditData;
      
      if (!auditData || auditData.userId !== interaction.user.id) {
        return interaction.reply({ 
          content: '❌ Données d\'audit expirées ou non autorisé', 
          ephemeral: true 
        });
      }
      
      let report = `=== RAPPORT D'AUDIT DE PERMISSIONS ===\n`;
      report += `Serveur: ${interaction.guild.name}\n`;
      report += `Date: ${new Date().toLocaleString('fr-FR')}\n`;
      report += `Audit par: ${interaction.user.tag}\n\n`;
      
      for (const issue of auditData.issues) {
        report += `${issue.title}\n`;
        report += `Sévérité: ${issue.severity.toUpperCase()}\n`;
        report += `${issue.description}\n\n`;
        report += `${'='.repeat(50)}\n\n`;
      }
      
      const buffer = Buffer.from(report, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { 
        name: `audit-${interaction.guild.id}-${Date.now()}.txt` 
      });
      
      return interaction.reply({
        content: '📄 **Rapport complet généré**',
        files: [attachment],
        ephemeral: true
      });
    }

    if (interaction.customId === 'audit_fix_orphans') {
      const auditData = client.auditData;
      
      if (!auditData || auditData.userId !== interaction.user.id) {
        return interaction.reply({ 
          content: '❌ Non autorisé', 
          ephemeral: true 
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      let deleted = 0;
      for (const roleId of auditData.orphanRoles) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role && role.members.size === 0) {
          await role.delete('Audit: Rôle orphelin supprimé');
          deleted++;
        }
      }
      
      return interaction.editReply({
        content: `✅ **${deleted} rôle(s) orphelin(s) supprimé(s)**`
      });
    }

    // -------- Anti-Hack False Positive --------
    if (type === 'hack' && action === 'false') {
      const targetId = interaction.customId.split('_')[2];
      const level = parseInt(interaction.customId.split('_')[3]);

      const guild = interaction.guild;
      const member = await guild.members.fetch(targetId).catch(() => null);

      if (member) {
        if (level === 2) {
          try {
            await member.timeout(null, `False positive - Correction par ${interaction.user.tag}`);
          } catch {}
        }

        if (level === 3) {
          try {
            await guild.members.unban(targetId, `False positive - Correction par ${interaction.user.tag}`);
          } catch {}
        }
      }

      const correctionEmbed = new EmbedBuilder()
        .setTitle('✅ False Positive Corrigé')
        .setColor('Green')
        .setDescription(`**${member?.user.tag || 'Membre introuvable'}**\n\nSanctions annulées (Level ${level})`)
        .setFooter({ text: `Corrigé par ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.update({
        embeds: [correctionEmbed],
        components: []
      });

      console.log(`✅ False positive corrigé pour ${member?.user.tag} (LVL${level}) par ${interaction.user.tag}`);
    }

    // -------- Role Log buttons (reverse / ban) --------
    if (interaction.customId.startsWith('role_reverse_')) {
      await interaction.deferUpdate(); // ACK immédiat

      const parts = interaction.customId.split('_');
      const auditId = parts[2];
      const targetId = parts[3];
      const roleIds = parts[4];
      const actionType = parts[5];

      const guild = interaction.guild;
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) {
        return interaction.followUp({ content: 'Membre introuvable.', ephemeral: true });
      }

      const auditLogs = await guild.fetchAuditLogs({ limit: 100 });
      const entry = auditLogs.entries.find(e => e.id === auditId);
      if (!entry) {
        return interaction.followUp({ content: 'Audit expiré.', ephemeral: true });
      }

      const roles = roleIds.split('|').map(id => guild.roles.cache.get(id)).filter(Boolean);

      let success = false;
      if (actionType === 'add' && roles.length > 0) {
        await target.roles.remove(roles, 'Reverse via log');
        success = true;
      } else if (actionType === 'remove' && roles.length > 0) {
        await target.roles.add(roles, 'Reverse via log');
        success = true;
      }

      const reverseEmbed = new EmbedBuilder()
        .setTitle('🔄 Reverse appliqué')
        .setColor('Blue')
        .setDescription(`${success ? '✅' : '❌'} Rôle(s) ${actionType === 'add' ? 'retiré(s)' : 'ajouté(s)'} pour ${target}`)
        .setFooter({ text: `Par ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [reverseEmbed], components: [] });
      console.log(`🔄 Role reverse par ${interaction.user.tag} sur ${target.user.tag}`);
      return;
    }

    if (interaction.customId.startsWith('role_ban_')) {
      await interaction.deferUpdate(); // ACK immédiat

      const parts = interaction.customId.split('_');
      const executorId = parts[2];
      const targetId = parts[3];
      const auditId = parts[4];

      const guild = interaction.guild;
      const executor = await guild.members.fetch(executorId).catch(() => null);
      const target = await guild.members.fetch(targetId).catch(() => null);

      if (executor) await executor.ban({ reason: `Action rôle suspecte - Log ${auditId}` }).catch(console.error);
      if (target) await target.ban({ reason: `Victime rôle suspecte - Log ${auditId}` }).catch(console.error);

      const banEmbed = new EmbedBuilder()
        .setTitle('🔨 Bans appliqués')
        .setColor('Red')
        .addFields(
          { name: 'Exécuteur', value: executor ? `${executor.user.tag}` : 'Introuvable', inline: true },
          { name: 'Cible', value: target ? `${target.user.tag}` : 'Introuvable', inline: true }
        )
        .setFooter({ text: `Par ${interaction.user.tag} | Audit ${auditId}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [banEmbed], components: [] });
      console.log(`🔨 Role ban par ${interaction.user.tag}`);
      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
