const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
   data:new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Liste tous les bots présents sur le serveur'),

  async execute(interaction, client) {
    const guild = interaction.guild;
    
    // Utilise le cache déjà chargé (pas de fetch)
    const bots = guild.members.cache.filter(member => member.user.bot);
    
    let botList = '';
    bots.forEach(bot => {
      const joinDate = `<t:${Math.floor(bot.joinedTimestamp / 1000)}:R>`;
      const status = bot.presence?.status || 'offline';
      const statusEmoji = {
        online: '🟢',
        idle: '🟡',
        dnd: '🔴',
        offline: '⚫'
      }[status];
      
      botList += `${statusEmoji} **${bot.user.tag}**\n└ Ajouté ${joinDate} • ID: \`${bot.user.id}\`\n\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🤖 Bots du serveur')
      .setColor(0x5865f2)
      .setDescription(botList || 'Aucun bot détecté')
      .setFooter({ text: `Total : ${bots.size} bot(s)` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};