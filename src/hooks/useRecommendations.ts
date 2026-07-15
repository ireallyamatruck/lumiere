'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Movie } from '@/lib/tmdb';
import {
  buildTasteVector, scoreCandidate, mmrRerank, FilmSignal, TasteVector,
} from '@/lib/taste';

export type RecStatus = 'idle' | 'loading' | 'cold' | 'ready';
const MIN_SIGNALS = 5;

export function useRecommendations(allMovies: Movie[], enabled: boolean, refreshKey = 0) {
  const { user } = useAuth();
  const [recs, setRecs] = useState<Movie[]>([]);
  const [taste, setTaste] = useState<TasteVector | null>(null);
  const [status, setStatus] = useState<RecStatus>('idle');
  const lastKey = useRef('');

  useEffect(() => {
    if (!enabled || !user || allMovies.length === 0) { setStatus('idle'); return; }
    const key = `${user.id}:${allMovies.length}:${refreshKey}`;
    // Re-entering the view with the same corpus: keep whatever we already computed,
    // but restore a truthful status instead of leaving it at 'idle'.
    if (key === lastKey.current) {
      setStatus(prev => (prev === 'idle' ? (taste ? 'ready' : recs.length ? 'cold' : 'idle') : prev));
      return;
    }
    lastKey.current = key;

    let cancelled = false;
    (async () => {
      setStatus('loading');
      const [{ data: watched }, { data: likes }, { data: ratings }] = await Promise.all([
        supabase.from('watched').select('tmdb_id').eq('user_id', user.id),
        supabase.from('likes').select('tmdb_id').eq('user_id', user.id),
        supabase.from('ratings').select('tmdb_id, rating').eq('user_id', user.id),
      ]);
      if (cancelled) return;

      const watchedIds = new Set((watched || []).map((w: any) => w.tmdb_id));
      const likedIds = new Set((likes || []).map((l: any) => l.tmdb_id));
      const ratingMap = new Map<number, number>((ratings || []).map((r: any) => [r.tmdb_id, r.rating]));
      const signalIds = new Set<number>([...watchedIds, ...likedIds, ...ratingMap.keys()]);

      if (signalIds.size < MIN_SIGNALS) {
        // Cold start: colour-diverse sampler over mid-popular films (explore mode).
        const seed = allMovies.filter(m => m.colorHue !== undefined);
        const sampled = mmrRerank(
          seed.map(m => ({ film: m, score: 1 - Math.min(1, (m.vote_count ?? 0) / 12000) })),
          0.5, 60,
        );
        if (cancelled) return;
        setRecs(sampled); setTaste(null); setStatus('cold');
        return;
      }

      const movieMap = new Map(allMovies.map(m => [m.id, m]));
      const signals: FilmSignal[] = [];
      for (const id of signalIds) {
        const m = movieMap.get(id);
        if (!m || m.colorHue === undefined) continue; // phase-1 approximation: skip unresolved films
        const rating = ratingMap.get(id);
        const weight = (likedIds.has(id) ? 2 : 1) * (rating ? rating / 3 : 1);
        signals.push({
          id, colorHue: m.colorHue, colorSat: m.colorSat, colorLit: m.colorLit,
          genre_ids: m.genre_ids, release_date: m.release_date, first_air_date: m.first_air_date,
          vote_count: m.vote_count, weight,
        });
      }

      if (signals.length < MIN_SIGNALS) { if (!cancelled) { setStatus('cold'); setRecs([]); } return; }

      const tasteVec = buildTasteVector(signals);
      const scored = allMovies
        .filter(m => !watchedIds.has(m.id) && m.colorHue !== undefined)
        .map(m => ({ film: m, score: scoreCandidate(m, tasteVec) }));
      const ranked = mmrRerank(scored, 0.7, 80);
      if (cancelled) return;

      setTaste(tasteVec); setRecs(ranked); setStatus('ready');
    })();

    return () => { cancelled = true; };
  }, [enabled, user?.id, allMovies.length, refreshKey]);

  return { recs, status, taste };
}
