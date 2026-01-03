// commands/audit-perms.js
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = {
   data:new SlashCommandBuilder()
    .setName('audit-perms')
    .setDescription('Analyse complète des permissions du serveur'),
    
  async execute(interaction) {
    // Vérification des allowed users
    const allowedUsers = process.env.ALLOWED_USERS.split(',');
    if (!allowedUsers.includes(interaction.user.id)) {
      return interaction.reply({ 
        content: '❌ Non autorisé.', 
        ephemeral: false
      });
    }

    await interaction.deferReply({ ephemeral: true });
    
    const guild = interaction.guild;
    const issues = [];
    
    // ========== 1. SCAN DES RÔLES DANGEREUX ==========
    const dangerousPerms = [
      'Administrator',
      'ManageGuild',
      'ManageRoles',
      'ManageChannels',
      'ManageWebhooks',
      'BanMembers',
      'KickMembers'
    ];
    
    const dangerousRoles = [];
    
    for (const role of guild.roles.cache.values()) {
      if (role.name === '@everyone') continue;
      
      const hasAdmin = role.permissions.has(PermissionFlagsBits.Administrator);
      const hasDangerous = dangerousPerms.some(perm => 
        role.permissions.has(PermissionFlagsBits[perm])
      );
      
      if (hasAdmin || hasDangerous) {
        const perms = dangerousPerms.filter(p => 
          role.permissions.has(PermissionFlagsBits[p])
        );
        
        dangerousRoles.push({
          role: role,
          permissions: perms,
          memberCount: role.members.size
        });
      }
    }
    
    if (dangerousRoles.length > 0) {
      issues.push({
        title: '⚠️ Rôles avec permissions dangereuses',
        description: dangerousRoles.map(r => 
          `**${r.role.name}** (${r.memberCount} membres)\n└ ${r.permissions.join(', ')}`
        ).join('\n\n'),
        severity: 'high'
      });
    }
    
    // ========== 2. RÔLES ORPHELINS ==========
    const orphanRoles = guild.roles.cache.filter(role => 
      role.members.size === 0 && 
      role.name !== '@everyone' &&
      !role.managed // Pas les rôles de bots
    );
    
    if (orphanRoles.size > 0) {
      issues.push({
        title: '🗑️ Rôles orphelins (aucun membre)',
        description: orphanRoles.map(r => `- ${r.name}`).slice(0, 10).join('\n') + 
          (orphanRoles.size > 10 ? `\n... et ${orphanRoles.size - 10} autres` : ''),
        severity: 'low'
      });
    }
    
    // ========== 3. PERMISSIONS @EVERYONE ==========
    const everyoneRole = guild.roles.everyone;
    const everyoneDangerous = dangerousPerms.filter(perm => 
      everyoneRole.permissions.has(PermissionFlagsBits[perm])
    );
    
    if (everyoneDangerous.length > 0) {
      issues.push({
        title: '🚨 @everyone a des permissions dangereuses',
        description: `Permissions trouvées: ${everyoneDangerous.join(', ')}`,
        severity: 'critical'
      });
    }
    
    // ========== 4. SCAN DES SALONS ==========
    const channelIssues = [];
    
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== 0 && channel.type !== 2) continue; // Text & Voice only
      
      const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.id);
      
      if (everyoneOverwrite) {
        const dangerous = [];
        
        if (everyoneOverwrite.allow.has(PermissionFlagsBits.ManageChannels)) {
          dangerous.push('ManageChannels');
        }
        if (everyoneOverwrite.allow.has(PermissionFlagsBits.ManageWebhooks)) {
          dangerous.push('ManageWebhooks');
        }
        if (everyoneOverwrite.allow.has(PermissionFlagsBits.MentionEveryone)) {
          dangerous.push('MentionEveryone');
        }
        
        if (dangerous.length > 0) {
          channelIssues.push(`**#${channel.name}**: ${dangerous.join(', ')}`);
        }
      }
    }
    
    if (channelIssues.length > 0) {
      issues.push({
        title: '🔓 Salons avec permissions @everyone dangereuses',
        description: channelIssues.slice(0, 10).join('\n') +
          (channelIssues.length > 10 ? `\n... et ${channelIssues.length - 10} autres` : ''),
        severity: 'medium'
      });
    }
    
    // ========== 5. MEMBRES AVEC TROP DE PERMISSIONS ==========
    const powerUsers = [];
    
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      
      const hasAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
      const dangerousCount = dangerousPerms.filter(perm => 
        member.permissions.has(PermissionFlagsBits[perm])
      ).length;
      
      if (hasAdmin || dangerousCount >= 3) {
        powerUsers.push({
          member: member,
          count: dangerousCount,
          hasAdmin: hasAdmin
        });
      }
    }
    
    if (powerUsers.length > 0) {
      issues.push({
        title: '👥 Membres avec permissions élevées',
        description: powerUsers.slice(0, 15).map(u => 
          `${u.member.user.tag} - ${u.hasAdmin ? '**ADMIN**' : `${u.count} perms dangereuses`}`
        ).join('\n') + (powerUsers.length > 15 ? `\n... et ${powerUsers.length - 15} autres` : ''),
        severity: 'info'
      });
    }
    
    // ========== GÉNÉRATION DU RAPPORT ==========
    if (issues.length === 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Audit de Permissions')
            .setDescription('Aucun problème détecté ! Votre serveur est bien sécurisé.')
            .setColor('Green')
            .setTimestamp()
        ]
      });
    }
    
    // Trie par sévérité
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    // Couleur selon la sévérité maximale
    const colors = {
      critical: 0xFF0000, // Rouge
      high: 0xFF6600,     // Orange
      medium: 0xFFCC00,   // Jaune
      low: 0x00CCFF,      // Bleu
      info: 0x808080      // Gris
    };
    
    const maxSeverity = issues[0].severity;
    
    const embed = new EmbedBuilder()
      .setTitle('🔍 Rapport d\'Audit de Permissions')
      .setDescription(`**${issues.length} problème(s) détecté(s)**`)
      .setColor(colors[maxSeverity])
      .setTimestamp()
      .setFooter({ text: `Demandé par ${interaction.user.tag}` });
    
    // Ajoute les issues (max 5 pour ne pas dépasser la limite des embeds)
    for (const issue of issues.slice(0, 5)) {
      embed.addFields({
        name: issue.title,
        value: issue.description.substring(0, 1024) // Limite Discord
      });
    }
    
    if (issues.length > 5) {
      embed.addFields({
        name: '⚠️ Rapport tronqué',
        value: `${issues.length - 5} problème(s) supplémentaire(s) non affiché(s)`
      });
    }
    
    // Boutons d'action
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('audit_export')
        .setLabel('📄 Exporter le rapport complet')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('audit_fix_orphans')
        .setLabel('🗑️ Supprimer les rôles orphelins')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(orphanRoles.size === 0)
    );
    
    await interaction.editReply({ 
      embeds: [embed],
      components: [row]
    });
    
    // Stocke les données pour les boutons
    interaction.client.auditData = {
      issues,
      orphanRoles: orphanRoles.map(r => r.id),
      guildId: guild.id,
      userId: interaction.user.id
    };
  }
};
