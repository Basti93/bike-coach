import { activeItem, HOME, menuItems, MENU_LABEL, open, showMenu, type Views } from '../../src/ui/nav';

const busy: Views = { ...HOME, profile: true, review: true, health: 28, history: true, together: true, strengthFor: 'a', bikeFor: 'a', trackFor: { profileId: 'a', screen: 'workout', routine: null } };

test('every item starts from a clean slate, whatever was open before', () => {
  expect(open('start', 'a')).toEqual(HOME);
  expect(open('rad', 'a')).toEqual({ ...HOME, bikeFor: 'a' });
  expect(open('kraft', 'a')).toEqual({ ...HOME, strengthFor: 'a' });
  expect(open('verlauf', 'a')).toEqual({ ...HOME, history: true });
  expect(open('gesundheit', 'a')).toEqual({ ...HOME, health: 28 });
  expect(open('gemeinsam', 'a')).toEqual({ ...HOME, together: true });
  expect(open('profil', 'a')).toEqual({ ...HOME, profile: true });
  // nothing of the busy state leaks into the next screen
  for (const item of ['start', 'rad', 'kraft', 'verlauf', 'gesundheit', 'gemeinsam', 'profil'] as const) expect(open(item, 'a').trackFor).toBeNull();
  expect(busy.trackFor).not.toBeNull();
});

test('the active item follows what is on screen', () => {
  expect(activeItem(HOME, 'a', 'overview')).toBe('start');
  expect(activeItem(HOME, 'a', 'bike')).toBe('rad');
  expect(activeItem(open('rad', 'a'), 'a', 'overview')).toBe('rad');
  expect(activeItem(open('kraft', 'a'), 'a', 'overview')).toBe('kraft');
  expect(activeItem({ ...HOME, trackFor: { profileId: 'a', screen: 'routines', routine: null } }, 'a', 'overview')).toBe('kraft');
  expect(activeItem(open('verlauf', 'a'), 'a', 'overview')).toBe('verlauf');
  expect(activeItem(open('gesundheit', 'a'), 'a', 'overview')).toBe('gesundheit');
  expect(activeItem(open('gemeinsam', 'a'), 'a', 'overview')).toBe('gemeinsam');
  expect(activeItem(open('profil', 'a'), 'a', 'overview')).toBe('profil');
  expect(activeItem({ ...HOME, review: true }, 'a', 'overview')).toBe('profil');
  // a choice made for another profile does not count
  expect(activeItem(open('kraft', 'b'), 'a', 'overview')).toBe('start');
});

test('the menu shows what exists for this profile, in a fixed order', () => {
  expect(menuItems({ overview: true, gym: true, history: true, health: true, together: true })).toEqual(['start', 'rad', 'kraft', 'verlauf', 'gesundheit', 'gemeinsam']);
  // without an overview the bike page is the start, and there is no strength page without strength training
  expect(menuItems({ overview: false, gym: false, history: false, health: false, together: false })).toEqual(['rad']);
  expect(menuItems({ overview: false, gym: false, history: true, health: true, together: false })).toEqual(['rad', 'verlauf', 'gesundheit']);
  expect(MENU_LABEL).toMatchObject({ start: 'Start', rad: 'Rad', kraft: 'Kraft', verlauf: 'Verlauf', gesundheit: 'Gesundheit', gemeinsam: 'Gemeinsam', profil: 'Profil' });
});

test('never during a ride: the ride screen stays exactly as it is', () => {
  expect(showMenu({ profile: true, riding: false, film: false, waiting: false })).toBe(true);
  expect(showMenu({ profile: true, riding: true, film: false, waiting: false })).toBe(false);
  expect(showMenu({ profile: false, riding: false, film: false, waiting: false })).toBe(false);
  expect(showMenu({ profile: true, riding: false, film: true, waiting: false })).toBe(false);
  expect(showMenu({ profile: true, riding: false, film: false, waiting: true })).toBe(false);
});

test('Essen only for a profile that turned the meal plan on, right after Kraft', () => {
  expect(menuItems({ overview: true, gym: true, history: true, health: true, together: true, meals: false })).not.toContain('essen');
  expect(menuItems({ overview: true, gym: true, history: true, health: false, together: false, meals: true })).toEqual(['start', 'rad', 'kraft', 'essen', 'verlauf']);
  expect(open('essen', 'a')).toEqual({ ...HOME, meals: true });
  expect(activeItem(open('essen', 'a'), 'a', 'overview')).toBe('essen');
  expect(MENU_LABEL.essen).toBe('Essen');
});

test('open(laufen) shows only the run page', () => {
  expect(open('laufen', 'a')).toEqual({ ...HOME, run: true });
});
test('activeItem is laufen while the run page is open', () => {
  expect(activeItem({ ...HOME, run: true }, 'a', 'overview')).toBe('laufen');
  expect(MENU_LABEL.laufen).toBe('Laufen');
});
test('menuItems lists Laufen after Kraft only when run is true', () => {
  const base = { overview: true, gym: true, history: true, health: false, together: false, meals: true };
  expect(menuItems({ ...base, run: true })).toEqual(['start', 'rad', 'kraft', 'laufen', 'essen', 'verlauf']);
  expect(menuItems({ ...base, run: false })).not.toContain('laufen');
  expect(menuItems(base)).not.toContain('laufen');
});

test('Statistik after Verlauf, only when stats is true', () => {
  const base = { overview: true, gym: true, history: true, health: true, together: false };
  expect(menuItems({ ...base, stats: true })).toEqual(['start', 'rad', 'kraft', 'verlauf', 'statistik', 'gesundheit']);
  expect(menuItems({ ...base, stats: false })).not.toContain('statistik');
  expect(menuItems(base)).not.toContain('statistik');
  expect(open('statistik', 'a')).toEqual({ ...HOME, stats: true });
  expect(activeItem(open('statistik', 'a'), 'a', 'overview')).toBe('statistik');
  expect(MENU_LABEL.statistik).toBe('Statistik');
});
