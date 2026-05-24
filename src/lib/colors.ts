'use client';

export interface ColorPalette {
  dominant: string;
  palette: string[];
  hue: number;
  saturation: number;
  lightness: number;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Score a color by how "vibrant" and useful it is for classification.
// Heavily penalizes near-black, near-white, and near-grey.
function vibrancyScore(r: number, g: number, b: number): number {
  const [, s, l] = rgbToHsl(r, g, b);
  if (s < 15) return 0;
  if (l < 10 || l > 90) return 0;
  // Sweet spot: saturated, mid-lightness
  const lightnessScore = 1 - Math.abs((l - 50) / 50);
  return (s / 100) * lightnessScore;
}

export async function extractColors(imageUrl: string): Promise<ColorPalette | null> {
  try {
    // Dynamically import Vibrant to keep it client-only
    const Vibrant = (await import('node-vibrant')).default;
    const palette = await Vibrant.from(imageUrl)
      .quality(1)
      .getPalette();

    // Collect all swatches Vibrant found, ranked by vibrancy
    const swatches = [
      palette.Vibrant,
      palette.LightVibrant,
      palette.DarkVibrant,
      palette.Muted,
      palette.LightMuted,
      palette.DarkMuted,
    ]
      .filter(Boolean)
      .map(s => ({
        hex: s!.hex,
        rgb: s!.rgb,
        population: s!.population,
        score: vibrancyScore(s!.rgb[0], s!.rgb[1], s!.rgb[2]) * Math.log1p(s!.population),
      }))
      .sort((a, b) => b.score - a.score);

    if (!swatches.length) return null;

    // Best swatch = highest vibrancy * population score
    const best = swatches[0];
    const [h, sat, l] = rgbToHsl(best.rgb[0], best.rgb[1], best.rgb[2]);

    return {
      dominant: best.hex,
      palette: swatches.map(s => s.hex),
      hue: h,
      saturation: sat,
      lightness: l,
    };
  } catch {
    // Fallback: canvas center-crop with tighter filters
    return extractColorsCanvas(imageUrl);
  }
}

// Fallback canvas extraction with center-crop bias
async function extractColorsCanvas(imageUrl: string): Promise<ColorPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 100;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);

        // Sample only the center 60% of the poster
        const margin = Math.floor(size * 0.2);
        const cropSize = size - margin * 2;
        const data = ctx.getImageData(margin, margin, cropSize, cropSize).data;

        const scored: Array<{ r: number; g: number; b: number; score: number }> = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const score = vibrancyScore(r, g, b);
          if (score > 0.1) scored.push({ r, g, b, score });
        }

        if (scored.length < 5) { resolve(null); return; }

        // Sort by score, take top pixel, compute hue
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        const [h, s, l] = rgbToHsl(best.r, best.g, best.b);

        const paletteHexes = scored
          .filter((_, i) => i % Math.floor(scored.length / 5) === 0)
          .slice(0, 5)
          .map(p => rgbToHex(p.r, p.g, p.b));

        resolve({
          dominant: rgbToHex(best.r, best.g, best.b),
          palette: paletteHexes,
          hue: h,
          saturation: s,
          lightness: l,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export const HUE_RANGES = [
  { label: 'crimson',  min: 345, max: 15,  color: '#8B2020', display: 'hsl(0,65%,35%)' },
  { label: 'ember',    min: 15,  max: 35,  color: '#8B4A20', display: 'hsl(22,65%,35%)' },
  { label: 'amber',    min: 35,  max: 55,  color: '#8B6A20', display: 'hsl(45,65%,35%)' },
  { label: 'gold',     min: 55,  max: 75,  color: '#7A8020', display: 'hsl(58,65%,35%)' },
  { label: 'sage',     min: 75,  max: 110, color: '#3D7A20', display: 'hsl(95,55%,30%)' },
  { label: 'forest',   min: 110, max: 145, color: '#207A3D', display: 'hsl(135,55%,28%)' },
  { label: 'teal',     min: 145, max: 185, color: '#207A6A', display: 'hsl(168,55%,28%)' },
  { label: 'azure',    min: 185, max: 215, color: '#204E8B', display: 'hsl(205,65%,34%)' },
  { label: 'indigo',   min: 215, max: 245, color: '#20208B', display: 'hsl(230,65%,34%)' },
  { label: 'violet',   min: 245, max: 275, color: '#4A208B', display: 'hsl(258,65%,34%)' },
  { label: 'fuchsia',  min: 275, max: 310, color: '#7A208B', display: 'hsl(285,65%,34%)' },
  { label: 'rose',     min: 310, max: 345, color: '#8B2060', display: 'hsl(325,65%,34%)' },
];

export function hueToRange(hue: number): number {
  for (let i = 0; i < HUE_RANGES.length; i++) {
    const r = HUE_RANGES[i];
    if (r.min > r.max) {
      if (hue >= r.min || hue < r.max) return i;
    } else {
      if (hue >= r.min && hue < r.max) return i;
    }
  }
  return 0;
}