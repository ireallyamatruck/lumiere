import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 300;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;

async function fetchPage(type: string, page: number): Promise<any[]> {
  const url = `${TMDB_BASE}/discover/${type}?api_key=${API_KEY}&sort_by=popularity.desc&vote_count.gte=50&page=${page}&include_adult=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).filter((m: any) => m.poster_path);
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CACHE_REBUILD_SECRET || secret !== process.env.CACHE_REBUILD_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get('type') || 'movie';
  const PAGES = 500;
  const CHUNK = 25;
  const all: any[] = [];
  const seen = new Set<number>();

  // Fetch all pages from TMDB in parallel chunks
  for (let start = 1; start <= PAGES; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, PAGES);
    const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const results = await Promise.all(pageNums.map(p => fetchPage(type, p)));
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

  const STORE_CHUNK = 500;
  for (let i = 0; i < rows.length; i += STORE_CHUNK) {
    const { error } = await supabaseAdmin
      .from('movies_cache')
      .upsert(rows.slice(i, i + STORE_CHUNK));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    type,
    count: all.length,
    stored: rows.length,
    at: new Date().toISOString(),
  });
}
