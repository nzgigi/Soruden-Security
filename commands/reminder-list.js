const { SlashCommandBuilder } = require('discord.js');
const { activeReminders } = require('../utils/reminderStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reminder-list')
        .setDescription('Liste vos rappels actifs'),

    async execute(interaction) {
        const allowedUsers = process.env.ALLOWED_USERS?.split(',') || [];
        if (!allowedUsers.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Vous n\'êtes pas autorisé.',
                ephemeral: true
            });
        }

        const reminders = [...activeReminders.entries()]
            .filter(([_, r]) => r.userId === interaction.user.id);

        if (reminders.length === 0) {
            return interaction.reply({
                content: '📭 Aucun rappel actif.',
                ephemeral: true
            });
        }

        const msg = reminders.map(([id, r], i) => (
            `**${i + 1}.** \`${id}\`\n📝 ${r.message}\n⏰ ${r.heures.map(h=>`${h}h`).join(', ')}\n📅 ${r.endDate.toLocaleDateString('fr-FR')}`
        )).join('\n\n');

        await interaction.reply({
            content: `📋 **Vos rappels :**\n\n${msg}`,
            ephemeral: true
        });
    }
};
