const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent } = require('discord.js');

module.exports = {
  name: Events.GuildRoleDelete,
  async execute(role) {
    const logChannel = role.guild.channels.cache.get(process.env.ROLE_LOG_CHANNEL_ID);
    if (!logChannel) return;

    const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
    const entry = auditLogs.entries.first();
    
    if (!entry || entry.target.id !== role.id || Date.now() - entry.createdTimestamp > 5000) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Rôle supprimé')
      .setDescription(`**Rôle :** \`${role.name}\` (ID: ${role.id})`)
      .addFields(
        { name: '👮 Supprimé par', value: `${entry.executor} (${entry.executor.id})`, inline: true },
        { name: '👥 Membres affectés', value: `${role.members.size}`, inline: true }
      )
      .setColor(0xff0000)
      .setTimestamp()
      .setFooter({ text: `Role ID: ${role.id}` });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`role_ban_${entry.executor.id}_none_${entry.id}`)
          .setLabel('Ban exécuteur')
          .setStyle(ButtonStyle.Danger)
      );

    await logChannel.send({ embeds: [embed], components: [row] });
    console.log(`🗑️ Rôle supprimé : ${role.name} par ${entry.executor.tag}`);
  },
};
