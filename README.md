# Soruden Security (Discord Bot)

Soruden Security is a private, security-focused Discord bot built for the Soruden community (Trove).  
Tech stack: Node.js + discord.js v14+.  
Note: All bot messages (embeds, replies, DMs) are in **French**.

- Repository: https://github.com/nzgigi/Soruden-Security
- Contact: Discord `gmnz`

---

## Main Features

- **Anti-alt system**
  - Kicks accounts younger than 7 days
  - Bans after 3 attempts

- **Anti-admin permission**
  - Detects and blocks unauthorized admin role assignments
  - Uses audit log context to identify the executor

- **Anti-webhook**
  - Detects and manages unauthorized webhook creation
  - Dedicated logging for webhook-related events

- **Anti-@everyone / @here**
  - Prevents @everyone/@here spam
  - Bans after 3 mentions within 60 seconds

- **Invite Tracking & Raid Detection (NEW)**
  - Tracks all joins with full traceability
  - Detects invite-based mass-join raids (configurable)
  - Two-channel logging (joins vs security alerts)
  - Admin response buttons (ban all / kick suspects / false positive)
  - Full audit trail of joins and staff actions

---

## Invite Tracking & Raid Detection (NEW)

This module provides a complete audit trail of member joins and automatically detects invite-based raids.

### Core Functionality (full join traceability)
- Logs **every** member join (suspicious or not)
- Captures full details:
  - Inviter (who invited them)
  - Invite code used
  - Account age
  - Avatar presence (no avatar = suspicious)
  - Useful join context for moderation/auditing
- Maintains an internal cache of server invites to accurately identify which invite was used on each join

### Raid Detection (configurable thresholds)
- Triggers an alert when many users join through the **same invite** in a short time window
- Default detection settings:
  - 10+ joins
  - within 10 seconds
- Suspicion analysis considers:
  - Account age (e.g., < 7 days = suspicious)
  - No avatar = suspicious
  - Username pattern signals (basic pattern detection)

### Two-channel Logging System
To avoid spamming alerts while keeping full traceability:
- `JOIN_LOG_CHANNEL_ID`:
  - Logs **all joins** in a clean, non-noisy format
  - Keeps a complete audit trail (normal activity included)
- `ALERT_CHANNEL_ID`:
  - Security alerts only (raid detections, suspicious waves)
  - Includes interactive moderation actions (buttons)

### Admin Response Buttons (on raid alert)
When a raid is detected, the alert includes buttons:
- **Ban inviter + all members**
  - Bans the user who created the invite and everyone who joined via it during the raid window
- **Kick suspects only**
  - Kicks only suspicious members (e.g., new accounts and/or no avatar)
- **False positive**
  - Marks the event as safe (useful for streamer raids or community events)

All actions are logged (who executed them and when).

### Protection Scenarios Covered
- Classic bot raids (many fresh accounts joining quickly)
- Server advertising / spam attacks (waves joining via the same invite to spam)
- Compromised accounts (a normally inactive member suddenly invites many people)
- Legitimate mass joins can be allowed via “False positive”

---

## Requirements

- Node.js (LTS recommended)
- A Discord application/bot created in the Discord Developer Portal
- discord.js v14+

---

## Installation

1) Clone the repository
```bash
git clone https://github.com/nzgigi/Soruden-Security.git
cd Soruden-Security
```

2) Install dependencies
```bash
npm install
```

3) Create your environment file
```bash
cp .env.example .env
```

4) Fill in `.env` (see below)

5) Start the bot
```bash
node .
```

(Optionally run with a process manager like PM2 or systemd in production.)

---

## Environment Variables (.env)

Example:
```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

# Whitelist of Discord user IDs allowed to execute administrative actions
# (alert buttons, sensitive commands, validations).
# Comma-separated (preferably without spaces).
ALLOWED_USERS=123456789012345678,987654321098765432

# Channels
ALERT_CHANNEL_ID=
WEBHOOK_LOG_CHANNEL_ID=
LOG_CHANNEL_ID=
JOIN_LOG_CHANNEL_ID=
```

### What each channel is for
- `LOG_CHANNEL_ID`: General security logs (anti-alt, anti-everyone/@here, anti-admin, etc.)
- `WEBHOOK_LOG_CHANNEL_ID`: Webhook security logs (creation/abuse management)
- `JOIN_LOG_CHANNEL_ID` (NEW): Logs **all** member joins (full invite tracking audit trail)
- `ALERT_CHANNEL_ID`: Security alerts only (raid detections + action buttons + staff actions)

---

## Required Gateway Intents

Enable these intents in the Developer Portal and in your bot configuration:

- Guilds
- GuildMembers
- GuildPresences
- GuildWebhooks
- GuildMessages
- MessageContent
- GuildInvites (NEW — required for invite tracking)

---

## Required Bot Permissions

Grant the bot (via role or server permissions):

- Manage Members (kick/ban)
- Manage Roles
- Manage Webhooks
- Manage Guild (required for invite tracking)
- Read/Send Messages in log channels
- View Audit Log

---

## Configuration

### Recommended logging setup
For best results, keep joins and alerts separated:
- `JOIN_LOG_CHANNEL_ID` = all joins (clean audit trail)
- `ALERT_CHANNEL_ID` = security incidents only (raids + buttons)

### Raid detection thresholds
You can customize thresholds in:
- `events/inviteTracking.js`

Default example:
```js
// events/inviteTracking.js
const RAID_THRESHOLD = 10;      // number of joins to trigger an alert
const RAID_TIME_WINDOW = 10000; // time window in milliseconds
```

---

## Warnings / Safety Notes

- Tune raid thresholds carefully to avoid false positives during legitimate events (streamer raids, announcements, community events)
- Always test on a test server first before deploying to production
- Ensure intents and permissions are correctly enabled; missing access can reduce detection accuracy or prevent actions

---

## Support / Contact

Private project for Soruden community use.  
Discord: `gmnz`
