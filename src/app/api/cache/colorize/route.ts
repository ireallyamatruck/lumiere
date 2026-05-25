import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 60;

const POSTER_BASE = 'https://image.tmdb.org/t/p/w185';

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
  const lightnessScore = 1 - Math.abs((l - 48) / 48);
  return (s / 100) * lightnessScore * (population * population);
}

async function extractColor(posterPath: string): Promise<any | null> {
  try {
    const res = await fetch(`${POSTER_BASE}${posterPath}`);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const Vibrant = (await import('node-vibrant')).default;
    const palette = await Vibrant.from(Buffer.from(buffer)).quality(1).getPalette();
    const swatches = [
      palette.Vibrant, palette.LightVibrant, palette.DarkVibrant,
      palette.Muted, palette.LightMuted, palette.DarkMuted,
    ]
      .filter(Boolean)
      .map(s => ({
        hex: s!.hex, rgb: s!.rgb, population: s!.population,
        score: vibrancyScore(s!.rgb[0], s!.rgb[1], s!.rgb[2], s!.population),
      }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!swatches.length) return null;
    const best = swatches[0];
    const [h, sat, l] = rgbToHsl(best.rgb[0], best.rgb[1], best.rgb[2]);
    if (sat < 20 || l < 10 || l > 90) return null;
    return {
      path: posterPath,
      dominant: best.hex,
      palette: swatches.slice(0, 5).map(s => s.hex),
      hue: h,
      saturation: sat,
      lightness: l,
    };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CACHE_REBUILD_SECRET || secret !== process.env.CACHE_REBUILD_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const page = parseInt(req.nextUrl.searchParams.get('page') || '0');
  const limit = 50; // posters per call — safe within 60s

  // Find poster paths that are in movies_cache but not yet in color_cache
  const { data: movies } = await supabaseAdmin
    .from('movies_cache')
    .select('poster_path')
    .not('poster_path', 'is', null)
    .order('popularity_rank', { ascending: true })
    .range(page * limit, (page + 1) * limit - 1);

  if (!movies || movies.length === 0) {
    return NextResponse.json({ done: true, page, processed: 0 });
  }

  const paths = movies.map(m => m.poster_path as string);

  // Check which ones already have colors
  const { data: existing } = await supabaseAdmin
    .from('color_cache')
    .select('path')
    .in('path', paths);
  const alreadyDone = new Set(existing?.map(e => e.path) || []);
  const pending = paths.filter(p => !alreadyDone.has(p));

  // Extract colors in parallel batches of 10
  const BATCH = 10;
  let processed = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(extractColor));
    const toInsert = results.filter(Boolean);
    if (toInsert.length > 0) {
      await supabaseAdmin.from('color_cache').upsert(toInsert);
    }
    processed += toInsert.length;
  }

  return NextResponse.json({
    page,
    total_in_page: paths.length,
    already_colored: alreadyDone.size,
    newly_colored: processed,
    done: movies.length < limit,
  });
}
