import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!;
const OMDB_KEY = process.env.OMDB_API_KEY;

export async function GET(req: NextRequest) {
  const tmdbId = req.nextUrl.searchParams.get('tmdb_id');
  const type = req.nextUrl.searchParams.get('type') || 'movie';
  if (!tmdbId) return NextResponse.json({ error: 'missing tmdb_id' }, { status: 400 });

  try {
    // Get imdb_id from TMDB
    const tmdbRes = await fetch(`${TMDB_BASE}/${type}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`);
    const tmdbData = await tmdbRes.json();
    const imdbId = tmdbData.imdb_id;
    if (!imdbId || !OMDB_KEY) return NextResponse.json({ rt: null, imdbId: imdbId || null });

    // Fetch RT rating from OMDb
    const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`);
    const omdbData = await omdbRes.json();
    const rtRating = omdbData.Ratings?.find((r: any) => r.Source === 'Rotten Tomatoes')?.Value || null;
    const imdbRating = omdbData.imdbRating !== 'N/A' ? omdbData.imdbRating : null;

    return NextResponse.json(
      { rt: rtRating, imdbId, imdbRating },
      { headers: { 'Cache-Control': 'public, s-maxage=86400' } }
    );
  } catch {
    return NextResponse.json({ rt: null, imdbId: null });
  }
}
