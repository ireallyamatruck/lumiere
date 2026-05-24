'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { Movie, posterUrl, getTitle, getYear } from '@/lib/tmdb';

interface Props {
  movie: Movie | null;
  genres: Record<number, string>;
  onClose: () => void;
}

export default function MovieModal({ movie, genres, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = movie ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [movie]);

  if (!movie) return null;

  const title = getTitle(movie);
  const year = getYear(movie);
  const movieGenres = (movie.genre_ids || []).map(id => genres[id]).filter(Boolean);
  const palette = movie.palette || [];
  const dot = movie.dominantColor;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col md:flex-row overflow-hidden w-full max-w-[560px] max-h-[85vh] animate-fade-up"
        style={{
          background: '#0d0d0d',
          border: '1px solid #1e1e1e',
          borderRadius: '6px',
          animationDelay: '0ms',
          opacity: 0,
        }}
      >
        {movie.poster_path && (
          <div className="relative w-full md:w-[180px] flex-shrink-0 aspect-[2/3] md:aspect-auto">
            <Image
              src={posterUrl(movie.poster_path, 'w342')}
              alt={title}
              fill
              className="object-cover"
              unoptimized
            />
            {dot && (
              <div
                className="absolute bottom-0 left-0 right-0 h-1"
                style={{ background: dot, opacity: 0.8 }}
              />
            )}
          </div>
        )}

        <div className="flex flex-col flex-1 overflow-y-auto p-6">
          <div
            className="font-display text-[22px] font-light leading-tight text-[#e2d9c8] mb-1"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {title}
          </div>

          <div className="text-[10px] text-neutral-600 tracking-[0.15em] mb-4 flex items-center gap-3">
            <span>{year}</span>
            {movie.vote_average > 0 && (
              <>
                <span className="text-neutral-800">·</span>
                <span>{movie.vote_average.toFixed(1)} ★</span>
              </>
            )}
          </div>

          {movieGenres.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {movieGenres.map(g => (
                <span
                  key={g}
                  className="text-[9px] tracking-[0.15em] uppercase border border-[#222] text-neutral-600 px-2 py-[3px] rounded-sm"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {palette.length > 0 && (
            <div className="flex gap-1 mb-4">
              {palette.map((c, i) => (
                <div
                  key={i}
                  className="h-[14px] flex-1 rounded-sm"
                  style={{ background: c }}
                />
              ))}
            </div>
          )}

          {movie.overview && (
            <p
              className="font-display font-light text-[13px] leading-relaxed text-neutral-500 mb-6 flex-1"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {movie.overview}
            </p>
          )}

          <button
            onClick={onClose}
            className="self-start text-[9px] tracking-[0.2em] uppercase border border-[#2a2a2a] text-neutral-600 px-4 py-2 rounded-sm hover:border-neutral-600 hover:text-[#e2d9c8] transition-all duration-200"
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
}
