import 'dotenv/config';
import bolt from '@slack/bolt';
const { App, LogLevel } = bolt;
import fs from 'fs';
import path from 'path';

// ── ENV ────────────────────────────────────────────────────────────────────────
const botToken = process.env.SLACK_BOT_TOKEN;
const appToken = process.env.SLACK_APP_TOKEN;
if (!botToken || !appToken) {
  console.error('Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN in .env');
  process.exit(1);
}
const STANDUP_CHANNEL_ID = process.env.STANDUP_CHANNEL_ID || '';
const STANDUP_COPY_CHANNEL_NAME = process.env.STANDUP_COPY_CHANNEL_NAME || '';

// ── Simple JSON storage (“brain”) ─────────────────────────────────────────────
const DATA_DIR = path.resolve(process.cwd(), 'data');
const KV_FILE = path.join(DATA_DIR, 'kv.json');
function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(KV_FILE)) fs.writeFileSync(KV_FILE, JSON.stringify({}), 'utf8');
}
async function kvLoad() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(KV_FILE, 'utf8')); } catch { return {}; }
}
async function kvSave(obj) {
  ensureFile();
  fs.writeFileSync(KV_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = new App({ token: botToken, appToken, socketMode: true, logLevel: LogLevel.INFO });

// resolve standup channel by ID or name
let resolvedStandupChannelId = STANDUP_CHANNEL_ID;
async function resolveStandupChannel(client) {
  if (resolvedStandupChannelId) return resolvedStandupChannelId;
  if (!STANDUP_COPY_CHANNEL_NAME) return '';
  try {
    let cursor;
    do {
      const res = await client.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel',
        cursor
      });
      for (const ch of res.channels || []) {
        if (ch.name === STANDUP_COPY_CHANNEL_NAME) {
          resolvedStandupChannelId = ch.id;
          return resolvedStandupChannelId;
        }
      }
      cursor = res.response_metadata?.next_cursor;
    } while (cursor);
  } catch (e) { console.error('resolveStandupChannel:', e); }
  return '';
}

