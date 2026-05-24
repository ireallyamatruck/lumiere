import { NextRequest, NextResponse } from 'next/server';

// In-memory cache — persists across requests in the same serverless instance
const cache = new Map<string, { dominant: string; palette: string[]; hue: number; saturation: number; lightness: number }>();

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

function vibrancyScore(r: number, g: number, b: number): number {
  const [, s, l] = rgbToHsl(r, g, b);
  if (s < 15 || l < 10 || l > 90) return 0;
  const lightnessScore = 1 - Math.abs((l - 50) / 50);
  return (s / 100) * lightnessScore;
}

async function extractFromUrl(imageUrl: string) {
  // Fetch the image as a buffer
  const res = await fetch(imageUrl);
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();

  // Use Vibrant via node-vibrant (works server-side)
  const Vibrant = (await import('node-vibrant')).default;
  const palette = await Vibrant.from(Buffer.from(buffer)).getPalette();

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

  const best = swatches[0];
  const [h, sat, l] = rgbToHsl(best.rgb[0], best.rgb[1], best.rgb[2]);

  return {
    dominant: best.hex,
    palette: swatches.map(s => s.hex),
    hue: h,
    saturation: sat,
    lightness: l,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { posterPaths } = await req.json() as { posterPaths: string[] };
    if (!posterPaths?.length) return NextResponse.json({ results: {} });

    const results: Record<string, ReturnType<typeof extractFromUrl> extends Promise<infer T> ? T : never> = {};
    const toFetch = posterPaths.filter(p => !cache.has(p));

    // Process in parallel batches of 8
    const BATCH = 8;
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const batch = toFetch.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (path) => {
          try {
            const url = `https://image.tmdb.org/t/p/w185${path}`;
            const result = await extractFromUrl(url);
            if (result) {
              cache.set(path, result);
              results[path] = result;
            }
          } catch {
            // skip failed extractions
          }
        })
      );
    }

    // Include cached results too
    posterPaths.forEach(p => {
      if (cache.has(p) && !results[p]) {
        results[p] = cache.get(p)!;
      }
    });

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: 'extraction failed' }, { status: 500 });
  }
}
