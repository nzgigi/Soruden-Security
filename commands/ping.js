const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
   data:new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Teste la latence du bot'),

  async execute(interaction) {
    const sent = await interaction.reply({ 
      embeds: [new EmbedBuilder()
        .setTitle('🏓 Pong !')
        .setColor(0x00ff00)
        .setDescription(`**Latence API :** \`${Math.round(interaction.client.ws.ping)}ms\``)
        .setFooter({ text: `Soruden Security Bot` })
      ], 
      fetchReply: true 
    });

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong !')
      .setColor(0x00ff88)
      .addFields(
        { name: 'Latence WebSocket', value: `\`${Math.round(interaction.client.ws.ping)}ms\``, inline: true },
        { name: 'Latence Réponse', value: `\`${sent.createdTimestamp - interaction.createdTimestamp}ms\``, inline: true }
      )
      .setFooter({ text: `Soruden Security Bot` });

    await interaction.editReply({ embeds: [embed] });
  }
};
