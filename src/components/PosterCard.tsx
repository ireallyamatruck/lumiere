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
          className="font-display text-[13px] font-light leading-tight text-[#e2d9c8]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </div>
        <div className="text-[9px] text-neutral-500 tracking-widest mt-1">{year}</div>
      </div>
    </div>
  );
}
