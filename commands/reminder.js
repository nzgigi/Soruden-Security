const { SlashCommandBuilder } = require('discord.js');
const { activeReminders } = require('../utils/reminderStore');
const cron = require('node-cron');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('Crée un rappel récurrent jusqu\'à une date spécifique')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Le message du rappel')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date_fin')
                .setDescription('Date de fin (format: JJ/MM/AAAA)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('fois_par_jour')
                .setDescription('Nombre de fois par jour (1-10)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10))
        .addStringOption(option =>
            option.setName('heures')
                .setDescription('Heures séparées par des virgules (ex: 9,14,18)')
                .setRequired(true)),

    async execute(interaction) {
        // 🔐 Permission
        const allowedUsers = process.env.ALLOWED_USERS?.split(',') || [];
        if (!allowedUsers.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Vous n\'êtes pas autorisé à utiliser cette commande.',
                ephemeral: true
            });
        }

        const message = interaction.options.getString('message');
        const dateFin = interaction.options.getString('date_fin');
        const foisParJour = interaction.options.getInteger('fois_par_jour');
        const heuresStr = interaction.options.getString('heures');

        // 📅 Date fin
        const [jour, mois, annee] = dateFin.split('/');
        const endDate = new Date(annee, mois - 1, jour, 23, 59, 59);

        if (isNaN(endDate.getTime()) || endDate < new Date()) {
            return interaction.reply({
                content: '❌ Date invalide ou déjà passée.',
                ephemeral: true
            });
        }

        // ⏰ Heures
        const heures = heuresStr.split(',').map(h => parseInt(h.trim(), 10));
        if (
            heures.length !== foisParJour ||
            heures.some(h => isNaN(h) || h < 0 || h > 23)
        ) {
            return interaction.reply({
                content: `❌ Vous devez fournir ${foisParJour} heures valides (0-23).`,
                ephemeral: true
            });
        }

        if (new Set(heures).size !== heures.length) {
            return interaction.reply({
                content: '❌ Les heures ne doivent pas être dupliquées.',
                ephemeral: true
            });
        }

        const reminderId = `${interaction.user.id}-${Date.now()}`;
        const tasks = [];

        heures.forEach(heure => {
            const task = cron.schedule(
                `0 ${heure} * * *`,
                async () => {
                    const now = new Date();

                    if (now > endDate) {
                        const reminder = activeReminders.get(reminderId);
                        if (reminder) {
                            reminder.tasks.forEach(t => t.stop());
                            activeReminders.delete(reminderId);
                        }
                        try {
                            await interaction.user.send(`✅ Votre rappel "${message}" est terminé.`);
                        } catch {}
                        return;
                    }

                    try {
                        if (interaction.channel) {
                            await interaction.channel.send(
                                `<@${interaction.user.id}> 🔔 **Rappel :** ${message}`
                            );
                        } else {
                            await interaction.user.send(`🔔 **Rappel :** ${message}`);
                        }
                    } catch {}
                },
                { timezone: 'Europe/Brussels' }
            );

            tasks.push(task);
        });

        activeReminders.set(reminderId, {
            userId: interaction.user.id,
            message,
            endDate,
            heures,
            tasks
        });

        await interaction.reply({
            content:
                `✅ **Rappel créé**\n` +
                `⏰ ${heures.sort((a,b)=>a-b).map(h=>`${h}h`).join(', ')}\n` +
                `📅 Jusqu'au ${dateFin}\n` +
                `📝 "${message}"`,
            ephemeral: true
        });
    }
};
