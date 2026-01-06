const { Events, EmbedBuilder } = require('discord.js');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    // Ignorer si pas en cache ou si c'est un bot
    if (oldMessage.partial || newMessage.partial || newMessage.author.bot) return;

    // Ignorer si le contenu n'a pas changé (ex: embed auto-ajouté)
    if (oldMessage.content === newMessage.content) return;

    const logChannel = newMessage.guild.channels.cache.get(process.env.MESSAGE_LOG_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('✏️ Message modifié')
      .setColor(0xffa500)
      .addFields(
        { name: '👤 Auteur', value: `${newMessage.author} (${newMessage.author.tag})\nID: ${newMessage.author.id}`, inline: true },
        { name: '📍 Salon', value: `${newMessage.channel}`, inline: true },
        { name: '📝 Ancien message', value: oldMessage.content || '*(vide)*', inline: false },
        { name: '📝 Nouveau message', value: newMessage.content || '*(vide)*', inline: false },
        { name: '🔗 Lien', value: `[Aller au message](${newMessage.url})`, inline: false }
      )
      .setThumbnail(newMessage.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Message ID: ${newMessage.id}` })
      .setTimestamp();

    // Limiter la longueur des messages (1024 caractères max par field)
    if (oldMessage.content && oldMessage.content.length > 1024) {
      embed.data.fields[2].value = oldMessage.content.substring(0, 1021) + '...';
    }
    if (newMessage.content && newMessage.content.length > 1024) {
      embed.data.fields[3].value = newMessage.content.substring(0, 1021) + '...';
    }

    await logChannel.send({ embeds: [embed] });
    console.log(`✏️ Message modifié de ${newMessage.author.tag} dans #${newMessage.channel.name}`);
  },
};
