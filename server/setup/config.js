const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

function port(value, label = 'Port') {
  if (!/^\d{1,5}$/.test(String(value)) || +value < 1 || +value > 65535) throw new Error(`${label}: Zahl zwischen 1 und 65535 eingeben.`);
  return String(+value);
}
function privateAddress(value) {
  if (net.isIP(value) !== 4) return false;
  const [a, b] = value.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
function serverUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Server-Adresse: http(s)://Host:Port ohne weiteren Pfad eingeben.');
  if (url.protocol === 'http:' && !privateAddress(url.hostname) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Für öffentliche Server-Adressen ist HTTPS erforderlich.');
  return url.origin;
}
function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const result = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error('Die vorhandene .env enthält eine nicht unterstützte Zeile. Bitte KEY=value verwenden.');
    if (Object.hasOwn(result, match[1])) throw new Error(`Doppelter Eintrag in .env: ${match[1]}`);
    result[match[1]] = match[2];
  }
  return result;
}
function configuration(input = {}, existing = {}) {
  const env = { ...existing };
  const assign = (name, value) => { if (!Object.hasOwn(env, name)) env[name] = value; };
  assign('COMPOSE_PROJECT_NAME', 'todo-public-local');
  assign('SERVER_HOST_PORT', input.port || '8080');
  assign('SERVER_CONTAINER_PORT', '8080');
  assign('SERVER_BIND_ADDRESS', input.address || '127.0.0.1');
  assign('MONGO_DB_NAME', input.database || 'todoapp');
  assign('CORS_ORIGINS', input.cors || '');
  assign('TODO_ACCESS_KEY', crypto.randomBytes(32).toString('hex'));
  assign('TODO_PUBLIC_URL', input.url || `http://${env.SERVER_BIND_ADDRESS}:${env.SERVER_HOST_PORT}`);
  env.SERVER_HOST_PORT = port(env.SERVER_HOST_PORT);
  env.SERVER_CONTAINER_PORT = port(env.SERVER_CONTAINER_PORT);
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(env.COMPOSE_PROJECT_NAME)) throw new Error('Ungültiger Compose-Projektname.');
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(env.MONGO_DB_NAME)) throw new Error('Ungültiger Datenbankname.');
  if (env.SERVER_BIND_ADDRESS !== '127.0.0.1' && !privateAddress(env.SERVER_BIND_ADDRESS)) throw new Error('Bindeadresse muss Loopback oder eine konkrete private IPv4-/VPN-Adresse sein.');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(env.TODO_ACCESS_KEY)) throw new Error('TODO_ACCESS_KEY muss 32–128 Buchstaben, Ziffern, Bindestriche oder Unterstriche enthalten.');
  env.TODO_PUBLIC_URL = serverUrl(env.TODO_PUBLIC_URL);
  if (env.CORS_ORIGINS) for (const origin of env.CORS_ORIGINS.split(',')) serverUrl(origin);
  return env;
}
function saveEnv(file, values) {
  const previous = readEnv(file);
  const additions = Object.entries(values).filter(([key]) => !Object.hasOwn(previous, key));
  if (!additions.length) return;
  const suffix = additions.map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (fs.existsSync(file)) fs.appendFileSync(file, '\n' + suffix, { mode: 0o600 });
  else fs.writeFileSync(file, suffix, { flag: 'wx', mode: 0o600 });
}
function connectionLink(url, key) {
  return `todopublic://connect?server=${encodeURIComponent(serverUrl(url))}#key=${encodeURIComponent(key)}`;
}
async function writeCard(root, env) {
  const qr = require('qrcode');
  const link = connectionLink(env.TODO_PUBLIC_URL, env.TODO_ACCESS_KEY);
  const svg = await qr.toString(link, { type: 'svg', margin: 3, errorCorrectionLevel: 'M' });
  const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const localOnly = new URL(env.TODO_PUBLIC_URL).hostname === '127.0.0.1';
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>Todo verbinden</title><style>body{font:18px system-ui;background:#f3f5fa;color:#15213a;margin:0;padding:28px}main{max-width:650px;margin:auto;background:white;border-radius:24px;padding:32px}svg{max-width:340px;display:block;margin:auto}h1{font-size:32px}a{color:#354acc}input{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;font:inherit}p{line-height:1.5}small{color:#526077}</style><main><h1>Todo auf dem Handy verbinden</h1><p>1. <a href="https://github.com/vounder/todo-public/releases/latest">Android-App herunterladen und installieren</a>.</p><p>2. Handy und Server mit demselben privaten Netzwerk oder VPN verbinden.</p><p>3. In Todo <strong>Server verbinden → QR-Code scannen</strong> wählen.</p>${localOnly ? '<p><strong>Nur auf diesem Rechner erreichbar.</strong> Für ein Handy SERVER_BIND_ADDRESS und TODO_PUBLIC_URL in .env auf die private Netzwerk-/VPN-Adresse setzen und das Setup erneut ausführen.</p>' : ''}${svg}<p><a href="${escape(link)}">Auf diesem Gerät in Todo öffnen</a></p><label>Server-Adresse<input readonly value="${escape(env.TODO_PUBLIC_URL)}"></label><details><summary>Zugangsschlüssel für manuelle Eingabe anzeigen</summary><input readonly value="${escape(env.TODO_ACCESS_KEY)}"></details><p><small>Diese lokale Datei enthält den Zugang zu deinen Listen. Nur mit Personen teilen, die Zugriff erhalten sollen. Sie wird nicht auf den Server hochgeladen.</small></p></main></html>`;
  fs.writeFileSync(path.join(root, 'setup-card.local.html'), html, { mode: 0o600 });
}
function deployLink(e) {
  const requireValue = (name, pattern) => { const value = e[name] || ''; if (!pattern.test(value)) throw new Error(`Fehlender oder ungültiger Wert: ${name}`); return value; };
  const remotePath = requireValue('TODO_DEPLOY_REMOTE_PATH', /^\/[A-Za-z0-9._/-]+$/);
  if (remotePath.length > 1024 || remotePath.split('/').some(p => p === '.' || p === '..')) throw new Error('Ungültiger Remote-Pfad.');
  const branch = e.TODO_DEPLOY_BRANCH || 'main';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/')) throw new Error('Ungültiger Branch.');
  const id = e.TODO_DEPLOY_PROJECT_ID || 'todo-public-environment';
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)) throw new Error('Ungültige DeployDesk-Projekt-ID.');
  return { schemaVersion: 2, project: { id, name: 'Todo Public', description: 'Local deployment configuration.', accentColor: '#4F46E5' }, repository: { remote: 'origin', branch }, server: { name: 'Deployment environment', host: requireValue('TODO_DEPLOY_HOST', /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/), user: requireValue('TODO_DEPLOY_USER', /^[A-Za-z_][A-Za-z0-9._-]{0,31}$/), sshPort: +port(e.TODO_DEPLOY_SSH_PORT || '22'), remotePath, healthCheck: { port: +port(e.TODO_DEPLOY_HEALTH_PORT || '8080'), path: '/health', expectedStatus: 200, attempts: 20, intervalSeconds: 2 } }, runner: { type: 'powershell', file: 'deploy/deploy.ps1', protocol: 'deploydesk-jsonl-v1', arguments: [] }, options: [], links: [] };
}
module.exports = { port, privateAddress, serverUrl, readEnv, configuration, saveEnv, connectionLink, writeCard, deployLink };