// ── helpers ───────────────────────────────────────────────────────────────────
const code = s => '```' + s + '```';
const memegen = (template, top='_', bottom='_') => {
  const slug = s => (s || '_')
    .replace(/\s+/g,'_').replace(/\//g,'~s')
    .replace(/\?/g,'~q').replace(/%/g,'~p').replace(/#/g,'~h');
  return `https://api.memegen.link/images/${encodeURIComponent(template)}/${slug(top)}/${slug(bottom)}.png`;
};
function safeEval(expr) {
  const cleaned = (expr || '').replace(/\s+/g,'').replace(/\^/g,'**');
  if (!/^[0-9+\-*/%.()**]+$/.test(cleaned)) throw new Error('Invalid characters');
  // eslint-disable-next-line no-new-func
  return Function(`'use strict'; return (${cleaned});`)();
}

// ── HUBOT-STYLE LISTENERS (message regex) ─────────────────────────────────────
app.message(/^#standup\b/i, async ({ message, client }) => {
  const text = (message.text || '').replace(/^#standup\s*/i, '');
  const user = message.user ? `<@${message.user}>` : 'someone';
  const chId = await resolveStandupChannel(client);
  if (!chId) return;
  try {
    await client.chat.postMessage({ channel: chId, text: `*${user}* standup: ${text}` });
  } catch (e) { console.error('standup mirror error:', e); }
});

app.message(/^(?:hubot\s+)?help$/i, async ({ say }) => {
  await say([
    '*CFPBot (Slack, Hubot-style + Slash)*',
    '`hubot help` – this help',
    '`hubot rules` – show rules',
    '`highfive @user` – ✋',
    '`#standup <text>` – copy to standup channel',
    '`map me <query>` – Google Maps link',
    '`math <expr>` – evaluate arithmetic',
    '`meme me <template> ; <top> ; <bottom>` – memegen link',
    '`translate to <lang> <text>` – Google Translate link',
    '`youtube <query>` – YouTube search link',
    '`cfgov search <query>` – search consumerfinance.gov',
    '`remember <key> is <value>` / `what is <key>` / `forget <key>` – simple brain',
    'Slash equivalents: `/help`, `/standup`, `/math`, `/meme`, `/translate`, `/maps`, `/youtube`, `/searchcfgov`, `/kv`'
  ].join('\n'));
});
app.message(/^(?:hubot\s+)?rules$/i, async ({ say }) => {
  await say('Be kind, be respectful, keep PII out of chats, follow Slack policies.');
});
app.message(/^(?:hubot\s+)?highfive\s+(.+)$/i, async ({ context, say }) => {
  const target = context.matches[1] || '';
  await say(`:hand: High five ${target.trim()}!`);
});
app.message(/^map\s+me\s+(.+)$/i, async ({ context, say }) => {
  const q = context.matches[1];
  await say(`<https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}|Open in Google Maps>`);
});
app.message(/^math\s+(.+)$/i, async ({ context, say }) => {
  try { const v = safeEval(context.matches[1]); await say(code(`${context.matches[1]} = ${v}`)); }
  catch { await say('Could not evaluate. Allowed: numbers and + - * / % ( ) ^ .'); }
});
app.message(/^meme(?:\s+me)?\s+(.+)$/i, async ({ context, say }) => {
  const parts = context.matches[1].split(';').map(s => s.trim());
  await say(memegen(parts[0] || 'drake', parts[1] || '_', parts[2] || '_'));
});
app.message(/^translate\s+to\s+([a-z]{2,})\s+(.+)$/i, async ({ context, say }) => {
  const lang = context.matches[1], text = context.matches[2];
  await say(`<https://translate.google.com/?sl=auto&tl=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}&op=translate|Translate>`);
});
app.message(/^youtube\s+(.+)$/i, async ({ context, say }) => {
  const q = context.matches[1];
  await say(`<https://www.youtube.com/results?search_query=${encodeURIComponent(q)}|YouTube results>`);
});
app.message(/^cfgov\s+search\s+(.+)$/i, async ({ context, say }) => {
  const q = context.matches[1];
  await say(`<https://www.consumerfinance.gov/search/?q=${encodeURIComponent(q)}|CFPB search: “${q}”>`);
});
app.message(/^treat\s+yo\s+self$|^treatyoself$/i, async ({ say }) => {
  const ideas = ['☕ Break','🚶 Walk','🎧 Music','🍫 Small treat','📚 One page'];
  await say(ideas[Math.floor(Math.random()*ideas.length)]);
});
// memory
app.message(/^remember\s+(.+?)\s+is\s+(.+)$/i, async ({ context, say }) => {
  const key = context.matches[1].trim().toLowerCase();
  const value = context.matches[2].trim();
  const store = await kvLoad(); store[key] = value; await kvSave(store);
  await say(`Okay, I will remember *${key}*.`);
});
app.message(/^what\s+is\s+(.+?)\??$/i, async ({ context, say }) => {
  const key = context.matches[1].trim().toLowerCase();
  const store = await kvLoad();
  if (Object.prototype.hasOwnProperty.call(store, key)) await say(`*${key}* is ${store[key]}`);
  else await say(`I don't have *${key}* yet.`);
});
app.message(/^forget\s+(.+)$/i, async ({ context, say }) => {
  const key = context.matches[1].trim().toLowerCase();
  const store = await kvLoad(); delete store[key]; await kvSave(store);
  await say(`Forgot *${key}*.`);
});

// ── SLASH COMMANDS ────────────────────────────────────────────────────────────
app.command('/help', async ({ ack, respond }) => {
  await ack();
  await respond({ response_type: 'ephemeral', text: 'Try `/standup`, `/math`, `/meme`, `/translate`, `/maps`, `/youtube`, `/searchcfgov`, `/kv` (and Hubot-style text like `#standup ...`).' });
});
app.command('/rules', async ({ ack, respond }) => { await ack(); await respond('Be kind, be respectful, keep PII out of chats, follow Slack policies.'); });
app.command('/highfive', async ({ ack, respond, command }) => { await ack(); await respond(`:hand: High five ${command.text || 'there'}!`); });
app.command('/standup', async ({ ack, respond, command, client }) => {
  await ack();
  const text = command.text || '(no text)'; await respond(`Thanks! Logged your standup: “${text}”`);
  const chId = await resolveStandupChannel(client); if (!chId) return;
  try { await client.chat.postMessage({ channel: chId, text: `*${command.user_name}* standup: ${text}` }); } catch (e) { console.error('standup mirror error:', e); }
});
app.command('/searchcfgov', async ({ ack, respond, command }) => { await ack(); const q = command.text || ''; await respond(`<https://www.consumerfinance.gov/search/?q=${encodeURIComponent(q)}|Search results for “${q}”>`); });
app.command('/maps', async ({ ack, respond, command }) => { await ack(); const q = command.text || ''; await respond(`<https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}|Open in Google Maps>`); });
app.command('/math', async ({ ack, respond, command }) => { await ack(); try { const v = safeEval(command.text || ''); await respond(code(`${command.text} = ${v}`)); } catch { await respond({ response_type: 'ephemeral', text: 'Could not evaluate. Allowed: numbers and + - * / % ( ) ^ .' }); } });
app.command('/meme', async ({ ack, respond, command }) => { await ack(); const [template='drake', top='_', ...rest] = (command.text||'').split(' '); const bottom = rest.join(' ') || '_'; await respond(memegen(template, top, bottom)); });
app.command('/translate', async ({ ack, respond, command }) => { await ack(); const [lang, ...rest] = (command.text||'').split(' '); if (!lang || !rest.length) return respond({ response_type:'ephemeral', text:'Usage: /translate <lang> <text>' }); const text = rest.join(' '); await respond(`<https://translate.google.com/?sl=auto&tl=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}&op=translate|Translate>`); });
app.command('/youtube', async ({ ack, respond, command }) => { await ack(); const q = command.text || ''; await respond(`<https://www.youtube.com/results?search_query=${encodeURIComponent(q)}|YouTube results>`); });
app.command('/treat', async ({ ack, respond }) => { await ack(); const ideas = ['☕ Break','🚶 Walk','🎧 Music','🍫 Small treat','📚 One page']; await respond(ideas[Math.floor(Math.random()*ideas.length)]); });
app.command('/kv', async ({ ack, respond, command }) => {
  await ack();
  const [sub, key, ...rest] = (command.text || '').split(' ');
  const store = await kvLoad();
  if (sub === 'get')      await respond(`*${key}* = ${Object.prototype.hasOwnProperty.call(store, key) ? store[key] : '(not set)'}`);
  else if (sub === 'set') { store[key] = rest.join(' '); await kvSave(store); await respond(`Saved *${key}*.`); }
  else if (sub === 'del' || sub === 'delete') { delete store[key]; await kvSave(store); await respond(`Deleted *${key}*.`); }
  else await respond({ response_type:'ephemeral', text:'Usage: /kv get <key> | /kv set <key> <value> | /kv del <key>' });
});

// App Home
app.event('app_home_opened', async ({ event, client }) => {
  try {
    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: '*CFPBot (Slack: Hubot + Slash)*' } },
          { type: 'section', text: { type: 'mrkdwn', text: 'Use Hubot-style text (`#standup`, `map me ...`, `hubot help`) *and* slash commands (`/standup`, `/math`, etc.).' } },
        ],
      },
    });
  } catch (e) { console.error(e); }
});

(async () => {
  await app.start();
  console.log('CFPBot (Slack) running in Socket Mode (Hubot + Slash, No Redis).');
})();