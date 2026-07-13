export interface Hsl { h: number; s: number; l: number }

/** Minimum circular distance between two hues in degrees, 0..180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Weighted circular mean of hues (degrees), returns 0..360. */
export function circularMeanHue(hues: number[], weights: number[]): number {
  let x = 0, y = 0;
  for (let i = 0; i < hues.length; i++) {
    const r = (hues[i] * Math.PI) / 180;
    x += Math.cos(r) * weights[i];
    y += Math.sin(r) * weights[i];
  }
  if (x === 0 && y === 0) return 0;
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Normalized 0..1 distance in HSL space (hue circular). */
export function hslDistance(a: Hsl, b: Hsl): number {
  const dh = hueDistance(a.h, b.h) / 180;        // 0..1
  const ds = Math.abs(a.s - b.s) / 100;          // 0..1
  const dl = Math.abs(a.l - b.l) / 100;          // 0..1
  return (dh * 0.6 + ds * 0.25 + dl * 0.15);
}

export interface FilmSignal {
  id: number;
  colorHue?: number;
  colorSat?: number;
  colorLit?: number;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  vote_count?: number;
  weight: number;
}

export interface TasteVector {
  hue: number;
  sat: number;
  lit: number;
  genreAffinity: Record<number, number>;
  eraSkew: Record<string, number>;
  sampleSize: number;
}

function decadeOf(s?: string): string | null {
  const y = parseInt((s || '').slice(0, 4));
  if (!y) return null;
  return `${Math.floor(y / 10) * 10}s`;
}

export function buildTasteVector(signals: FilmSignal[]): TasteVector {
  const films = signals.filter(f => f.colorHue !== undefined);
  const hues = films.map(f => f.colorHue!);
  const weights = films.map(f => f.weight);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;

  const hue = circularMeanHue(hues, weights);
  const sat = films.reduce((a, f) => a + (f.colorSat ?? 50) * f.weight, 0) / wSum;
  const lit = films.reduce((a, f) => a + (f.colorLit ?? 50) * f.weight, 0) / wSum;

  const genreRaw: Record<number, number> = {};
  const eraRaw: Record<string, number> = {};
  for (const f of films) {
    for (const g of f.genre_ids || []) genreRaw[g] = (genreRaw[g] || 0) + f.weight;
    const dec = decadeOf(f.release_date || f.first_air_date);
    if (dec) eraRaw[dec] = (eraRaw[dec] || 0) + f.weight;
  }
  const gMax = Math.max(1, ...Object.values(genreRaw));
  const genreAffinity: Record<number, number> = {};
  for (const [k, v] of Object.entries(genreRaw)) genreAffinity[+k] = v / gMax;

  const eMax = Math.max(1, ...Object.values(eraRaw));
  const eraSkew: Record<string, number> = {};
  for (const [k, v] of Object.entries(eraRaw)) eraSkew[k] = v / eMax;

  return { hue, sat, lit, genreAffinity, eraSkew, sampleSize: films.length };
}

export interface CandidateFilm {
  id: number;
  colorHue?: number;
  colorSat?: number;
  colorLit?: number;
  genre_ids?: number[];
  vote_count?: number;
}

export const TASTE_WEIGHTS = { colour: 0.45, genre: 0.35, novelty: 0.20 };
const POP_CAP = 12000; // vote_count above this is treated as fully "mainstream"

export function scoreCandidate(film: CandidateFilm, taste: TasteVector): number {
  const hsl = { h: film.colorHue ?? 0, s: film.colorSat ?? 50, l: film.colorLit ?? 50 };
  const colourFit = 1 - hslDistance(hsl, { h: taste.hue, s: taste.sat, l: taste.lit });

  const gids = film.genre_ids || [];
  const genreFit = gids.length
    ? gids.reduce((a, g) => a + (taste.genreAffinity[g] || 0), 0) / gids.length
    : 0;

  const novelty = 1 - Math.min(1, (film.vote_count ?? 0) / POP_CAP);

  return TASTE_WEIGHTS.colour * colourFit
       + TASTE_WEIGHTS.genre * genreFit
       + TASTE_WEIGHTS.novelty * novelty;
}

/** Maximal Marginal Relevance: balance score against diversity to avoid a feed of look-alikes. */
export function mmrRerank(
  items: { film: CandidateFilm; score: number }[],
  lambda = 0.7,
  k = 60,
): CandidateFilm[] {
  const pool = [...items].sort((a, b) => b.score - a.score);
  const selected: { film: CandidateFilm; score: number }[] = [];
  const simTo = (a: CandidateFilm, b: CandidateFilm) =>
    1 - hslDistance(
      { h: a.colorHue ?? 0, s: a.colorSat ?? 50, l: a.colorLit ?? 50 },
      { h: b.colorHue ?? 0, s: b.colorSat ?? 50, l: b.colorLit ?? 50 },
    );

  while (selected.length < k && pool.length) {
    let bestIdx = 0, bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const maxSim = selected.length
        ? Math.max(...selected.map(s => simTo(pool[i].film, s.film)))
        : 0;
      const val = lambda * pool[i].score - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected.map(s => s.film);
}
