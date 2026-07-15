'use client';

import { Movie } from '@/lib/tmdb';
import { useAuth } from '@/context/AuthContext';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useRecentlyBrowsed } from '@/hooks/useRecentlyBrowsed';
import { useBecauseYouWatched } from '@/hooks/useBecauseYouWatched';
import MovieRow from './MovieRow';

interface Props {
  allMovies: Movie[];
  onMovieClick: (movie: Movie) => void;
  onAuthRequired: () => void;
  refreshKey: number;
}

export default function FreeRoamView({ allMovies, onMovieClick, onAuthRequired, refreshKey }: Props) {
  const { user } = useAuth();
  const { recs, status } = useRecommendations(allMovies, true, refreshKey);
  const recentSimilar = useRecentlyBrowsed(allMovies);
  const becauseYouWatched = useBecauseYouWatched(allMovies, refreshKey);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div style={{ fontSize: '12px', color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          sign in for personalised picks
        </div>
        <button
          onClick={onAuthRequired}
          style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid #2a2a2a', color: '#e2d9c8', padding: '7px 18px', borderRadius: '3px', background: 'transparent', cursor: 'pointer' }}
        >
          sign in
        </button>
      </div>
    );
  }

  const topPicksTitle = status === 'loading'
    ? 'top picks for you'
    : status === 'cold'
    ? 'exploring · rate a few films to refine this'
    : `top picks for you · ${recs.length} films`;

  return (
    <div className="px-8 py-6" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      {/* Row 1 — Recently Browsed */}
      {recentSimilar.length > 0 && (
        <MovieRow
          title="recently browsed"
          movies={recentSimilar}
          onMovieClick={onMovieClick}
        />
      )}

      {/* Row 2 — Because You Watched X */}
      {becauseYouWatched && becauseYouWatched.similar.length > 0 && (
        <MovieRow
          title={`because you watched ${becauseYouWatched.movie.title || becauseYouWatched.movie.name || ''}`}
          movies={becauseYouWatched.similar}
          onMovieClick={onMovieClick}
        />
      )}

      {/* Row 3 — Top Picks */}
      <MovieRow
        title={topPicksTitle}
        movies={recs}
        onMovieClick={onMovieClick}
        loading={status === 'loading'}
      />
    </div>
  );
}
