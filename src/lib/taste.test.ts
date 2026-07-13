import { describe, it, expect } from 'vitest';
import { circularMeanHue, hueDistance, hslDistance } from './taste';

describe('hueDistance', () => {
  it('wraps around 360', () => { expect(hueDistance(350, 10)).toBe(20); });
  it('plain distance', () => { expect(hueDistance(30, 60)).toBe(30); });
  it('is symmetric', () => { expect(hueDistance(10, 350)).toBe(20); });
});

describe('circularMeanHue', () => {
  it('averages across the 0/360 seam', () => {
    const m = circularMeanHue([350, 10], [1, 1]);
    expect(Math.min(m, 360 - m)).toBeLessThan(1); // ~0
  });
  it('weights pull the mean', () => {
    const m = circularMeanHue([0, 90], [3, 1]);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(45);
  });
});

describe('hslDistance', () => {
  it('is 0 for identical', () => {
    expect(hslDistance({ h: 200, s: 50, l: 50 }, { h: 200, s: 50, l: 50 })).toBe(0);
  });
  it('grows with hue gap', () => {
    const near = hslDistance({ h: 200, s: 50, l: 50 }, { h: 210, s: 50, l: 50 });
    const far = hslDistance({ h: 200, s: 50, l: 50 }, { h: 20, s: 50, l: 50 });
    expect(far).toBeGreaterThan(near);
  });
});

import { buildTasteVector, FilmSignal } from './taste';

const sig = (o: Partial<FilmSignal>): FilmSignal => ({
  id: 0, colorHue: 200, colorSat: 50, colorLit: 50, genre_ids: [18], weight: 1, ...o,
});

describe('buildTasteVector', () => {
  it('reports sample size', () => {
    const v = buildTasteVector([sig({ id: 1 }), sig({ id: 2 })]);
    expect(v.sampleSize).toBe(2);
  });
  it('centroid tracks the dominant colour', () => {
    const v = buildTasteVector([
      sig({ id: 1, colorHue: 210 }), sig({ id: 2, colorHue: 210 }), sig({ id: 3, colorHue: 30 }),
    ]);
    expect(hueDistance(v.hue, 210)).toBeLessThan(hueDistance(v.hue, 30));
  });
  it('normalizes genre affinity to <= 1', () => {
    const v = buildTasteVector([sig({ genre_ids: [18, 80] }), sig({ genre_ids: [18] })]);
    expect(v.genreAffinity[18]).toBeGreaterThan(v.genreAffinity[80]);
    expect(Math.max(...Object.values(v.genreAffinity))).toBeLessThanOrEqual(1);
  });
  it('skips films without colour', () => {
    const v = buildTasteVector([sig({ id: 1 }), sig({ id: 2, colorHue: undefined })]);
    expect(v.sampleSize).toBe(1);
  });
});
