import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { list } from '@vercel/blob';
import { Movie } from '@/lib/tmdb';

export const maxDuration = 60;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;
const CACHE_TTL_HOURS = 20;

function rowToMovie(row: any): Movie {
  return {
    id: row.tmdb_id,
    title: row.title ?? undefined,
    poster_path: row.poster_path,
    backdrop_path: row.backdrop_path,
    overview: row.overview ?? '',
    release_date: row.release_date ?? undefined,
    first_air_date: row.first_air_date ?? undefined,
    vote_average: row.vote_average ?? 0,
    vote_count: row.vote_count ?? 0,
    genre_ids: row.genre_ids ?? [],
    media_type: row.media_type,
    dominantColor: row.dominant_color ?? undefined,
    palette: row.palette ?? undefined,
    colorHue: row.color_hue ?? undefined,
    colorSat: row.color_sat ?? undefined,
    colorLit: row.color_lit ?? undefined,
  };
}

async function fromBlob(type: string): Promise<Movie[] | null> {
  try {
    const { blobs } = await list({ prefix: `cache/movies-${type}.json` });
    if (!blobs.length) return null;

    // list returns newest first — grab the most recent
    const latest = blobs[0];

    // Skip if older than 26 hours (rebuild is nightly, give 2h buffer)
    const age = Date.now() - new Date(latest.uploadedAt).getTime();
    if (age > 26 * 60 * 60 * 1000) return null;

    const res = await fetch(latest.url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.movies || []).map(rowToMovie);
  } catch {
    return null;
  }
}

async function fromSupabase(type: string): Promise<Movie[]> {
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { count } = await supabaseAdmin
    .from('movies_cache')
    .select('*', { count: 'exact', head: true })
    .eq('media_type', type)
    .gt('cached_at', cutoff);

  if (!count || count === 0) return [];

  const PAGE_SIZE = 1000;
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(count / PAGE_SIZE) }, (_, i) =>
      supabaseAdmin
        .from('movies_cache')
        .select('*')
        .eq('media_type', type)
        .gt('cached_at', cutoff)
        .order('popularity_rank', { ascending: true })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
    )
  );
  const movies = pages.flatMap(({ data }) => (data || []).map(rowToMovie));

  // Merge color data
  const posterPaths = movies.map(m => m.poster_path).filter(Boolean) as string[];
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
  movies.forEach(m => {
    if (!m.poster_path) return;
    const c = colorMap.get(m.poster_path);
    if (c) {
      m.dominantColor = c.dominant;
      m.palette = c.palette;
      m.colorHue = c.hue;
      m.colorSat = c.saturation;
      m.colorLit = c.lightness;
    }
  });

  return movies;
}

async function fromTmdb(type: string): Promise<Movie[]> {
  const PAGES = 200;
  const CHUNK = 20;
  const all: Movie[] = [];
  const seen = new Set<number>();

  for (let start = 1; start <= PAGES; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, PAGES);
    const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const results = await Promise.all(pageNums.map(async p => {
      const url = `${TMDB_BASE}/discover/${type}?api_key=${API_KEY}&sort_by=popularity.desc&vote_count.gte=20&page=${p}&include_adult=false`;
      try {
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).filter((m: any) => m.poster_path).map((m: any) => ({ ...m, media_type: type }));
      } catch { return []; }
    }));
    results.flat().forEach((m: any) => {
      if (!seen.has(m.id)) { seen.add(m.id); all.push(m); }
    });
    await new Promise(r => setTimeout(r, 100));
  }
  return all;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || 'movie';

  // ── 1. Try Vercel Blob (fastest: ~100ms, CDN-served) ──────────────────────
  const blobMovies = await fromBlob(type);
  if (blobMovies && blobMovies.length > 100) {
    return NextResponse.json(
      { movies: blobMovies, source: 'blob' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    );
  }

  // ── 2. Try Supabase cache (medium: ~2s) ───────────────────────────────────
  try {
    const supabaseMovies = await fromSupabase(type);
    if (supabaseMovies.length > 100) {
      return NextResponse.json(
        { movies: supabaseMovies, source: 'supabase' },
        { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
      );
    }
  } catch { /* fall through */ }

  // ── 3. Last resort: live TMDB fetch (slow: ~10s, no cache available) ──────
  try {
    const liveMovies = await fromTmdb(type);
    return NextResponse.json(
      { movies: liveMovies, source: 'tmdb' },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } }
    );
  } catch (e) {
    return NextResponse.json({ movies: [], source: 'error', error: String(e) });
  }
}
