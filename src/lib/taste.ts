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
