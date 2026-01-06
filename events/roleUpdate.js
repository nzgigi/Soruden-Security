const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent } = require('discord.js');

module.exports = {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    const logChannel = newRole.guild.channels.cache.get(process.env.ROLE_LOG_CHANNEL_ID);
    if (!logChannel) return;

    const auditLogs = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 });
    const entry = auditLogs.entries.first();
    
    if (!entry || entry.target.id !== newRole.id || Date.now() - entry.createdTimestamp > 5000) return;

    const changes = [];
    
    if (oldRole.name !== newRole.name) {
      changes.push(`**Nom :** \`${oldRole.name}\` → \`${newRole.name}\``);
    }
    
    if (oldRole.color !== newRole.color) {
      changes.push(`**Couleur :** ${oldRole.hexColor} → ${newRole.hexColor}`);
    }
    
    if (oldRole.hoist !== newRole.hoist) {
      changes.push(`**Affiché séparément :** ${oldRole.hoist ? 'Oui' : 'Non'} → ${newRole.hoist ? 'Oui' : 'Non'}`);
    }
    
    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push(`**Mentionnable :** ${oldRole.mentionable ? 'Oui' : 'Non'} → ${newRole.mentionable ? 'Oui' : 'Non'}`);
    }

    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes.push(`**Permissions modifiées**`);
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Rôle modifié')
      .setDescription(`**Rôle :** <@&${newRole.id}> (\`${newRole.name}\`)\n\n${changes.join('\n')}`)
      .addFields(
        { name: '👮 Modifié par', value: `${entry.executor} (${entry.executor.id})`, inline: true }
      )
      .setColor(0xffa500)
      .setTimestamp()
      .setFooter({ text: `Role ID: ${newRole.id}` });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`role_ban_${entry.executor.id}_none_${entry.id}`)
          .setLabel('Ban exécuteur')
          .setStyle(ButtonStyle.Danger)
      );

    await logChannel.send({ embeds: [embed], components: [row] });
    console.log(`⚙️ Rôle modifié : ${newRole.name} par ${entry.executor.tag}`);
  },
};
