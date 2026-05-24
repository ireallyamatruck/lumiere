import { NextRequest, NextResponse } from 'next/server';

const cache = new Map<string, ColorResult>();

interface ColorResult {
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

function vibrancyScore(r: number, g: number, b: number, population: number): number {
  const [, s, l] = rgbToHsl(r, g, b);
  if (s < 20 || l < 8 || l > 92) return 0;
  // Strongly prefer mid-lightness saturated colors
  const lightnessScore = 1 - Math.abs((l - 48) / 48);
  // Use population² to strongly weight common colors
  return (s / 100) * lightnessScore * (population * population);
}

async function extractFromPath(imagePath: string, baseUrl: string): Promise<ColorResult | null> {
  const cacheKey = imagePath;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    const url = `${baseUrl}${imagePath}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();

    const Vibrant = (await import('node-vibrant')).default;
    const palette = await Vibrant.from(Buffer.from(buffer)).quality(1).getPalette();

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
        score: vibrancyScore(s!.rgb[0], s!.rgb[1], s!.rgb[2], s!.population),
      }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!swatches.length) return null;

    const best = swatches[0];
    const [h, sat, l] = rgbToHsl(best.rgb[0], best.rgb[1], best.rgb[2]);

    // Strict: reject if best swatch is still too grey or extreme
    if (sat < 20 || l < 10 || l > 90) return null;

    const result: ColorResult = {
      dominant: best.hex,
      palette: swatches.slice(0, 5).map(s => s.hex),
      hue: h,
      saturation: sat,
      lightness: l,
    };

    cache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      posterPaths?: string[];
      backdropPaths?: string[];
    };

    const results: Record<string, ColorResult | null> = {};
    const POSTER_BASE = 'https://image.tmdb.org/t/p/w185';
    const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w300';

    const allPaths = [
      ...(body.posterPaths || []).map(p => ({ path: p, base: POSTER_BASE })),
      ...(body.backdropPaths || []).map(p => ({ path: p, base: BACKDROP_BASE })),
    ];

    const BATCH = 8;
    for (let i = 0; i < allPaths.length; i += BATCH) {
      const batch = allPaths.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async ({ path, base }) => {
          const result = await extractFromPath(path, base);
          results[path] = result;
        })
      );
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'extraction failed' }, { status: 500 });
  }
}