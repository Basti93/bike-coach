import type { GymWorkout } from '../coach/gym/types';
import type { HealthRange } from './views/HealthView';

export type TrackScreen = 'workout' | 'routines' | 'history';
/** Which screen is open besides the home screen. Profile-bound choices name their profile and lapse with it. */
export type Views = {
  profile: boolean;
  review: boolean;
  health: HealthRange | undefined;
  history: boolean;
  together: boolean;
  strengthFor: string | null;
  bikeFor: string | null;
  trackFor: { profileId: string; screen: TrackScreen; routine: GymWorkout | null } | null;
  /** The household's meal plan, only for a profile that turned it on. */
  meals: boolean;
  /** The run page, only once the run records say running is on. */
  run: boolean;
};
export type MenuItem = 'start' | 'rad' | 'kraft' | 'laufen' | 'essen' | 'verlauf' | 'gesundheit' | 'gemeinsam' | 'profil';

export const HOME: Views = { profile: false, review: false, health: undefined, history: false, together: false, strengthFor: null, bikeFor: null, trackFor: null, meals: false, run: false };
export const MENU_LABEL: Record<MenuItem, string> = { start: 'Start', rad: 'Rad', kraft: 'Kraft', laufen: 'Laufen', essen: 'Essen', verlauf: 'Verlauf', gesundheit: 'Gesundheit', gemeinsam: 'Gemeinsam', profil: 'Profil' };
const DEFAULT_HEALTH_DAYS = 28;

/** The screen a menu item opens, with every other view closed. An open workout is not lost by this: it lives in its store and is offered again on the strength page. */
export function open(item: MenuItem, profileId: string): Views {
  switch (item) {
    case 'start': return HOME;
    case 'rad': return { ...HOME, bikeFor: profileId };
    case 'kraft': return { ...HOME, strengthFor: profileId };
    case 'laufen': return { ...HOME, run: true };
    case 'essen': return { ...HOME, meals: true };
    case 'verlauf': return { ...HOME, history: true };
    case 'gesundheit': return { ...HOME, health: DEFAULT_HEALTH_DAYS };
    case 'gemeinsam': return { ...HOME, together: true };
    case 'profil': return { ...HOME, profile: true };
  }
}

/** Mirrors the order in which the app picks the screen. */
export function activeItem(v: Views, profileId: string, home: 'overview' | 'bike'): MenuItem {
  if (v.profile || v.review) return 'profil';
  if (v.health !== undefined) return 'gesundheit';
  if (v.together) return 'gemeinsam';
  if (v.meals) return 'essen';
  if (v.run) return 'laufen';
  if (v.trackFor?.profileId === profileId || v.strengthFor === profileId) return 'kraft';
  if (v.history) return 'verlauf';
  if (v.bikeFor === profileId || home === 'bike') return 'rad';
  return 'start';
}

export function menuItems(has: { overview: boolean; gym: boolean; history: boolean; health: boolean; together: boolean; meals?: boolean; run?: boolean }): MenuItem[] {
  return [
    ...(has.overview ? ['start' as const] : []),
    'rad' as const,
    ...(has.gym ? ['kraft' as const] : []),
    ...(has.run ? ['laufen' as const] : []),
    ...(has.meals ? ['essen' as const] : []),
    ...(has.history ? ['verlauf' as const] : []),
    ...(has.health ? ['gesundheit' as const] : []),
    ...(has.together ? ['gemeinsam' as const] : []),
  ];
}

/** Only once a profile is chosen and the home screen is known. Never during a ride. */
export const showMenu = (s: { profile: boolean; riding: boolean; film: boolean; waiting: boolean }): boolean => s.profile && !s.riding && !s.film && !s.waiting;
