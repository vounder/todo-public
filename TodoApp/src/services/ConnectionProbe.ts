import { normalizeServerUrl, webSocketUrl } from './ServerUrl';

export type CheckId = 'http' | 'database' | 'authentication' | 'websocket';
export type ConnectionCheck = { id: CheckId; label: string; state: 'waiting' | 'checking' | 'success' | 'error'; message?: string };
export type ConnectionResult = { success: boolean; checks: ConnectionCheck[] };
export const initialChecks = (): ConnectionCheck[] => [
  { id: 'http', label: 'Server erreichbar', state: 'waiting' },
  { id: 'database', label: 'Datenbank bereit', state: 'waiting' },
  { id: 'authentication', label: 'Zugang bestätigt', state: 'waiting' },
  { id: 'websocket', label: 'Live-Synchronisation verbunden', state: 'waiting' },
];

export async function probeConnection(input: string, key: string, options: {
  signal?: AbortSignal; timeoutMs?: number; onProgress?: (checks: ConnectionCheck[]) => void;
} = {}): Promise<ConnectionResult> {
  const url = normalizeServerUrl(input);
  if (!url) throw new Error('Bitte eine vollständige Server-Adresse mit http:// oder https:// eingeben.');
  const timeoutMs = options.timeoutMs ?? 7000;
  let checks = initialChecks();
  let current: CheckId = 'http';
  const update = (id: CheckId, state: ConnectionCheck['state'], message?: string) => {
    checks = checks.map(check => check.id === id ? { ...check, state, message } : check);
    options.onProgress?.(checks);
  };
  const get = async (path: string, authorized = false) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetch(url + path, { headers: authorized ? { Authorization: `Bearer ${key}` } : {}, signal: controller.signal });
      const body = await response.json().catch(error => { if (controller.signal.aborted) throw error; return null; });
      return { status: response.status, ok: response.ok, body };
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  };
  try {
    update('http', 'checking');
    const healthResponse = await get('/health');
    if (healthResponse.status === 401 || healthResponse.status === 403) throw new Error('Ein vorgeschalteter Proxy blockiert den Zugriff. Nutze den privaten Netzwerkzugang oder prüfe die Proxy-Konfiguration.');
    const health = healthResponse.body;
    if (health?.service !== 'todo-public' || health?.protocol !== 1) throw new Error('Unter dieser Adresse antwortet kein kompatibler Todo-Server. Adresse und Serverversion prüfen.');
    update('http', 'success');
    current = 'database'; update(current, 'checking');
    if (!healthResponse.ok || health.database !== 'ready') throw new Error('Der Server läuft, aber die Datenbank ist noch nicht bereit. Kurz warten oder den Serverstatus prüfen.');
    update(current, 'success');
    current = 'authentication'; update(current, 'checking');
    if (!key) throw new Error('Bitte den Zugangsschlüssel aus deiner Einrichtungskarte eingeben oder den QR-Code scannen.');
    const access = await get('/api/connection', true);
    if (access.status === 401 || access.status === 403) throw new Error('Der Zugangsschlüssel stimmt nicht. Bitte die aktuelle Einrichtungskarte verwenden.');
    const info = access.body;
    if (!access.ok || info?.service !== 'todo-public' || info.protocol !== 1) throw new Error('Der Server konnte die Anmeldung nicht bestätigen. Serverversion prüfen.');
    update(current, 'success');
    current = 'websocket'; update(current, 'checking');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(webSocketUrl(url));
      let done = false;
      const finish = (error?: Error) => {
        if (done) return; done = true;
        clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
        ws.onopen = null; ws.onmessage = null; ws.onerror = () => {}; ws.onclose = null; ws.close();
        error ? reject(error) : resolve();
      };
      const abort = () => finish(new Error('Verbindungsprüfung abgebrochen.'));
      const timer = setTimeout(() => finish(new Error('Die Live-Verbindung antwortet nicht. VPN, Firewall oder WebSocket-Freigabe am Proxy prüfen.')), timeoutMs);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) { abort(); return; }
      ws.onopen = () => ws.send(JSON.stringify({ type: 'REGISTER', clientId: 'connection-check', accessKey: key }));
      ws.onmessage = event => {
        try { const data = JSON.parse(event.data); if (data.type === 'AUTH_OK' && data.service === 'todo-public' && data.protocol === 1) finish(); } catch { /* Ignore unrelated frames. */ }
      };
      ws.onerror = () => finish(new Error('Live-Verbindung fehlgeschlagen. WebSocket-Freigabe am Server prüfen.'));
      ws.onclose = event => finish(new Error(event.code === 4401 ? 'Der Zugang zur Live-Verbindung wurde abgelehnt.' : 'Die Live-Verbindung wurde vorzeitig geschlossen.'));
    });
    update(current, 'success');
    return { success: true, checks };
  } catch (error: any) {
    const message = options.signal?.aborted ? 'Verbindungsprüfung abgebrochen.' : error?.name === 'AbortError' || error?.name === 'TypeError'
      ? 'Server nicht erreichbar. Sind Handy und Server im selben Netzwerk/VPN? Adresse, Port und Firewall prüfen. localhost bezeichnet immer dieses Gerät.'
      : error.message || 'Verbindung fehlgeschlagen.';
    update(current, 'error', message);
    return { success: false, checks };
  }
}
