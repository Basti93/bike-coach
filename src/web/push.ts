import { isIphoneBrowser } from './logic';

export type SubJson = { endpoint?: string; keys?: Record<string, string> };

/** What the app needs from the browser for push. A fake in tests. */
export type PushEnv = {
  /** 'ok': push works here. 'install': iPhone or iPad in a plain browser tab, push needs the home screen app. 'none': no push here. */
  support: 'ok' | 'install' | 'none';
  permission(): NotificationPermission;
  /** Must be the first thing a tap calls: iOS asks only during the gesture. */
  requestPermission(): Promise<NotificationPermission>;
  current(): Promise<SubJson | null>;
  subscribe(key: string): Promise<SubJson>;
  /** Ends this browser's subscription; returns its endpoint, if there was one. */
  unsubscribe(): Promise<string | null>;
};

export const pushSupport = (o: { ua: string; standalone: boolean; hasPush: boolean }): PushEnv['support'] =>
  isIphoneBrowser(o.ua) && !o.standalone ? 'install' : o.hasPush ? 'ok' : 'none';

const keyBytes = (b64u: string): Uint8Array => {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** The browser's Push API through the registered service worker. */
export function browserPush(o: { ua: string; standalone: boolean }): PushEnv {
  const hasPush = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const reg = () => navigator.serviceWorker.ready;
  return {
    support: pushSupport({ ...o, hasPush }),
    permission: () => (hasPush ? Notification.permission : 'denied'),
    requestPermission: () => Notification.requestPermission(),
    current: async () => ((await (await reg()).pushManager.getSubscription())?.toJSON() as SubJson | undefined) ?? null,
    subscribe: async (key) => {
      const r = await reg();
      const s = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
      return s.toJSON() as SubJson;
    },
    unsubscribe: async () => {
      const s = await (await reg()).pushManager.getSubscription();
      if (!s) return null;
      await s.unsubscribe().catch(() => false);
      return s.endpoint;
    },
  };
}

/**
 * The tag the service worker gives a rest notice (`pandafit-rest`, see swLogic). Kept as its own literal on purpose:
 * importing swLogic here would make the build share a chunk with sw.js, and a service worker with an import never installs.
 */
export const REST_TAG = 'pandafit-rest';

/** Opening the app makes a rest notice pointless: close the ones still shown. Never throws; returns how many were closed. */
export async function closeRestNotices(reg: { getNotifications(o: { tag: string }): Promise<readonly { close(): void }[]> }): Promise<number> {
  try {
    const shown = await reg.getNotifications({ tag: REST_TAG });
    for (const n of shown) n.close();
    return shown.length;
  } catch { return 0; }
}
