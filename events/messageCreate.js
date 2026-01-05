require('dotenv').config();
const { Events, EmbedBuilder } = require('discord.js');

// -----------------------------
// ⚡ Variables depuis le .env
// -----------------------------
const FORBIDDEN_FILES_LOG_CHANNEL_ID = process.env.FORBIDDEN_FILES_LOG_CHANNEL_ID;
const FORBIDDEN_FILES_TIMEOUT_MINUTES = parseInt(process.env.FORBIDDEN_FILES_TIMEOUT_MINUTES) || 10;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

// -----------------------------
// ⚡ Fichiers interdits
// -----------------------------
const FORBIDDEN_EXTENSIONS = [
  '.ct',
  '.exe',
  '.dll',
  '.sys',
  '.bat',
  '.cmd',
  '.ps1'
];

// -----------------------------
// 🔥 Event MessageCreate
// -----------------------------
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore bots ou messages hors serveur
    if (!message.guild) return;
    if (message.author.bot) return;

    // 🔔 Réagir si le bot est ping
    if (message.mentions.has(message.client.user)) {
        try {
            await message.react('👀'); // Emoji à changer si tu veux
        } catch (err) {
            console.error('Impossible de réagir au message :', err);
        }
    }

    // Vérifie s'il y a des fichiers attachés
    if (message.attachments.size === 0) return;

    // Ignore les utilisateurs staff
    if (message.member.roles.cache.has(STAFF_ROLE_ID)) return;

    for (const attachment of message.attachments.values()) {
      const fileName = attachment.name.toLowerCase();

      // Vérifie si le fichier est interdit
      const isForbidden = FORBIDDEN_EXTENSIONS.some(ext =>
        fileName.endsWith(ext) || fileName.includes(ext + '.')
      );

      if (!isForbidden) continue;

      // -----------------------------
      // 🗑️ Supprime le message
      // -----------------------------
      await message.delete().catch(() => {});

      // -----------------------------
      // ⏱️ Timeout utilisateur
      // -----------------------------
      if (message.member.moderatable) {
        await message.member.timeout(
          FORBIDDEN_FILES_TIMEOUT_MINUTES * 60 * 1000,
          `Envoi de fichier interdit (${attachment.name})`
        ).catch(() => {});
      }

      // -----------------------------
      // 📜 Log staff
      // -----------------------------
      const logChannel = message.guild.channels.cache.get(FORBIDDEN_FILES_LOG_CHANNEL_ID);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🚨 Fichier interdit détecté')
          .setColor('Red')
          .addFields(
            { name: 'Utilisateur', value: `${message.author} (${message.author.id})` },
            { name: 'Fichier', value: attachment.name },
            { name: 'Taille', value: `${(attachment.size / 1024).toFixed(2)} KB` },
            { name: 'Salon', value: `${message.channel}` },
            { name: 'Sanction', value: `Timeout ${FORBIDDEN_FILES_TIMEOUT_MINUTES} minutes` }
          )
          .setTimestamp();

        logChannel.send({ embeds: [embed] });
      }

      // -----------------------------
      // 📩 DM utilisateur
      // -----------------------------
      message.author.send(
        `⛔ Ton message a été supprimé : l'envoi de fichiers exécutables ou Cheat Engine est interdit.\n\nFichier : **${attachment.name}**`
      ).catch(() => {});

      break; // Stop après le premier fichier interdit
    }
  }
};
