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
