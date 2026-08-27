'use client';
import { useState, useEffect } from 'react';
import rtCache from '@/lib/rtCache';

export function useRtRating(movieId: number, mediaType: string, hovered: boolean): string | null | undefined {
  const [rt, setRt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!hovered) return;
    const cached = rtCache.get(movieId);
    if (cached !== undefined) { setRt(cached); return; }
    rtCache.set(movieId, null);
    fetch(`/api/ratings?tmdb_id=${movieId}&type=${mediaType}`)
      .then(r => r.json())
      .then(d => { const rating = d.rt ?? null; rtCache.set(movieId, rating); setRt(rating); })
      .catch(() => {});
  }, [hovered, movieId]);

  return rt;
}
