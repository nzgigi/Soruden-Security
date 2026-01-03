const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');

// Cache des invites du serveur
const inviteCache = new Map();

// Stockage des joins récents par invite (pour détecter raids)
const recentJoins = new Map();

// Configuration
const RAID_THRESHOLD = 10; // Nombre de joins
const RAID_TIME_WINDOW = 10000; // en 10 secondes = raid
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;
const JOIN_LOG_CHANNEL_ID = process.env.JOIN_LOG_CHANNEL_ID; // Nouveau channel pour logs normaux

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log('📡 Initialisation du système d\'invite tracking...');

        // Charger toutes les invites au démarrage
        for (const guild of client.guilds.cache.values()) {
            try {
                const invites = await guild.invites.fetch();
                const inviteMap = new Map();
                
                invites.forEach(invite => {
                    inviteMap.set(invite.code, {
                        uses: invite.uses,
                        inviter: invite.inviter,
                        code: invite.code,
                        createdAt: invite.createdTimestamp,
                        maxUses: invite.maxUses,
                        expiresAt: invite.expiresTimestamp
                    });
                });
                
                inviteCache.set(guild.id, inviteMap);
                console.log(`✅ ${invites.size} invites chargées pour ${guild.name}`);
            } catch (error) {
                console.error(`Erreur chargement invites pour ${guild.name}:`, error);
            }
        }

        console.log('✅ Invite tracking initialisé');

        // Event: Nouvelle invite créée
        client.on(Events.InviteCreate, async (invite) => {
            const guildInvites = inviteCache.get(invite.guild.id) || new Map();
            guildInvites.set(invite.code, {
                uses: 0,
                inviter: invite.inviter,
                code: invite.code,
                createdAt: invite.createdTimestamp,
                maxUses: invite.maxUses,
                expiresAt: invite.expiresTimestamp
            });
            inviteCache.set(invite.guild.id, guildInvites);
            
            console.log(`➕ Nouvelle invite créée: ${invite.code} par ${invite.inviter?.tag}`);
        });

        // Event: Invite supprimée
        client.on(Events.InviteDelete, async (invite) => {
            const guildInvites = inviteCache.get(invite.guild.id);
            if (guildInvites) {
                guildInvites.delete(invite.code);
            }
            console.log(`➖ Invite supprimée: ${invite.code}`);
        });

        // Event: Membre rejoint
        client.on(Events.GuildMemberAdd, async (member) => {
            try {
                // Récupérer les invites actuelles
                const newInvites = await member.guild.invites.fetch();
                const oldInvites = inviteCache.get(member.guild.id) || new Map();

                // Trouver quelle invite a été utilisée
                let usedInvite = null;
                
                for (const [code, newInvite] of newInvites) {
                    const oldInvite = oldInvites.get(code);
                    
                    if (oldInvite && newInvite.uses > oldInvite.uses) {
                        usedInvite = {
                            code: code,
                            inviter: newInvite.inviter,
                            uses: newInvite.uses,
                            maxUses: newInvite.maxUses,
                            createdAt: oldInvite.createdAt
                        };
                        
                        // Mettre à jour le cache
                        oldInvites.set(code, {
                            uses: newInvite.uses,
                            inviter: newInvite.inviter,
                            code: code,
                            createdAt: oldInvite.createdAt,
                            maxUses: newInvite.maxUses,
                            expiresAt: newInvite.expiresTimestamp
                        });
                        break;
                    }
                }

                // Mettre à jour le cache complet
                inviteCache.set(member.guild.id, oldInvites);

                // ========== LOG BASIQUE (TOUJOURS) ==========
                await logMemberJoin(member, usedInvite);

                // ========== DÉTECTION DE RAID ==========
                if (usedInvite) {
                    await checkForRaid(member, usedInvite);
                }

            } catch (error) {
                console.error('Erreur tracking invite:', error);
            }
        });
    }
};

