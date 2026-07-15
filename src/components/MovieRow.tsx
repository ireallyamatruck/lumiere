'use client';

import Image from 'next/image';
import { Movie, posterUrl, getTitle, getYear } from '@/lib/tmdb';

interface Props {
  title: string;
  movies: Movie[];
  onMovieClick: (movie: Movie) => void;
  loading?: boolean;
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
            <button
              key={movie.id}
              onClick={() => onMovieClick(movie)}
              style={{ flexShrink: 0, width: '120px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
            >
              <div style={{ width: '120px', height: '180px', borderRadius: '3px', overflow: 'hidden', background: '#111', position: 'relative', marginBottom: '6px' }}>
                <Image
                  src={posterUrl(movie.poster_path!, 'w185')}
                  alt={getTitle(movie)}
                  fill
                  style={{ objectFit: 'cover' }}
                  unoptimized
                />
                {movie.dominantColor && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: movie.dominantColor, opacity: 0.8 }} />
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#888', letterSpacing: '0.04em', lineHeight: '1.3', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {getTitle(movie)}
              </div>
              <div style={{ fontSize: '10px', color: '#444', marginTop: '2px' }}>
                {getYear(movie)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
