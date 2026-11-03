import { describe, expect, it } from 'vitest';
import { calmText, fitsDiet, fitsDislikes, fitsEveryone } from '../../../src/coach/meals/check';
import { RECIPES } from '../../../src/coach/meals/recipes';
import type { Dish, Ingredient } from '../../../src/shared/meals';

const ing = (name: string, raw = false): Ingredient => ({ name, amount: 1, unit: 'Stk', section: 'Obst und Gemüse', ...(raw ? { raw: true } : {}) });
const d = (title: string, names: (string | [string, boolean])[], steps: string[] = ['Kochen.']): Pick<Dish, 'title' | 'ingredients' | 'steps'> =>
  ({ title, ingredients: names.map((n) => (Array.isArray(n) ? ing(n[0], n[1]) : ing(n))), steps });
const none = { dislikes: [], intolerances: [] };

describe('dislikes', () => {
  it('finds a disliked food in ingredients, titles and steps, also in compound words', () => {
    const s = { dislikes: ['Koriander'], intolerances: [] };
    expect(fitsDislikes(d('Curry', ['Reis', 'Korianderblätter']), s)).toBe(false);
    expect(fitsDislikes(d('Koriander-Pesto-Nudeln', ['Nudeln']), s)).toBe(false);
    expect(fitsDislikes(d('Curry', ['Reis'], ['Mit Koriander bestreuen.']), s)).toBe(false);
    expect(fitsDislikes(d('Curry', ['Reis', 'Petersilie']), s)).toBe(true);
  });

  it('"keine rohen Zwiebeln" allows cooked onions and blocks raw ones, spring onions included', () => {
    const s = { dislikes: ['keine rohen Zwiebeln'], intolerances: [] };
    expect(fitsDislikes(d('Chili', [['Zwiebeln', false]]), s)).toBe(true);
    expect(fitsDislikes(d('Salat', [['Rote Zwiebel', true]]), s)).toBe(false);
    expect(fitsDislikes(d('Salat', [['Frühlingszwiebeln', true]]), s)).toBe(false);
  });

  it('short words only match whole words, and a disliked food does not ban its oil', () => {
    expect(fitsDislikes(d('Reispfanne', ['Reis']), { dislikes: [], intolerances: ['Ei'] })).toBe(true);
    expect(fitsDislikes(d('Omelett', ['Ei']), { dislikes: [], intolerances: ['Ei'] })).toBe(false);
    expect(fitsDislikes(d('Salat', ['Olivenöl']), { dislikes: ['Oliven'], intolerances: [] })).toBe(true);
    expect(fitsDislikes(d('Salat', ['Oliven']), { dislikes: ['Oliven'], intolerances: [] })).toBe(false);
  });

  it('known intolerances stand for their ingredients', () => {
    expect(fitsDislikes(d('Quark-Schale', ['Magerquark']), { dislikes: [], intolerances: ['Laktose'] })).toBe(false);
    expect(fitsDislikes(d('Nudelsalat', ['Vollkornnudeln']), { dislikes: [], intolerances: ['Gluten'] })).toBe(false);
    expect(fitsDislikes(d('Linsensuppe', ['Rote Linsen']), { dislikes: [], intolerances: ['Gluten', 'Laktose'] })).toBe(true);
  });
});

describe('diet', () => {
  it('vegetarian refuses meat and fish words, but not plant look-alikes', () => {
    expect(fitsDiet(d('Bolognese', ['Hackfleisch']), 'vegetarisch')).toBe(false);
    expect(fitsDiet(d('Salat mit Thunfisch', ['Salat']), 'vegetarisch')).toBe(false);
    expect(fitsDiet(d('Pasta', ['Speckwürfel']), 'vegetarisch')).toBe(false);
    expect(fitsDiet(d('Bolognese', ['Sojahack', 'Gehackte Tomaten']), 'vegetarisch')).toBe(true);
    expect(fitsDiet(d('Bowl', ['Wildreis', 'Clementine']), 'vegetarisch')).toBe(true);
    expect(fitsDiet(d('Bolognese', ['Hackfleisch']), 'alles')).toBe(true);
  });

  it('vegan also refuses dairy, eggs and honey, but not oat milk or peanut butter', () => {
    expect(fitsDiet(d('Porridge', ['Milch']), 'vegan')).toBe(false);
    expect(fitsDiet(d('Toast', ['Ei']), 'vegan')).toBe(false);
    expect(fitsDiet(d('Bowl', ['Honig']), 'vegan')).toBe(false);
    expect(fitsDiet(d('Porridge', ['Hafermilch', 'Erdnussbutter', 'Kokosmilch']), 'vegan')).toBe(true);
  });

  it('the strictest diet among the eaters counts, and every dislike of every eater', () => {
    const veggie = { diet: 'vegetarisch' as const, ...none }, vegan = { diet: 'vegan' as const, ...none };
    expect(fitsEveryone(d('Porridge', ['Milch']), [veggie])).toBe(true);
    expect(fitsEveryone(d('Porridge', ['Milch']), [veggie, vegan])).toBe(false);
    expect(fitsEveryone(d('Curry', ['Koriander']), [veggie, { ...veggie, dislikes: ['Koriander'] }])).toBe(false);
  });

  it('no calorie, weight or healing talk', () => {
    expect(calmText('Nur 300 kcal')).toBe(false);
    expect(calmText('Perfekt zum Abnehmen')).toBe(false);
    expect(calmText('Mit Eiweiß für deine Muskeln')).toBe(true);
  });
});

describe('the bundled recipes', () => {
  it('are about 30, vegetarian, calm, cover every meal and say vegan truthfully', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(28);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const slot of ['fruehstueck', 'mittag', 'abend'] as const) expect(RECIPES.filter((r) => r.slots.includes(slot)).length).toBeGreaterThanOrEqual(8);
    for (const r of RECIPES) {
      expect(fitsDiet(r, 'vegetarisch'), r.id).toBe(true);
      if (r.vegan) expect(fitsDiet(r, 'vegan'), r.id).toBe(true);
      expect([r.title, ...r.steps].every(calmText), r.id).toBe(true);
      expect(r.proteinG).toBeGreaterThan(10);
    }
    // Lunches to take along keep for at least two days.
    expect(RECIPES.filter((r) => r.slots.includes('mittag')).every((r) => r.keepsDays >= 2)).toBe(true);
  });
});
