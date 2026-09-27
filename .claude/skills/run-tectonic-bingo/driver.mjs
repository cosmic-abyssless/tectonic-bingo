// REPL driver for Tectonic Bingo (web app). Run under this repo's node_modules
// (playwright-core is an existing dependency, no extra install needed).
// Pipe commands to stdin (see SKILL.md); the same on Windows and Linux.
//
// Two one-shot modes, used by the environment guides:
//   node driver.mjs --check          can Chromium run here? exit 0/1
//   node driver.mjs --wait <url>...  wait until every URL answers, exit 0/1
//
// Installs nothing. When Chromium or its shared libraries are missing,
// `launch` and `--check` say what's missing and exit non-zero; the user
// installs it (see the guide for your environment).
import { chromium } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), 'shots');

const BASE_URL = process.env.APP_URL || 'http://localhost:5273';
const API_URL = process.env.API_URL || 'http://localhost:3101';

let browser = null;
let page = null;
const consoleLog = [];

// The Arch package that ships each shared library chrome-headless-shell
// links against (from `pacman -Qo` on WSL/Arch). glibc, zlib and the like
// are left out: they're never the missing ones.
const ARCH_PACKAGE_FOR_LIB = {
  'libnspr4.so': 'nspr', 'libplc4.so': 'nspr', 'libplds4.so': 'nspr',
  'libnss3.so': 'nss', 'libnssutil3.so': 'nss', 'libsmime3.so': 'nss',
  'libatk-1.0.so.0': 'at-spi2-core', 'libatk-bridge-2.0.so.0': 'at-spi2-core', 'libatspi.so.0': 'at-spi2-core',
  'libglib-2.0.so.0': 'glib2', 'libgobject-2.0.so.0': 'glib2', 'libgio-2.0.so.0': 'glib2', 'libgmodule-2.0.so.0': 'glib2',
  'libdbus-1.so.3': 'dbus', 'libexpat.so.1': 'expat', 'libudev.so.1': 'systemd-libs',
  'libX11.so.6': 'libx11', 'libxcb.so.1': 'libxcb', 'libXext.so.6': 'libxext',
  'libXau.so.6': 'libxau', 'libXdmcp.so.6': 'libxdmcp',
  'libXcomposite.so.1': 'libxcomposite', 'libXdamage.so.1': 'libxdamage', 'libXfixes.so.3': 'libxfixes',
  'libXrandr.so.2': 'libxrandr', 'libXrender.so.1': 'libxrender', 'libXi.so.6': 'libxi',
  'libxkbcommon.so.0': 'libxkbcommon', 'libgbm.so.1': 'mesa', 'libdrm.so.2': 'libdrm',
  'libasound.so.2': 'alsa-lib', 'libcups.so.2': 'libcups',
};

// Headless launches run chrome-headless-shell, which Playwright installs
// beside the full Chromium that chromium.executablePath() names:
//   .../chromium-1234/chrome-linux64/chrome
//   .../chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
function headlessShellPath() {
  const full = chromium.executablePath();
  const platDir = path.dirname(full);
  const verDir = path.dirname(platDir);
  return path.join(
    path.dirname(verDir),
    path.basename(verDir).replace(/^chromium-/, 'chromium_headless_shell-'),
    path.basename(platDir).replace(/^chrome-/, 'chrome-headless-shell-'),
    'chrome-headless-shell' + path.extname(full),
  );
}

// Shared libraries the dynamic loader can't find for `bin` (Linux only).
// Read-only: runs `ldd`, writes nothing.
function missingLibs(bin) {
  if (process.platform !== 'linux') return [];
  let out;
  try { out = execFileSync('ldd', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = String(e.stdout || ''); }
  const missing = out.split('\n').filter((l) => /=>\s*not found/.test(l)).map((l) => l.trim().split(/\s+/)[0]);
  return [...new Set(missing)];
}

// null when Chromium can launch; otherwise what's missing and the exact
// command for the user to run.
function chromiumProblem() {
  const bin = headlessShellPath();
  if (!fs.existsSync(bin)) {
    return [
      `Playwright's Chromium isn't installed (no ${bin}).`,
      'Ask the user to run:  npx playwright install chromium',
      'See the guide for your environment in .claude/skills/run-tectonic-bingo/. Nothing was installed.',
    ].join('\n');
  }
  const libs = missingLibs(bin);
  if (!libs.length) return null;
  const pkgs = [...new Set(libs.map((l) => ARCH_PACKAGE_FOR_LIB[l]).filter(Boolean))];
  const unknown = libs.filter((l) => !ARCH_PACKAGE_FOR_LIB[l]);
  return [
    `Chromium can't start: missing shared libraries (${libs.length}):`,
    ...libs.map((l) => `  ${l}${ARCH_PACKAGE_FOR_LIB[l] ? `  (Arch package: ${ARCH_PACKAGE_FOR_LIB[l]})` : ''}`),
    ...(pkgs.length ? ['On WSL (Arch Linux), ask the user to run:', `  sudo pacman -S --needed ${pkgs.join(' ')}`] : []),
    ...(unknown.length ? [`Find the package for ${unknown.join(', ')} with:  pacman -F <library>`] : []),
    "See .claude/skills/run-tectonic-bingo/wsl-arch.md (\"Chromium's system libraries\"). Nothing was installed.",
  ].join('\n');
}

async function waitForUrls(urls, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (const url of urls) {
    for (;;) {
      // Any answer below 500 means it's up (the API answers 401 when logged out).
      const status = await fetch(url, { signal: AbortSignal.timeout(5_000) }).then((r) => r.status, () => 0);
      if (status && status < 500) { console.log(`up: ${url} (${status})`); break; }
      if (Date.now() > deadline) { console.log(`TIMEOUT: ${url} didn't answer in ${timeoutMs / 1000}s`); return false; }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  return true;
}

if (process.argv[2] === '--check') {
  const problem = chromiumProblem();
  console.log(problem ?? `chromium OK: ${headlessShellPath()}`);
  process.exit(problem ? 1 : 0);
}
if (process.argv[2] === '--wait') {
  process.exit((await waitForUrls(process.argv.slice(3))) ? 0 : 1);
}

const COMMANDS = {
  async launch() {
    if (browser) return console.log('already launched');
    const problem = chromiumProblem();
    if (problem) { console.log(problem); process.exit(1); }
    try {
      browser = await chromium.launch({ args: ['--no-sandbox'] });
    } catch (e) {
      console.log('ERROR: Chromium failed to launch:\n' + e.message.split('\n').slice(0, 12).join('\n'));
      console.log('See Troubleshooting in the guide for your environment (.claude/skills/run-tectonic-bingo/).');
      process.exit(1);
    }
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
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f, fullPage: true });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.locator(sel).first().click(); console.log('click', sel, '-> OK'); }
    catch (e) { console.log('click', sel, '-> ERROR:', e.message.split('\n')[0]); }
  },

  async 'click-text'(...words) {
    if (!page) return console.log('ERROR: launch first');
    const text = words.join(' ');
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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'driver> ' });

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
