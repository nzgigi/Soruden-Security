const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    // Si le message n'est pas en cache (pas de contenu/auteur)
    if (!message.author || message.partial) {
      console.log(`❌ Message supprimé sans cache : ID ${message.id}`);
      return;
    }

    // Récupérer qui a supprimé via audit logs
    let executor = null;
    try {
      const auditLogs = await message.guild.fetchAuditLogs({
        type: AuditLogEvent.MessageDelete,
        limit: 1
      });

      const entry = auditLogs.entries.first();
      
      // Vérifier que l'audit log correspond bien à ce message
      if (entry && 
          entry.target.id === message.author.id && 
          entry.extra.channel.id === message.channel.id &&
          Date.now() - entry.createdTimestamp < 5000) {
        executor = entry.executor;
      }
    } catch (err) {
      console.error('Erreur fetch audit logs:', err);
    }

    // Si pas d'executor trouvé = l'auteur a supprimé son propre message
    const deletedBy = executor || message.author;
    const isSelfDelete = !executor || executor.id === message.author.id;

    const logChannel = message.guild.channels.cache.get(process.env.MESSAGE_LOG_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message supprimé')
      .setColor(0xff0000)
      .addFields(
        { name: '👤 Auteur', value: `${message.author} (${message.author.tag})\nID: ${message.author.id}`, inline: true },
        { name: '🗑️ Supprimé par', value: isSelfDelete ? '*(lui-même)*' : `${deletedBy} (${deletedBy.tag})`, inline: true },
        { name: '📍 Salon', value: `${message.channel}`, inline: false },
        { name: '📝 Contenu', value: message.content || '*(vide ou embed)*', inline: false }
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp();

    // Gérer les pièces jointes
    if (message.attachments.size > 0) {
      const attachmentList = message.attachments.map(att => `[${att.name}](${att.url})`).join('\n');
      embed.addFields({ name: '📎 Pièces jointes', value: attachmentList });
    }

    // Limiter la longueur du contenu (Discord limite à 1024 caractères par field)
    if (message.content && message.content.length > 1024) {
      embed.data.fields[3].value = message.content.substring(0, 1021) + '...';
    }

    await logChannel.send({ embeds: [embed] });
    console.log(`🗑️ Message supprimé de ${message.author.tag} dans #${message.channel.name}`);
  },
};