// ========== FONCTION: Log basique de join ==========
async function logMemberJoin(member, usedInvite) {
    const joinLogChannel = member.guild.channels.cache.get(JOIN_LOG_CHANNEL_ID);
    if (!joinLogChannel) return;

    const accountAge = Date.now() - member.user.createdTimestamp;
    const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
    const hasAvatar = member.user.displayAvatarURL() !== member.user.defaultAvatarURL;

    const embed = new EmbedBuilder()
        .setColor(hasAvatar && accountAgeDays > 30 ? '#00ff00' : '#ffa500')
        .setTitle('✅ Nouveau Membre')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: '👤 Membre', value: `${member.user.tag}\n(${member.id})`, inline: true },
            { name: '📅 Compte créé', value: `Il y a ${accountAgeDays} jours`, inline: true },
            { name: '🖼️ Avatar', value: hasAvatar ? 'Oui ✅' : 'Non ❌', inline: true }
        );

    if (usedInvite) {
        const inviteAge = Date.now() - usedInvite.createdAt;
        const inviteAgeMinutes = Math.floor(inviteAge / (1000 * 60));
        
        embed.addFields(
            { name: '👋 Invité par', value: usedInvite.inviter ? `${usedInvite.inviter.tag}\n(${usedInvite.inviter.id})` : 'Inconnu', inline: true },
            { name: '🔗 Code invite', value: `\`${usedInvite.code}\``, inline: true },
            { name: '📊 Utilisations', value: `${usedInvite.uses}${usedInvite.maxUses ? `/${usedInvite.maxUses}` : '/∞'}`, inline: true },
            { name: '⏱️ Invite créée', value: `Il y a ${inviteAgeMinutes} min`, inline: true }
        );
    } else {
        embed.addFields({ name: '🔗 Invite', value: 'Inconnue (vanity URL ou widget)', inline: false });
    }

    embed.setTimestamp();
    embed.setFooter({ text: 'Soruden Security - Invite Tracking' });

    await joinLogChannel.send({ embeds: [embed] });
}

// ========== FONCTION: Détection de raid ==========
async function checkForRaid(member, usedInvite) {
    if (!usedInvite || !usedInvite.inviter) return;

    const inviteCode = usedInvite.code;
    const now = Date.now();

    // Récupérer les joins récents pour cette invite
    if (!recentJoins.has(inviteCode)) {
        recentJoins.set(inviteCode, []);
    }

    const joins = recentJoins.get(inviteCode);

    // Nettoyer les vieux joins (hors de la fenêtre de temps)
    const recentOnes = joins.filter(j => now - j.timestamp < RAID_TIME_WINDOW);

    // Ajouter le join actuel
    recentOnes.push({
        member: member,
        timestamp: now
    });

    recentJoins.set(inviteCode, recentOnes);

    // ========== VÉRIFIER SI RAID ==========
    if (recentOnes.length >= RAID_THRESHOLD) {
        await triggerRaidAlert(member.guild, usedInvite, recentOnes);
        
        // Nettoyer pour éviter spam d'alertes
        recentJoins.delete(inviteCode);
    }
}

// ========== FONCTION: Alerte raid ==========
async function triggerRaidAlert(guild, usedInvite, joins) {
    const alertChannel = guild.channels.cache.get(ALERT_CHANNEL_ID);
    if (!alertChannel) return;

    // Analyser les membres suspects
    let suspiciousCount = 0;
    let noAvatarCount = 0;
    let recentAccountCount = 0;

    const membersList = joins.map(j => {
        const accountAge = Date.now() - j.member.user.createdTimestamp;
        const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
        const hasAvatar = j.member.user.displayAvatarURL() !== j.member.user.defaultAvatarURL;

        if (accountAgeDays < 7) recentAccountCount++;
        if (!hasAvatar) noAvatarCount++;
        if (accountAgeDays < 7 || !hasAvatar) suspiciousCount++;

        const status = (accountAgeDays < 7 || !hasAvatar) ? '❌' : '✅';
        return `${status} ${j.member.user.tag} (compte ${accountAgeDays}j${!hasAvatar ? ', pas avatar' : ''})`;
    });

    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚨 RAID DÉTECTÉ - ACTION REQUISE')
        .setDescription(`**Inviter:** ${usedInvite.inviter.tag} (${usedInvite.inviter.id})\n**Invite:** \`${usedInvite.code}\`\n**Créée:** <t:${Math.floor(usedInvite.createdAt / 1000)}:R>`)
        .addFields(
            { name: '📊 Statistiques', value: `**${joins.length} membres** en ${RAID_TIME_WINDOW / 1000} secondes`, inline: false },
            { name: '⚠️ Suspects', value: `${suspiciousCount}/${joins.length} suspects\n${recentAccountCount} comptes < 7 jours\n${noAvatarCount} sans avatar`, inline: false },
            { name: '👥 Membres entrés', value: membersList.slice(0, 10).join('\n') + (membersList.length > 10 ? `\n... et ${membersList.length - 10} autres` : ''), inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Soruden Security - Raid Detection' });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`raid_banall_${usedInvite.inviter.id}_${usedInvite.code}`)
            .setLabel('🔨 Ban inviter + tous')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`raid_kicksuspects_${usedInvite.code}`)
            .setLabel('⚠️ Kick suspects')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`raid_ignore_${usedInvite.code}`)
            .setLabel('✅ Faux positif')
            .setStyle(ButtonStyle.Success)
    );

    const allowedUsers = process.env.ALLOWED_USERS.split(',');
    await alertChannel.send({
        content: allowedUsers.map(id => `<@${id}>`).join(' '),
        embeds: [embed],
        components: [buttons]
    });

    console.log(`🚨 RAID DÉTECTÉ: ${joins.length} membres via invite ${usedInvite.code}`);
}
