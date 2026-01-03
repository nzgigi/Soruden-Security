const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
   data:new SlashCommandBuilder()
    .setName('admins')
    .setDescription('Liste tous les membres avec la permission Administrateur'),

  async execute(interaction, client) {
    await interaction.deferReply();
    
    const guild = interaction.guild;
    
    // FETCH tous les membres
    await guild.members.fetch();
    
    // Récupère TOUS les admins (pas que cachés)
    const admins = guild.members.cache.filter(member => 
      member.permissions.has(PermissionFlagsBits.Administrator) && !member.user.bot
    );
    
    let adminList = '';
    admins.forEach(admin => {
      const highestRole = admin.roles.highest;
      const status = admin.presence?.status || 'offline';
      const statusEmoji = {
        online: '🟢',
        idle: '🟡',
        dnd: '🔴',
        offline: '⚫'
      }[status];
      
      adminList += `${statusEmoji} **${admin.user.tag}**\n└ ${highestRole} • ID: \`${admin.user.id}\`\n\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('👑 Administrateurs du serveur')
      .setColor(0xff0000)
      .setDescription(adminList || 'Aucun administrateur trouvé')
      .setFooter({ text: `Total : ${admins.size} admin(s)` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};