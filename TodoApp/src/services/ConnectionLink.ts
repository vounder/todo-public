import { normalizeServerUrl } from './ServerUrl';

export function parseConnectionLink(value: string): { url: string; key: string } {
  if (value.length > 2048) throw new Error('Dieser QR-Code ist zu lang. Bitte die Todo-Einrichtungskarte scannen.');
  let link: URL;
  try { link = new URL(value); } catch { throw new Error('Kein gültiger Todo-QR-Code.'); }
  if (link.protocol !== 'todopublic:' || link.hostname !== 'connect' || (link.pathname && link.pathname !== '/') || link.username || link.password) throw new Error('Bitte den QR-Code deiner Todo-Einrichtungskarte scannen.');
  const url = normalizeServerUrl(link.searchParams.get('server'));
  const key = new URLSearchParams(link.hash.slice(1)).get('key') || '';
  if (!url || !/^[A-Za-z0-9_-]{32,128}$/.test(key)) throw new Error('Der Todo-QR-Code enthält keine vollständigen Verbindungsdaten.');
  return { url, key };
}
