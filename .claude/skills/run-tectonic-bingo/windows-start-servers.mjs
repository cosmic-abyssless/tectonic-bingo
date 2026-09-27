// Starts the agent-path server and client in the background on Windows
// (see windows.md). Node, not PowerShell, because the run path needs some
// variables set to an empty string (so a root .env's real API keys can't
// fill them in), and PowerShell deletes a variable assigned ''.
//
//   node .claude/skills/run-tectonic-bingo/windows-start-servers.mjs [serverPort] [clientPort]
//
// Logs: %TEMP%\tb-server.log, %TEMP%\tb-client.log. Pids (for Stop):
// %TEMP%\tb-server.pid, %TEMP%\tb-client.pid. The variables are SKILL.md's
// "The agent run path" table; keep the two in step.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const serverPort = process.argv[2] || '3101';
const clientPort = process.argv[3] || '5273';
const clientUrl = `http://localhost:${clientPort}`;

const servers = {
  server: {
    PORT: serverPort,
    DB_PATH: path.join(repo, 'server', 'data', 'e2e.db'),
    DEV_LOGIN_ENABLED: 'true',
    DISCORD_CLIENT_ID: 'e2e', DISCORD_CLIENT_SECRET: 'e2e', DISCORD_GUILD_ID: 'e2e',
    DISCORD_CALLBACK_URL: `${clientUrl}/auth/discord/callback`,
    SESSION_SECRET: 'e2e-secret', CLIENT_URL: clientUrl,
    TECTONIC_API_URL: '', TECTONIC_API_KEY: '', TECTONIC_GUILD_ID: '', WOM_API_KEY: '', RUNEPROFILE_API_KEY: '',
    PLAYER_STATS_FETCH_DISABLED: 'true', SCREENSHOT_OCR_DISABLED: 'true',
    OSRS_ITEM_SEARCH_DISABLED: 'true', GE_PRICES_FETCH_DISABLED: 'true',
  },
  client: { VITE_PORT: clientPort, VITE_API_TARGET: `http://localhost:${serverPort}` },
};

for (const [name, vars] of Object.entries(servers)) {
  const log = fs.openSync(path.join(os.tmpdir(), `tb-${name}.log`), 'w');
  // shell: npm is npm.cmd on Windows, which Node only runs through a shell.
  const child = spawn(`npm run dev --workspace=${name}`, {
    cwd: repo, env: { ...process.env, ...vars }, shell: true,
    detached: true, windowsHide: true, stdio: ['ignore', log, log],
  });
  child.unref();
  fs.writeFileSync(path.join(os.tmpdir(), `tb-${name}.pid`), String(child.pid));
  console.log(`${name}: pid ${child.pid}, log ${path.join(os.tmpdir(), `tb-${name}.log`)}`);
}
