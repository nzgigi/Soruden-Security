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
    GatewayIntentBits.GuildMessages,      // ← AJOUTE ÇA
    GatewayIntentBits.MessageContent
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
      // On ne garde que les TextChannel et NewsChannel (exclut Voice, Stage, Category, Threads)
      if (channel.type !== 0 && channel.type !== 5) continue; 
      // 0 = GuildText, 5 = GuildNews

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
    
    // Vérifie que c'est un admin autorisé
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

    // -------- Audit buttons (export / fix orphans) --------
    if (interaction.customId === 'audit_export') {
      const auditData = client.auditData;
      
      if (!auditData || auditData.userId !== interaction.user.id) {
        return interaction.reply({ 
          content: '❌ Données d\'audit expirées ou non autorisé', 
          ephemeral: true 
        });
      }
      
      // Génère un rapport texte complet
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
      
      // Crée un fichier
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
  }
});

client.login(process.env.DISCORD_TOKEN);
