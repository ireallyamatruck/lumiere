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

import { scoreCandidate, mmrRerank, CandidateFilm } from './taste';

const taste = buildTasteVector([
  sig({ id: 1, colorHue: 210, genre_ids: [18] }),
  sig({ id: 2, colorHue: 210, genre_ids: [18] }),
  sig({ id: 3, colorHue: 200, genre_ids: [18, 80] }),
]);

const cand = (o: Partial<CandidateFilm>): CandidateFilm => ({
  id: 0, colorHue: 210, colorSat: 50, colorLit: 50, genre_ids: [18], vote_count: 500, ...o,
});

describe('scoreCandidate', () => {
  it('scores colour-and-genre-aligned films higher', () => {
    const aligned = scoreCandidate(cand({ id: 10, colorHue: 210, genre_ids: [18] }), taste);
    const off = scoreCandidate(cand({ id: 11, colorHue: 40, genre_ids: [35] }), taste);
    expect(aligned).toBeGreaterThan(off);
  });
  it('novelty dampens mega-popular films (push not pull)', () => {
    const niche = scoreCandidate(cand({ id: 12, vote_count: 300 }), taste);
    const blockbuster = scoreCandidate(cand({ id: 13, vote_count: 30000 }), taste);
    expect(niche).toBeGreaterThan(blockbuster);
  });
});

describe('mmrRerank', () => {
  it('returns at most k and avoids near-duplicates up front', () => {
    const items = [
      { film: cand({ id: 1, colorHue: 210 }), score: 0.9 },
      { film: cand({ id: 2, colorHue: 211 }), score: 0.89 }, // near-dup of 1
      { film: cand({ id: 3, colorHue: 40 }),  score: 0.7 },
    ];
    const out = mmrRerank(items, 0.7, 2);
    expect(out).toHaveLength(2);
    expect(out.map(f => f.id)).toContain(1);
    expect(out.map(f => f.id)).toContain(3); // diversity beats the near-dup #2
  });
});
