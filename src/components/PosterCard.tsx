'use client';

import Image from 'next/image';
import { Movie, posterUrl, getTitle, getYear } from '@/lib/tmdb';

interface Props {
  movie: Movie;
  index: number;
  onClick: (movie: Movie) => void;
}

export default function PosterCard({ movie, index, onClick }: Props) {
  if (!movie.poster_path) return null;

  const title = getTitle(movie);
  const year = getYear(movie);
  const dot = movie.dominantColor || '#555';

  return (
    <div
      className="poster-card animate-fade-up"
      style={{ animationDelay: `${Math.min(index * 25, 600)}ms`, opacity: 0 }}
      onClick={() => onClick(movie)}
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
