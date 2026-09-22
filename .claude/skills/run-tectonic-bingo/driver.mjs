// REPL driver for Tectonic Bingo (web app). Run under this repo's node_modules
// (playwright-core is an existing dependency, no extra install needed).
// Designed for agents: wrap in tmux, send-keys commands, capture-pane output.
//
// Assumes the dev server + client are already running (see SKILL.md "Run
// (agent path)") and the Chromium shared libs are bootstrapped (this file's
// `launch` command does that itself, via bootstrap-chromium-libs.sh, before
// first launch).
import { chromium } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const BASE_URL = process.env.APP_URL || 'http://localhost:5273';
const API_URL = process.env.API_URL || 'http://localhost:3101';
const LIBS_DIR = process.env.CHROMIUM_LIBS_DIR || path.join(os.homedir(), '.cache/tectonic-bingo/chromium-libs');

let browser = null;
let page = null;
const consoleLog = [];

function ensureChromiumLibs() {
  // Cheap check: does the marker exist. bootstrap script itself is
  // idempotent too, but this skips even spawning bash when already done.
  if (fs.existsSync(path.join(LIBS_DIR, '.ready'))) return;
  console.log('bootstrapping chromium shared libs (first run only)...');
  execFileSync('bash', [path.join(SKILL_DIR, 'bootstrap-chromium-libs.sh')], { stdio: 'inherit' });
}

const COMMANDS = {
  async launch() {
    if (browser) return console.log('already launched');
    ensureChromiumLibs();
    browser = await chromium.launch({
      args: ['--no-sandbox'],
      env: { ...process.env, LD_LIBRARY_PATH: LIBS_DIR },
    });
    page = await browser.newPage();
    page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) => consoleLog.push({ type: 'pageerror', text: err.message }));
    console.log('launched.');
  },

  async nav(urlPath) {
    if (!page) return console.log('ERROR: launch first');
    const url = /^https?:\/\//.test(urlPath || '') ? urlPath : BASE_URL + (urlPath || '/');
    await page.goto(url);
    await page.waitForLoadState('networkidle').catch(() => {});
    console.log('nav ->', page.url());
  },

  // Dev-only login shortcut (server/src/routes/auth.ts, gated on
  // DEV_LOGIN_ENABLED=true) - logs the browser's session cookie in as an
  // existing seeded user by discordId, skipping the real Discord OAuth
  // round trip. e2e/prepare-db.cjs seeds "e2e-admin" and "e2e-p1".."e2e-p5".
  async 'dev-login'(discordId) {
    if (!page) return console.log('ERROR: launch first');
    const res = await page.request.post(`${API_URL}/auth/dev-login`, { data: { discordId: discordId || 'e2e-admin' } });
    console.log('dev-login', discordId, '->', res.status());
    if (res.ok()) await COMMANDS.nav('/');
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f, fullPage: true });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.locator(sel).first().click(); console.log('click', sel, '-> OK'); }
    catch (e) { console.log('click', sel, '-> ERROR:', e.message.split('\n')[0]); }
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.getByText(text, { exact: false }).first().click(); console.log('click-text', JSON.stringify(text), '-> OK'); }
    catch (e) { console.log('click-text', JSON.stringify(text), '-> ERROR:', e.message.split('\n')[0]); }
  },

  async fill(sel, ...rest) {
    if (!page) return console.log('ERROR: launch first');
    const text = rest.join(' ');
    await page.locator(sel).first().fill(text);
    console.log('fill', sel, JSON.stringify(text));
  },

  async type(text) { if (page) await page.keyboard.type(text, { delay: 20 }); },
  async press(key) { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null,
    ));
  },

  console(filter) {
    const rows = filter === '--errors' ? consoleLog.filter((r) => r.type === 'error' || r.type === 'pageerror') : consoleLog;
    if (!rows.length) return console.log('(none)');
    for (const r of rows) console.log(`[${r.type}] ${r.text}`);
  },

  async quit() { if (browser) await browser.close().catch(() => {}); browser = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

// A piped heredoc delivers every line's 'line' event back-to-back, without
// waiting for this handler's previous async call to finish - so without a
// queue, `launch` / `nav` / `click` etc. all start concurrently instead of
// in order, and later commands fail with "launch first" because `launch`
// hasn't set `page` yet by the time they run. Chain everything through one
// promise so each command only starts once the previous has resolved.
let queue = Promise.resolve();
// Piped/file input hits EOF almost immediately (long before queued async
// commands like `launch` finish), and readline auto-closes itself right
// then. A `rl.prompt()` call after that throws ERR_USE_AFTER_CLOSE, which
// - unhandled - aborted that link in the chain and silently skipped every
// command still queued behind it. Guard every prompt call instead.
const safePrompt = () => { if (!rl.closed) rl.prompt(); };

rl.on('line', (line) => {
  queue = queue.then(async () => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    if (!cmd) return safePrompt();
    const fn = COMMANDS[cmd];
    if (!fn) { console.log('unknown:', cmd, '- try: help'); return safePrompt(); }
    try { await fn(...rest); } catch (e) { console.log('ERROR:', e.message); }
    if (cmd === 'quit') { process.exit(0); }
    safePrompt();
  });
});
// EOF (piped/redirected input) fires 'close' right after all 'line' events
// are synchronously registered onto `queue` - but real commands like
// `launch` take actual async time (spawning the browser). Without waiting
// for `queue` here first, this handler used to call process.exit(0) while
// `launch` was still in flight, killing it before it ever ran.
rl.on('close', async () => {
  await queue.catch(() => {});
  await COMMANDS.quit();
  process.exit(0);
});

console.log('tectonic-bingo driver - "help" for commands, "launch" to start');
rl.prompt();
