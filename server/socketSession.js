// Authenticate before registering for broadcasts or reading any user data.
function socketSession(ws, { accepts, ready, register, unregister, initialData, sync, timeout = 5000 }) {
  let authenticated = false;
  let authenticating = false;
  const timer = setTimeout(() => ws.close(4401, 'Anmeldung erforderlich'), timeout);
  timer.unref?.();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});
  ws.on('close', () => { clearTimeout(timer); if (authenticated) unregister(ws); });
  ws.on('message', async message => {
    try {
      const data = JSON.parse(message.toString());
      if (!authenticated) {
        if (authenticating) return;
        if (data.type !== 'REGISTER' || typeof data.clientId !== 'string' || data.clientId.length > 128 || !accepts(data.accessKey)) {
          clearTimeout(timer); ws.close(4401, 'Zugangsschlüssel ungültig'); return;
        }
        if (!ready()) { clearTimeout(timer); ws.close(4503, 'Datenbank nicht bereit'); return; }
        authenticating = true;
        ws.clientId = data.clientId;
        authenticated = true;
        clearTimeout(timer);
        register(ws);
        ws.send(JSON.stringify({ type: 'AUTH_OK', service: 'todo-public', protocol: 1 }));
        const dataSnapshot = await initialData();
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'INIT', data: dataSnapshot, timestamp: Date.now() }));
      } else if (data.type === 'SYNC') sync(ws);
    } catch {
      if (ws.readyState === 1) ws.close(4500, 'Verbindung fehlgeschlagen');
    }
  });
}
module.exports = { socketSession };
