#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { configuration, readEnv, saveEnv, writeCard, privateAddress, deployLink } = require('./config');

async function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const root = rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : path.resolve(__dirname, '../..');
  const interactive = !args.includes('--non-interactive');
  const reader = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (label, fallback = '') => reader ? (await reader.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback : fallback;
  try {
    const file = path.join(root, '.env');
    const existing = readEnv(file);
    let address = process.env.TODO_BIND_ADDRESS;
    if (!existing.SERVER_BIND_ADDRESS && !address) {
      const network = await ask('Zugriff: 1 = Handy im privaten Netzwerk/VPN, 2 = nur dieser Rechner', '2');
      if (!['1', '2'].includes(network)) throw new Error('Bitte 1 oder 2 auswählen.');
      if (network === '1') {
        const candidates = (process.env.TODO_NETWORK_ADDRESSES || '').split(',').filter(privateAddress);
        if (candidates.length) console.log('Private Adressen dieses Rechners: ' + candidates.join(', '));
        address = await ask('Private IPv4-/VPN-Adresse des Servers', candidates[0] || '');
        if (!privateAddress(address)) throw new Error('Bitte eine private IPv4-/VPN-Adresse angeben.');
      } else address = '127.0.0.1';
    }
    const port = existing.SERVER_HOST_PORT || process.env.TODO_SERVER_PORT || await ask('Server-Port', '8080');
    const database = existing.MONGO_DB_NAME || process.env.TODO_MONGO_DB_NAME || await ask('Datenbankname', 'todoapp');
    const config = configuration({ address, port, database, url: process.env.TODO_PUBLIC_URL, cors: process.env.TODO_CORS_ORIGINS }, existing);
    const linkFile = path.join(root, 'todo-public.deploylink');
    let link;
    if (args.includes('--deploydesk') && !fs.existsSync(linkFile)) {
      const e = { ...process.env };
      for (const [key, label] of [['TODO_DEPLOY_HOST', 'DeployDesk SSH-Host'], ['TODO_DEPLOY_USER', 'SSH-Benutzer'], ['TODO_DEPLOY_REMOTE_PATH', 'Absoluter Projektpfad auf dem Server']]) e[key] ||= await ask(label);
      link = deployLink(e);
    }
    saveEnv(file, config);
    await writeCard(root, config);
    if (link) fs.writeFileSync(linkFile, JSON.stringify(link, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Konfiguration bereit. Vorhandene Werte und Zugangsschlüssel bleiben erhalten.');
    console.log('Einrichtungskarte: setup-card.local.html (enthält deinen privaten QR-Code).');
    console.log(config.SERVER_BIND_ADDRESS === '127.0.0.1' ? 'Zugriff: nur dieser Rechner. Hinweise zum Handy-Zugriff stehen auf der Einrichtungskarte.' : 'Zugriff: gewählte private Netzwerk-/VPN-Adresse. Handy mit diesem Netzwerk verbinden.');
  } finally { reader?.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
