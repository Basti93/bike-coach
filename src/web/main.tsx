import { createRoot } from 'react-dom/client';
import { App, type Env } from './App';
import { setupServiceWorker, type OpenState } from './register';
import './web.css';

let workoutOpen: OpenState = 'unknown'; // blocks an update until the app has looked at its data
let sw: { check(): void } | null = null;
// Until the first tap or key, nothing is held in memory: an update may reload even with a workout open.
let fresh = true;
for (const t of ['pointerdown', 'keydown'] as const) addEventListener(t, () => { fresh = false; }, { capture: true, once: true });

const env: Env = {
  fetchFn: (...a) => fetch(...a),
  now: Date.now,
  newId: () => crypto.randomUUID(),
  storage: localStorage,
  persist: async () => (await navigator.storage?.persist?.()) ?? false,
  ua: navigator.userAgent,
  standalone: (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches,
  onWorkoutOpen: (state) => { workoutOpen = state; sw?.check(); },
};

createRoot(document.getElementById('root')!).render(<App env={env} />);

// Registered from the module bundle (the server's CSP allows no inline scripts). Not in dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void setupServiceWorker({ container: navigator.serviceWorker as never, isWorkoutOpen: () => workoutOpen, isFresh: () => fresh, reload: () => location.reload() })
    .then((s) => {
      sw = s;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { void s.update(); s.check(); } });
    }).catch(() => { /* works without it */ });
}
