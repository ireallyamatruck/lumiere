'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Movie, posterUrl, getTitle, getYear } from '@/lib/tmdb';
import { useRtRating } from '@/hooks/useRtRating';

interface Props {
  title: string;
  movies: Movie[];
  onMovieClick: (movie: Movie) => void;
  loading?: boolean;
}

function RowCard({ movie, onMovieClick }: { movie: Movie; onMovieClick: (m: Movie) => void }) {
  const [hovered, setHovered] = useState(false);
  const rt = useRtRating(movie.id, movie.title ? 'movie' : 'tv', hovered);

  return (
    <button
      onClick={() => onMovieClick(movie)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ flexShrink: 0, width: '120px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
    >
      <div style={{ width: '120px', height: '180px', borderRadius: '3px', overflow: 'hidden', background: '#111', position: 'relative', marginBottom: '6px' }}>
        <Image
          src={posterUrl(movie.poster_path!, 'w185')}
          alt={getTitle(movie)}
          fill
          style={{ objectFit: 'cover', transition: 'transform 0.3s ease, filter 0.2s ease', transform: hovered ? 'scale(1.05)' : 'scale(1)', filter: hovered ? 'brightness(0.5)' : 'brightness(1)' }}
          unoptimized
        />
        {movie.dominantColor && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: movie.dominantColor, opacity: 0.8 }} />
        )}
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '8px 7px', background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {movie.vote_average > 0 && (
                <span style={{ background: '#F5C518', color: '#000', fontSize: '9px', fontWeight: 800, padding: '2px 4px', borderRadius: '2px', letterSpacing: '0.03em', lineHeight: '14px' }}>
                  IMDb {movie.vote_average.toFixed(1)}
                </span>
              )}
              {rt && (
                <span style={{ background: '#FA320A', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '2px 4px', borderRadius: '2px', letterSpacing: '0.03em', lineHeight: '14px' }}>
                  RT {rt}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: '11px', color: '#888', letterSpacing: '0.04em', lineHeight: '1.3', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {getTitle(movie)}
      </div>
      <div style={{ fontSize: '10px', color: '#444', marginTop: '2px' }}>
        {getYear(movie)}
      </div>
    </button>
  );
}

export default function MovieRow({ title, movies, onMovieClick, loading = false }: Props) {
  return (
    <div>
      <div style={{ fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#555', marginBottom: '14px' }}>
        {title}
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: '10px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ flexShrink: 0, width: '120px', height: '180px', borderRadius: '3px', animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }}>
          {movies.filter(m => m.poster_path).map(movie => (
            <RowCard key={movie.id} movie={movie} onMovieClick={onMovieClick} />
          ))}
        </div>
      )}
    </div>
  );
}
