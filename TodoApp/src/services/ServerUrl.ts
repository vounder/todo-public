export function normalizeServerUrl(value: string | undefined | null): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isOriginOnly = url.pathname === '/' && !url.search && !url.hash;
    if (!isHttp || !url.hostname || url.username || url.password || !isOriginOnly) {
      return null;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function resolveServerUrl(
  override: string | undefined | null,
  buildDefault: string | undefined | null
): string | null {
  return normalizeServerUrl(override) ?? normalizeServerUrl(buildDefault);
}

export function apiUrl(serverUrl: string): string {
  return `${serverUrl}/api`;
}

export function webSocketUrl(serverUrl: string): string {
  return serverUrl.replace(/^http/, 'ws');
}
