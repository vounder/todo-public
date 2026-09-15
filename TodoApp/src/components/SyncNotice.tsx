import React, { useSyncExternalStore } from 'react';
import { ApiService } from '../services/ApiService';
import { Notice } from './Notice';

export function SyncNotice() {
  const state = useSyncExternalStore(ApiService.subscribeSync, ApiService.getSyncSnapshot, ApiService.getSyncSnapshot);
  if (state.localOnly) return <Notice tone="info" message="Lokal auf diesem Gerät gespeichert. Du kannst später unter Einstellungen einen Server verbinden." />;
  if (!state.unavailable && !state.pending) return null;
  return <Notice tone={state.unavailable ? 'warning' : 'info'}
    message={state.pending ? 'Änderungen auf diesem Gerät gespeichert. ' + (state.syncing && !state.unavailable ? 'Wird synchronisiert …' : 'Synchronisierung ausstehend.')
      : 'Server nicht erreichbar. Der gespeicherte Stand bleibt verfügbar.'}
    action={state.syncing ? undefined : 'Erneut'} onAction={() => { void ApiService.retry().catch(() => {}); }} />;
}
