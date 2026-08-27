'use client';

import { useEffect, useMemo, useState } from 'react';
import { Movie } from '@/lib/tmdb';

const STORAGE_KEY = 'lumiere_browse_history';
const MAX_HISTORY = 10;

interface BrowseEntry {
  id: number;
  genre_ids: number[];
  vote_average: number;
}

/** Call this when the user opens a movie modal. Persists to localStorage and notifies listeners. */
export function trackBrowse(movie: Movie) {
  if (typeof window === 'undefined') return;
  const entry: BrowseEntry = {
    id: movie.id,
    genre_ids: movie.genre_ids || [],
    vote_average: movie.vote_average || 0,
  };
  const existing: BrowseEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const deduped = existing.filter(e => e.id !== entry.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...deduped].slice(0, MAX_HISTORY)));
  window.dispatchEvent(new CustomEvent('lumiere:browse'));
}

function scoreAgainstHistory(film: Movie, history: BrowseEntry[]): number {
  let best = 0;
  for (const src of history) {
    const srcSet = new Set(src.genre_ids);
    const candGenres = film.genre_ids || [];
    const intersection = candGenres.filter(g => srcSet.has(g)).length;
    const union = new Set([...src.genre_ids, ...candGenres]).size;
    const genreSim = union > 0 ? intersection / union : 0;
    const ratingProx = 1 - Math.abs((film.vote_average || 0) - src.vote_average) / 10;
    const score = genreSim * 0.7 + ratingProx * 0.3;
    if (score > best) best = score;
  }
  return best;
}

/** Returns movies similar to what the user has recently browsed, derived from localStorage. */
export function useRecentlyBrowsed(allMovies: Movie[]): Movie[] {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    window.addEventListener('lumiere:browse', handler);
    return () => window.removeEventListener('lumiere:browse', handler);
  }, []);

  return useMemo(() => {
    if (typeof window === 'undefined' || allMovies.length === 0) return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const history: BrowseEntry[] = JSON.parse(raw);
    if (history.length === 0) return [];
    const historyIds = new Set(history.map(h => h.id));
    return allMovies
      .filter(m => !historyIds.has(m.id) && m.poster_path)
      .map(m => ({ film: m, score: scoreAgainstHistory(m, history) }))
      .filter(s => s.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(s => s.film);
  }, [tick, allMovies]);
}
