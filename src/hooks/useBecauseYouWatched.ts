'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Movie } from '@/lib/tmdb';

export interface BecauseYouWatchedResult {
  movie: Movie;
  similar: Movie[];
}

function jaccardScore(a: number[], b: number[]): number {
  const setA = new Set(a);
  const intersection = b.filter(x => setA.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

/** Returns the most recently watched film + similar films from the cache. Refreshes on refreshKey change. */
export function useBecauseYouWatched(allMovies: Movie[], refreshKey: number): BecauseYouWatchedResult | null {
  const { user } = useAuth();
  const [result, setResult] = useState<BecauseYouWatchedResult | null>(null);

  useEffect(() => {
    if (!user || allMovies.length === 0) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('watched')
        .select('tmdb_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (cancelled || !data?.[0]) return;

      const sourceFilm = allMovies.find(m => m.id === data[0].tmdb_id);
      if (!sourceFilm || !sourceFilm.genre_ids?.length) return;

      const similar = allMovies
        .filter(m => m.id !== sourceFilm.id && m.poster_path && m.genre_ids?.length)
        .map(m => ({
          film: m,
          score:
            jaccardScore(m.genre_ids!, sourceFilm.genre_ids!) * 0.7 +
            (1 - Math.abs((m.vote_average || 0) - (sourceFilm.vote_average || 0)) / 10) * 0.3,
        }))
        .filter(s => s.score > 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(s => s.film);

      if (!cancelled) setResult({ movie: sourceFilm, similar });
    })();

    return () => { cancelled = true; };
  }, [user?.id, allMovies.length, refreshKey]);

  return result;
}
