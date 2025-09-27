# CFPBot (Slack) — Hubot-style + Slash (No Redis)

A modern Slack bot that behaves like your old Hubot (regex “hear” triggers) **and** supports Slash commands — running in **Socket Mode** with **no Redis** (uses `data/kv.json` for simple persistence).

## Features
- Hubot-style listeners:
  - `hubot help`, `hubot rules`, `highfive @user`
  - `#standup <text>` (mirrors into a configured channel)
  - `map me <query>`, `math <expr>`, `meme me <template> ; <top> ; <bottom>`
  - `translate to <lang> <text>`, `youtube <query>`, `cfgov search <query>`
  - Simple brain: `remember <key> is <value>`, `what is <key>`, `forget <key>`
- Slash commands:
  - `/help`, `/rules`, `/highfive`, `/standup`, `/searchcfgov`, `/maps`, `/math`, `/meme`, `/translate`, `/youtube`, `/treat`, `/kv`

## Setup (no public URL needed)
1. Create a Slack app at https://api.slack.com/apps → *From scratch*; install to your workspace.
2. **Socket Mode**: Enable; create an **App-Level Token** with `connections:write` (xapp-…).
3. **OAuth scopes (bot)**: `chat:write`, `commands`, `app_mentions:read`, `channels:history` (plus `groups:history` / `im:history` if needed).
4. **Event Subscriptions (bot)**: `app_home_opened`, `message.channels` (add `message.groups` / `message.im` if needed).
5. (Optional) Define **Slash Commands** in the app config: `/help`, `/rules`, `/highfive`, `/standup`, `/searchcfgov`, `/maps`, `/math`, `/meme`, `/translate`, `/youtube`, `/treat`, `/kv`.
6. Configure and run:
   ```bash
   cp .env.sample .env
   # fill SLACK_BOT_TOKEN (xoxb-...), SLACK_APP_TOKEN (xapp-...)
   # optionally set STANDUP_CHANNEL_ID or STANDUP_COPY_CHANNEL_NAME
   npm install
   npm start
   ```

## Environment
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
STANDUP_CHANNEL_ID=C12345678         # optional
STANDUP_COPY_CHANNEL_NAME=standup    # optional (channel name, no '#')
```

## Notes
- Data is stored in `data/kv.json`. Delete the file to reset memory.
- To target private channels, invite the bot and add `groups:history` to scopes.