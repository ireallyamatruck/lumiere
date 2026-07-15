import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

const MOORE_BASE = 'https://www.mooremetrics.com/wp-json/mooremetrics/v1';
const TMDB_BASE = 'https://api.themoviedb.org/3';

type Characteristics = Record<string, number>;

interface MooreItem {
  id: string;
  name: string;
  characteristics: Characteristics;
}

interface SimilarMovie {
  mooreId: string;
  mooreName: string;
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  vote_average: number;
  overview: string;
  genre_ids: number[];
}

async function searchMovieDive(title: string): Promise<MooreItem | null> {
  const res = await fetch(
    `${MOORE_BASE}/domains/moviedive/items?search=${encodeURIComponent(title)}&limit=5`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const items: MooreItem[] = data.items || [];
  return items[0] || null;
}

const getCachedRecommendations = unstable_cache(
  async (charKey: string, characteristics: Characteristics, apiKey: string): Promise<{ id: string; name: string; score: number }[]> => {
    const res = await fetch(`${MOORE_BASE}/recommend-by-preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        domain: 'moviedive',
        preferences: characteristics,
        limit: 5,
        include_characteristics: false,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.recommendations || [];
  },
  ['moviedive-recs'],
  { revalidate: 86400 }
);

async function enrichWithTmdb(name: string, tmdbKey: string): Promise<SimilarMovie | null> {
  const res = await fetch(
    `${TMDB_BASE}/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(name)}&include_adult=false`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const movie = data.results?.[0];
  if (!movie || !movie.poster_path) return null;
  return { mooreId: name, mooreName: name, ...movie };
}

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title');
  if (!title) return NextResponse.json({ found: false });

  const matched = await searchMovieDive(title);
  if (!matched) return NextResponse.json({ found: false });

  const characteristics = matched.characteristics || {};
  let similar: SimilarMovie[] = [];

  const apiKey = process.env.MOOREMETRICS_API_KEY;
  const tmdbKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (apiKey && tmdbKey && Object.keys(characteristics).length > 0) {
    try {
      const charKey = JSON.stringify(characteristics);
      const recs = await getCachedRecommendations(charKey, characteristics, apiKey);
      const enriched = await Promise.all(recs.map(r => enrichWithTmdb(r.name, tmdbKey)));
      similar = enriched.filter((m): m is SimilarMovie => m !== null);
    } catch { /* silent fail — similar movies are a non-critical enhancement */ }
  }

  return NextResponse.json({ found: true, movieName: matched.name, characteristics, similar });
}
