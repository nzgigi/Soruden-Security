const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
   data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Liste automatique des commandes'),

  async execute(interaction, client) {
    const commands = Array.from(client.commands.values());
    
    let description = '';
    commands.forEach(cmd => {
      description += `**/${cmd.data.name}** - ${cmd.data.description}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📚 Soruden Security Bot')
      .setColor(0x5865f2)
      .setDescription(description || 'Aucune commande trouvée')
      .setFooter({ text: `${commands.length} commandes disponibles` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};