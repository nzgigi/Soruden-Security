const { SlashCommandBuilder } = require('discord.js');
const { activeReminders } = require('../utils/reminderStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reminder-delete')
        .setDescription('Supprime un rappel')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID du rappel')
                .setRequired(true)
        ),

    async execute(interaction) {
        const allowedUsers = process.env.ALLOWED_USERS?.split(',') || [];
        if (!allowedUsers.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Vous n\'êtes pas autorisé.',
                ephemeral: true
            });
        }

        const reminderId = interaction.options.getString('id');
        const reminder = activeReminders.get(reminderId);

        if (!reminder) {
            return interaction.reply({
                content: '❌ Rappel introuvable.',
                ephemeral: true
            });
        }

        if (reminder.userId !== interaction.user.id) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas supprimer ce rappel.',
                ephemeral: true
            });
        }

        reminder.tasks.forEach(t => t.stop());
        activeReminders.delete(reminderId);

        await interaction.reply({
            content: '🗑️ Rappel supprimé.',
            ephemeral: true
        });
    }
};
