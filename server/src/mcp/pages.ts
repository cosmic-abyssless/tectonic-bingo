// The two plain pages the OAuth authorize step shows an admin: "connect this app?" and a refusal. Served by the server
// itself (not the React client) because they sit in the middle of a redirect chain that must stay on one origin.

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Tectonic Bingo</title>
<style>
  :root { color-scheme: light dark; --bg: #f5f5f4; --card: #fff; --text: #1c1917; --muted: #57534e; --accent: #b45309; --border: #d6d3d1; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --card: #292524; --text: #f5f5f4; --muted: #a8a29e; --accent: #f59e0b; --border: #44403c; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
  main { box-sizing: border-box; width: min(28rem, 100% - 2rem); padding: 1.5rem; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
  h1 { margin: 0 0 .75rem; font-size: 1.25rem; }
  p { margin: .5rem 0; color: var(--muted); }
  strong { color: var(--text); }
  ul { margin: .5rem 0 1rem; padding-left: 1.25rem; color: var(--muted); }
  .actions { display: flex; gap: .75rem; margin-top: 1.25rem; }
  button { flex: 1; padding: .6rem 1rem; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text); font: inherit; cursor: pointer; }
  button[value="approve"] { background: var(--accent); border-color: var(--accent); color: #1c1917; font-weight: 600; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export interface ConsentPageInput {
  appName: string;
  redirectHost: string;
  adminName: string;
  /** Every authorize parameter, posted back to /authorize with the decision. */
  fields: Record<string, string>;
}

export function consentPage({ appName, redirectHost, adminName, fields }: ConsentPageInput): string {
  const hidden = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("\n");
  return page(
    "Connect to Claude",
    `<h1>Connect ${escapeHtml(appName)} to Tectonic Bingo?</h1>
<p>Signed in as <strong>${escapeHtml(adminName)}</strong>. After this, sign-in completes at <strong>${escapeHtml(redirectHost)}</strong>.</p>
<p>It will be able to read, as you:</p>
<ul>
  <li>every Bingo's settings, Board, Teams and Submissions, and their statistics;</li>
  <li>Players' Discord names and ids, and their signup answers.</li>
</ul>
<p>It can't change anything. What it reads goes to Anthropic as part of your conversation. Only connect an app you started yourself.</p>
<form method="post" action="/authorize">
${hidden}
<div class="actions">
  <button type="submit" name="decision" value="deny">Cancel</button>
  <button type="submit" name="decision" value="approve">Connect</button>
</div>
</form>`,
  );
}

export function messagePage(title: string, message: string): string {
  return page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`);
}
