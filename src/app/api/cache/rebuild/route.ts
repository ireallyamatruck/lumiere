import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { put } from '@vercel/blob';

export const maxDuration = 300;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;

async function fetchPage(type: string, page: number): Promise<any[]> {
  // vote_count.gte=20 — enough signal to be real, low enough to hit ~10k results
  const url = `${TMDB_BASE}/discover/${type}?api_key=${API_KEY}&sort_by=popularity.desc&vote_count.gte=20&page=${page}&include_adult=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).filter((m: any) => m.poster_path);
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  // Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron-triggered
  // requests when CRON_SECRET is set as an env var — nothing sensitive lives in the URL.
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get('type') || 'movie';
  // TMDB caps at 500 pages × 20 results = 10,000 max
  const PAGES = 500;
  const CHUNK = 25;
  const all: any[] = [];
  const seen = new Set<number>();

  // Fetch all TMDB pages in parallel chunks
  for (let start = 1; start <= PAGES; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, PAGES);
    const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const results = await Promise.all(pageNums.map(p => fetchPage(type, p)));
    results.flat().forEach(m => {
      if (!seen.has(m.id)) { seen.add(m.id); all.push(m); }
    });
    await new Promise(r => setTimeout(r, 80));
  }

  // Build rows for Supabase
  const rows = all.map((m, i) => ({
    tmdb_id: m.id,
    media_type: type,
    title: m.title ?? m.name ?? null,
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    overview: m.overview ?? '',
    release_date: m.release_date ?? null,
    first_air_date: m.first_air_date ?? null,
    vote_average: m.vote_average ?? 0,
    vote_count: m.vote_count ?? 0,
    genre_ids: m.genre_ids ?? [],
    popularity_rank: i,
    cached_at: new Date().toISOString(),
  }));

  // Store in Supabase
  const STORE_CHUNK = 500;
  for (let i = 0; i < rows.length; i += STORE_CHUNK) {
    const { error } = await supabaseAdmin
      .from('movies_cache')
      .upsert(rows.slice(i, i + STORE_CHUNK));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch color data for all these movies from color_cache
  const posterPaths = rows.map(r => r.poster_path).filter(Boolean) as string[];
  const COLOR_BATCH = 500;
  const colorBatches = await Promise.all(
    Array.from({ length: Math.ceil(posterPaths.length / COLOR_BATCH) }, (_, i) =>
      supabaseAdmin
        .from('color_cache')
        .select('path, dominant, palette, hue, saturation, lightness')
        .in('path', posterPaths.slice(i * COLOR_BATCH, (i + 1) * COLOR_BATCH))
    )
  );
  const colorMap = new Map<string, any>();
  colorBatches.forEach(({ data }) => data?.forEach((c: any) => colorMap.set(c.path, c)));

  // Merge colors into rows — this is what gets written to blob
  const enriched = rows.map(r => {
    const c = r.poster_path ? colorMap.get(r.poster_path) : null;
    return {
      ...r,
      dominant_color: c?.dominant ?? null,
      palette: c?.palette ?? null,
      color_hue: c?.hue ?? null,
      color_sat: c?.saturation ?? null,
      color_lit: c?.lightness ?? null,
    };
  });

  // Write merged JSON to Vercel Blob — this is what users will actually load
  let blobUrl: string | null = null;
  try {
    const blob = await put(
      `cache/movies-${type}.json`,
      JSON.stringify({ movies: enriched, rebuilt_at: new Date().toISOString(), count: enriched.length }),
      {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json',
      }
    );
    blobUrl = blob.url;
  } catch (e) {
    console.error('Blob write failed:', e);
  }

  return NextResponse.json({
    type,
    count: all.length,
    stored: rows.length,
    colored: colorMap.size,
    blobUrl,
    at: new Date().toISOString(),
  });
}
