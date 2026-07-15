'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Movie, posterUrl, getTitle, getYear } from '@/lib/tmdb';
import rtCache from '@/lib/rtCache';

interface Props {
  movie: Movie;
  index: number;
  onClick: (movie: Movie) => void;
}

export default function PosterCard({ movie, index, onClick }: Props) {
  const [hovered, setHovered] = useState(false);
  const [rt, setRt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!hovered) return;
    const cached = rtCache.get(movie.id);
    if (cached !== undefined) { setRt(cached); return; }
    // Claim the slot immediately to prevent duplicate fetches on rapid hover
    rtCache.set(movie.id, null);
    const type = movie.title ? 'movie' : 'tv';
    fetch(`/api/ratings?tmdb_id=${movie.id}&type=${type}`)
      .then(r => r.json())
      .then(d => {
        const rating = d.rt ?? null;
        rtCache.set(movie.id, rating);
        setRt(rating);
      })
      .catch(() => {});
  }, [hovered, movie.id]);

  if (!movie.poster_path) return null;

  const title = getTitle(movie);
  const year = getYear(movie);
  const dot = movie.dominantColor || '#555';

  return (
    <div
      className="poster-card animate-fade-up"
      style={{ animationDelay: `${Math.min(index * 25, 600)}ms`, opacity: 0 }}
      onClick={() => onClick(movie)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Image
        src={posterUrl(movie.poster_path, 'w342')}
        alt={title}
        fill
        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 160px"
        className="object-cover"
        unoptimized
      />

      <div className="color-pip" style={{ background: dot }} />

      <div className="poster-overlay">
        <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {movie.vote_average > 0 && (
            <span style={{ background: '#F5C518', color: '#000', fontSize: '9px', fontWeight: 800, padding: '2px 5px', borderRadius: '2px', letterSpacing: '0.03em', lineHeight: '14px' }}>
              IMDb {movie.vote_average.toFixed(1)}
            </span>
          )}
          {rt && (
            <span style={{ background: '#FA320A', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '2px 5px', borderRadius: '2px', letterSpacing: '0.03em', lineHeight: '14px' }}>
              RT {rt}
            </span>
          )}
        </div>

        <div
          className="font-display font-light leading-tight"
          style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: '#f5f0e8' }}
        >
          {title}
        </div>
        <div style={{ fontSize: '11px', color: '#aaa', letterSpacing: '0.12em', marginTop: '4px' }}>
          {year}
        </div>
      </div>
    </div>
  );
}
