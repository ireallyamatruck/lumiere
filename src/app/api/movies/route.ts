import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
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

async function fetchTmdbPage(type: string, page: number): Promise<Movie[]> {
  const url = `${TMDB_BASE}/discover/${type}?api_key=${API_KEY}&sort_by=popularity.desc&vote_count.gte=50&page=${page}&include_adult=false`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((m: any) => m.poster_path)
      .map((m: any) => ({ ...m, media_type: type }));
  } catch { return []; }
}

async function fetchAndStore(type: string): Promise<Movie[]> {
  const PAGES = 200;
  const CHUNK = 20;
  const all: Movie[] = [];
  const seen = new Set<number>();

  for (let start = 1; start <= PAGES; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, PAGES);
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const results = await Promise.all(pages.map(p => fetchTmdbPage(type, p)));
    results.flat().forEach(m => {
      if (!seen.has(m.id)) { seen.add(m.id); all.push(m); }
    });
    await new Promise(r => setTimeout(r, 100));
  }

  // Store in Supabase in chunks of 500
  const rows = all.map((m, i) => ({
    tmdb_id: m.id,
    media_type: type,
    title: m.title ?? m.name ?? null,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    overview: m.overview,
    release_date: m.release_date ?? null,
    first_air_date: m.first_air_date ?? null,
    vote_average: m.vote_average,
    vote_count: m.vote_count,
    genre_ids: m.genre_ids,
    popularity_rank: i,
    cached_at: new Date().toISOString(),
  }));

  const STORE_CHUNK = 500;
  for (let i = 0; i < rows.length; i += STORE_CHUNK) {
    await supabaseAdmin.from('movies_cache').upsert(rows.slice(i, i + STORE_CHUNK));
  }

  return all;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || 'movie';
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

  // Check cache freshness via a single count query first
  const { count } = await supabaseAdmin
    .from('movies_cache')
    .select('*', { count: 'exact', head: true })
    .eq('media_type', type)
    .gt('cached_at', cutoff);

  if (count && count > 0) {
    const PAGE_SIZE = 1000;
    const pageCount = Math.ceil(count / PAGE_SIZE);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, i) =>
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

    // Merge color data from color_cache so discovery mode works immediately
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
    colorBatches.forEach(({ data }) => data?.forEach(c => colorMap.set(c.path, c)));
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

    return NextResponse.json(
      { movies, fromCache: true },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
    );
  }

  // Cache miss — fetch from TMDB and store
  try {
    const movies = await fetchAndStore(type);
    return NextResponse.json({ movies, fromCache: false });
  } catch (e) {
    return NextResponse.json({ movies: [], fromCache: false, error: String(e) });
  }
}
