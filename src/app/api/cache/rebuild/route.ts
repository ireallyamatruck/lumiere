import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// Triggers a fresh fetch+store for movies and TV by calling /api/movies with cache bypass.
// Protected by CACHE_REBUILD_SECRET env var.
// Call: POST /api/cache/rebuild?secret=YOUR_SECRET&type=movie
//       POST /api/cache/rebuild?secret=YOUR_SECRET&type=tv
// Or both at once (takes longer): POST /api/cache/rebuild?secret=YOUR_SECRET

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CACHE_REBUILD_SECRET || secret !== process.env.CACHE_REBUILD_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const typeParam = req.nextUrl.searchParams.get('type');
  const types = typeParam ? [typeParam] : ['movie', 'tv'];
  const base = new URL(req.url).origin;

  const results: Record<string, any> = {};
  for (const type of types) {
    try {
      // Force-expire the cache by deleting existing rows first
      const { supabaseAdmin } = await import('@/lib/supabase-admin');
      await supabaseAdmin
        .from('movies_cache')
        .update({ cached_at: '2000-01-01T00:00:00Z' })
        .eq('media_type', type);

      // Trigger a fresh fetch via the movies route
      const res = await fetch(`${base}/api/movies?type=${type}`, {
        next: { revalidate: 0 },
      });
      const data = await res.json();
      results[type] = { count: data.movies?.length ?? 0, fromCache: data.fromCache };
    } catch (e) {
      results[type] = { error: String(e) };
    }
  }

  return NextResponse.json({ rebuilt: results, at: new Date().toISOString() });
}
