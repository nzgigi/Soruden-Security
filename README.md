# Soruden Security

Soruden Security is an advanced **security bot** for Discord designed to protect servers against raids, newly created alternate accounts, permission abuse, and webhook abuse.  
It is primarily used for the Soruden community around the game Trove, but can be adapted to other servers.

> **Note:** All text content in the bot's code (messages, embeds, DMs, etc.) is in **French**, as the developer and target community are French-speaking.

## Main Features

### Anti-alt (recent accounts)

- Automatically kicks members whose Discord account is less than 7 days old.
- If a user attempts to join 3 times with an account that's too recent, they are automatically banned.
- A direct message (DM) is sent to the member after each attempt to explain the reason.

### Anti admin permission

- Automatically detects when someone grants administrator permission to another member.
- The administrator permission is immediately removed from the member who received it.
- An alert is sent to a dedicated channel with:
  - An **OK** button to validate the action.
  - A button to remove admin permission or ban both people involved (depending on the implemented logic).

### Anti-webhook

- Automatic deletion of any newly created webhook on the server (by default).
- An alert is sent to a dedicated channel with:
  - An **OK** button to whitelist the person and allow them to create **one** webhook.
  - A button to ban the person if the webhook creation is deemed malicious.

### Anti-everyone mention

- Detects and prevents @everyone / @here mention spam.
- Tracks mentions per user within a configurable time window (default: 60 seconds).
- After 2 mentions: warning message sent and message deleted.
- After 3 mentions: automatic ban with detailed logging.
- All actions are logged to a dedicated channel with timestamp, user info, and reason.

### Interaction security

- Only Discord IDs specified in `ALLOWED_USERS` (in the `.env` file) can interact with buttons and certain sensitive actions of the bot.
- This restricts the use of critical features to trusted administrators only.

## Available Commands

### Security / Staff Commands

- `admins.js`  
  Displays the list of users who have administrator permission on the server.

- `audit-perms.js`  
  Analyzes server roles and permissions and highlights what is sensitive or potentially dangerous (roles with too many permissions, etc.).

### Slash Commands

- `/help`  
  Displays the list of available commands and/or a description of the main features of the bot.

- `/bot`  
  Displays the list of all bots present on the server (or general information about bots, depending on your implementation).

## Tech Stack

- Node.js
- discord.js (v14+)
- Secret management via `.env` file (token, allowed IDs, etc.)