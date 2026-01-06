const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent } = require('discord.js');

module.exports = {
  name: Events.GuildRoleCreate,
  async execute(role) {
    const logChannel = role.guild.channels.cache.get(process.env.ROLE_LOG_CHANNEL_ID);
    if (!logChannel) return;

    const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
    const entry = auditLogs.entries.first();
    
    if (!entry || entry.target.id !== role.id || Date.now() - entry.createdTimestamp > 5000) return;

    const embed = new EmbedBuilder()
      .setTitle('✨ Rôle créé')
      .setDescription(`**Rôle :** <@&${role.id}> (\`${role.name}\`)`)
      .addFields(
        { name: '👮 Créé par', value: `${entry.executor} (${entry.executor.id})`, inline: true },
        { name: '🎨 Couleur', value: role.hexColor || 'Aucune', inline: true },
        { name: '📍 Position', value: `${role.position}`, inline: true }
      )
      .setColor(role.color || 0x99aab5)
      .setTimestamp()
      .setFooter({ text: `Role ID: ${role.id}` });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`role_ban_${entry.executor.id}_none_${entry.id}`)
          .setLabel('Ban créateur')
          .setStyle(ButtonStyle.Danger)
      );

    await logChannel.send({ embeds: [embed], components: [row] });
    console.log(`✨ Rôle créé : ${role.name} par ${entry.executor.tag}`);
  },
};
