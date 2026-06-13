import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: any;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

// Background sync for offline invoices
self.addEventListener('sync' as any, (event: any) => {
  if (event.tag === 'sync-invoices') {
    event.waitUntil(syncOfflineInvoices());
  }
});

async function syncOfflineInvoices() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach((client: any) => {
      client.postMessage({ type: 'SYNC_INVOICES' });
    });
  } catch (error) {
    console.error('Error in service worker syncOfflineInvoices:', error);
  }
}

serwist.addEventListeners();
