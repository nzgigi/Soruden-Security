const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent } = require('discord.js');
const roleWhitelist = require('../config/roleWhitelist.json');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const addedRoles = newRoles.difference(oldRoles);
    const removedRoles = oldRoles.difference(newRoles);

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 });
    const entry = auditLogs.entries.first();
    if (!entry || entry.target.id !== newMember.id || Date.now() - entry.createdTimestamp > 10000) return;

    const isAdd = addedRoles.size > 0;
    const changedRoles = isAdd ? addedRoles : removedRoles;

    // ⭐ Vérification whitelist : on ignore si au moins un rôle est whitelisté
    const hasWhitelistedRole = Array.from(changedRoles.values()).some(role => 
      roleWhitelist.whitelistedRoles.includes(role.id)
    );

    if (hasWhitelistedRole) {
      console.log(`⚪ Rôle whitelisté ignoré pour ${newMember.user.tag}`);
      return;
    }

    const logChannel = newMember.guild.channels.cache.get(process.env.ROLE_LOG_CHANNEL_ID);
    if (!logChannel) return;

    const roleMentions = changedRoles.map(r => `<@&${r.id}>`).join(', ');

    const embed = new EmbedBuilder()
      .setTitle(isAdd ? '🟢 Rôle(s) ajouté(s)' : '🔴 Rôle(s) supprimé(s)')
      .setDescription(`**Membre :** ${newMember} (${newMember.id})\n**Rôle(s) :** ${roleMentions}`)
      .addFields(
        { name: '👮 Exécuteur', value: `${entry.executor} (${entry.executor.id})`, inline: true },
        { name: '🎯 Cible', value: `${newMember.user.tag}`, inline: true }
      )
      .setColor(isAdd ? 0x00ff00 : 0xff0000)
      .setTimestamp()
      .setFooter({ text: `Audit ID: ${entry.id}` });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`role_reverse_${entry.id}_${newMember.id}_${Array.from(changedRoles.keys()).join('|')}_${isAdd ? 'add' : 'remove'}`)
          .setLabel('Reverse')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`role_ban_${entry.executor.id}_${newMember.id}_${entry.id}`)
          .setLabel('Ban')
          .setStyle(ButtonStyle.Danger)
      );

    await logChannel.send({ embeds: [embed], components: [row] });
    console.log(`📝 Log rôle : ${isAdd ? 'Ajout' : 'Retrait'} pour ${newMember.user.tag} par ${entry.executor.tag}`);
  },
};
