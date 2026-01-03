const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const webhookWhitelist = require("../utils/webhookWhitelist");

module.exports = {
  name: Events.WebhooksUpdate,
  async execute(channel) {
    try {
      const guild = channel.guild;
      if (!guild) return;

      const botMember = guild.members.me;
      if (!botMember.permissions.has(['ViewAuditLog', 'ManageWebhooks'])) return;

      // Récupère le dernier audit log
      const entry = (await guild.fetchAuditLogs({ type: 50, limit: 1 })).entries.first();
      if (!entry) return;

      const executor = entry.executor;
      if (!executor || executor.bot) return; // Ignore les bots

      const key = `${guild.id}-${executor.id}`;

      // Vérifie la whitelist
      if (webhookWhitelist.has(key)) {
        const remaining = webhookWhitelist.get(key) - 1;
        if (remaining <= 0) webhookWhitelist.delete(key);
        else webhookWhitelist.set(key, remaining);

        return sendLog(channel, guild, executor, "✅ AUTORISÉ (Whitelist)", null);
      }

      // ========== SUPPRESSION DU WEBHOOK ==========
      const webhooks = await channel.fetchWebhooks();
      const createdWebhook = webhooks.find(wh => wh.owner.id === executor.id);

      if (createdWebhook) {
        await createdWebhook.delete("Anti-Webhook : création non autorisée");
        console.log(`🗑️ Webhook supprimé: ${createdWebhook.name} par ${executor.tag}`);
      }

      // Log après suppression
      await sendLog(channel, guild, executor, "🚨 SUPPRIMÉ (Non autorisé)", createdWebhook);

    } catch (err) {
      console.error("[AntiWebhook] ERROR:", err);
    }
  }
};

// ------------------- Fonction Log -------------------
async function sendLog(channel, guild, executor, status, webhook) {
  const logChannel = guild.channels.cache.get(process.env.WEBHOOK_LOG_CHANNEL_ID);
  if (!logChannel) {
    console.warn("[AntiWebhook] Canal log introuvable");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Anti-Webhook")
    .setColor(status.includes("AUTORISÉ") ? "Green" : "Red")
    .addFields(
      { name: "👤 Créateur", value: `${executor.tag} (\`${executor.id}\`)` },
      { name: "📍 Salon", value: `<#${channel.id}>`, inline: true },
      { name: "📌 Statut", value: status, inline: true }
    );

  if (webhook) {
    embed.addFields({ name: "🔗 Webhook supprimé", value: webhook.name });
  }

  embed.setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wh_ban_${executor.id}`)
      .setLabel("🔨 Ban le créateur")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`wh_allow_${executor.id}`)
      .setLabel("✅ Autoriser 1 webhook")
      .setStyle(ButtonStyle.Success)
  );

  await logChannel.send({ embeds: [embed], components: [row] });
}
