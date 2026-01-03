const { Events, EmbedBuilder, PermissionsBitField } = require("discord.js");
const antiAltConfig = require("../config/antialt");
const joinStore = require("../utils/antiAltStore");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      // --------- DEBUG (à garder pour tester) ---------
      console.log("[AntiAlt] MEMBER JOIN:", member.user.tag);

      // --------- ACTIVATION ---------
      if (!antiAltConfig.enabled) return;

      // --------- PERMISSIONS BOT ---------
      const botMember = member.guild.members.me;
      if (!botMember) return;

      const neededPerms = [
        PermissionsBitField.Flags.KickMembers,
        PermissionsBitField.Flags.BanMembers
      ];

      if (!botMember.permissions.has(neededPerms)) {
        console.log("[AntiAlt] Missing permissions");
        return;
      }

      // --------- AGE DU COMPTE ---------
      const accountAgeDays = Math.floor(
        (Date.now() - member.user.createdAt) / (1000 * 60 * 60 * 24)
      );

      console.log("[AntiAlt] Account age:", accountAgeDays);

      // Si le compte est assez ancien → on ignore
      if (accountAgeDays >= antiAltConfig.minAccountAgeDays) return;

      // --------- COMPTE DES JOINS ---------
      const key = `${member.guild.id}-${member.id}`;
      const joins = (joinStore.get(key) || 0) + 1;
      joinStore.set(key, joins);

      console.log("[AntiAlt] Join count:", joins);

      const logChannel = member.guild.channels.cache.get(
        antiAltConfig.logChannelId
      );

      // --------- 3e JOIN = BAN ---------
      if (joins >= 3) {
        await sendDM(
          member,
          `🚫 **Accès refusé**\n\nTon compte a **${accountAgeDays} jours**.\nTu as rejoint trop de fois ce serveur.\n\n**Sanction : BAN définitif**`
        );

        await member.ban({
          reason: `Anti-Alt : 3 joins (${accountAgeDays}j)`
        });

        sendLog(logChannel, member, accountAgeDays, joins, "BAN");
        return;
      }

      // --------- 1er & 2e JOIN = KICK ---------
      await sendDM(
        member,
        `⚠️ **Accès restreint**\n\nTon compte a **${accountAgeDays} jours**.\nMinimum requis : **${antiAltConfig.minAccountAgeDays} jours**.\n\nTentative **${joins}/3**`
      );

      await member.kick(
        `Anti-Alt : join ${joins}/3 (${accountAgeDays}j)`
      );

      sendLog(logChannel, member, accountAgeDays, joins, "KICK");

    } catch (error) {
      console.error("[AntiAlt] ERROR :", error);
    }
  }
};

// ================== UTILS ==================

async function sendDM(member, message) {
  try {
    await member.send(message);
  } catch {
    console.log("[AntiAlt] DM fermé pour", member.user.tag);
  }
}

function sendLog(channel, member, age, joins, action) {
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Anti-Alt progressif")
    .setColor(action === "BAN" ? "Red" : "Orange")
    .addFields(
      { name: "Utilisateur", value: `${member.user.tag} (${member.id})` },
      { name: "Âge du compte", value: `${age} jours`, inline: true },
      { name: "Tentative", value: `${joins}/3`, inline: true },
      { name: "Action", value: action, inline: true }
    )
    .setTimestamp();

  channel.send({ embeds: [embed] });
}
