const { EmbedBuilder } = require('discord.js');

// Stockage en mémoire des mentions @everyone par utilisateur
const everyoneMentions = new Map();

// Configuration
const MAX_MENTIONS = 2; // Nombre de mentions autorisées
const TIME_WINDOW = 60000; // Fenêtre de temps (60 secondes)
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; // ID du salon de logs dans .env

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        // Ignorer les bots et les messages sans @everyone/@here
        if (message.author.bot) return;
        if (!message.mentions.everyone) return;

        const userId = message.author.id;
        const now = Date.now();

        // Récupérer ou initialiser l'historique de l'utilisateur
        if (!everyoneMentions.has(userId)) {
            everyoneMentions.set(userId, []);
        }

        const userMentions = everyoneMentions.get(userId);

        // Nettoyer les anciennes mentions hors de la fenêtre de temps
        const recentMentions = userMentions.filter(timestamp => now - timestamp < TIME_WINDOW);

        // Ajouter la mention actuelle
        recentMentions.push(now);
        everyoneMentions.set(userId, recentMentions);

        // Vérifier si l'utilisateur a dépassé la limite
        if (recentMentions.length > MAX_MENTIONS) {
            try {
                // Supprimer le message
                await message.delete().catch(() => {});

                // Bannir l'utilisateur
                const reason = `Anti-Everyone: ${recentMentions.length} mentions @everyone/@here en ${TIME_WINDOW / 1000} secondes`;
                
                await message.guild.members.ban(userId, { 
                    reason: reason,
                    deleteMessageSeconds: 60 * 60 * 24 // Supprimer les messages des dernières 24h
                });

                // Log dans le salon dédié
                const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🚨 Anti-Everyone - Bannissement automatique')
                        .setDescription(`**Utilisateur:** ${message.author.tag} (${message.author.id})\n**Raison:** ${reason}`)
                        .addFields(
                            { name: 'Mentions détectées', value: `${recentMentions.length} mentions`, inline: true },
                            { name: 'Temps écoulé', value: `${TIME_WINDOW / 1000} secondes`, inline: true },
                            { name: 'Salon', value: `${message.channel}`, inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: 'Soruden Security' });

                    await logChannel.send({ embeds: [logEmbed] });
                }

                // Nettoyer le stockage
                everyoneMentions.delete(userId);

                console.log(`[Anti-Everyone] ${message.author.tag} banni pour spam @everyone`);

            } catch (error) {
                console.error('[Anti-Everyone] Erreur lors du bannissement:', error);
            }
        } else if (recentMentions.length === MAX_MENTIONS) {
            // Avertissement juste avant le ban
            try {
                await message.delete().catch(() => {});
                
                const warningEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Avertissement - Anti-Everyone')
                    .setDescription(`${message.author}, vous avez utilisé **${MAX_MENTIONS} mentions @everyone/@here** en moins de ${TIME_WINDOW / 1000} secondes.\n\n**Une mention supplémentaire entraînera un bannissement automatique.**`)
                    .setTimestamp();

                await message.channel.send({ embeds: [warningEmbed] }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 10000);
                });

            } catch (error) {
                console.error('[Anti-Everyone] Erreur avertissement:', error);
            }
        }
    }
};
