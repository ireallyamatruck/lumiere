'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Movie, fetchDiscover, fetchGenres } from '@/lib/tmdb';
import { extractColors } from '@/lib/colors';
import SpectrumBar from '@/components/SpectrumBar';
import PosterCard from '@/components/PosterCard';
import MovieModal from '@/components/MovieModal';

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'popular' },
  { value: 'vote_average.desc', label: 'top rated' },
  { value: 'release_date.desc', label: 'recent' },
];

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [sort, setSort] = useState('popularity.desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeHue, setActiveHue] = useState(7);
  const colorizedRef = useRef<Set<number>>(new Set());

  const load = useCallback(async (type: 'movie' | 'tv', sortBy: string) => {
    setLoading(true);
    setMovies([]);
    colorizedRef.current = new Set();
    try {
      const [results, genreList] = await Promise.all([
        fetchDiscover(type, sortBy, 1),
        fetchGenres(type),
      ]);
      const genreMap: Record<number, string> = {};
      genreList.forEach(g => { genreMap[g.id] = g.name; });
      setGenres(genreMap);
      setMovies(results);
    } catch {
      setMovies([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(mediaType, sort);
  }, [mediaType, sort, load]);

  const colorizeMovies = useCallback(async (moviesToProcess: Movie[]) => {
    const pending = moviesToProcess.filter(
      m => !colorizedRef.current.has(m.id) && m.poster_path
    );
    if (!pending.length) return;
    setExtracting(true);
    for (const movie of pending) {
      if (colorizedRef.current.has(movie.id)) continue;
      const url = `https://image.tmdb.org/t/p/w185${movie.poster_path}`;
      const result = await extractColors(url);
      if (result) {
        movie.dominantColor = result.dominant;
        movie.palette = result.palette;
      }
      colorizedRef.current.add(movie.id);
      // trigger re-render every 4 movies so dots appear progressively
      if (pending.indexOf(movie) % 4 === 3) {
        setMovies(prev => [...prev]);
      }
    }
    setMovies(prev => [...prev]);
    setExtracting(false);
  }, []);

  useEffect(() => {
    if (movies.length > 0) colorizeMovies(movies);
  }, [movies.length, colorizeMovies]);

  const handleTypeChange = (val: 'movie' | 'tv') => {
    setMediaType(val);
  };

  const handleSortChange = (val: string) => {
    setSort(val);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    colorizedRef.current = new Set();
    const { searchMovies } = await import('@/lib/tmdb');
    const results = await searchMovies(searchQuery);
    setMovies(results);
    setLoading(false);
    setShowSearch(false);
  };

  return (
    <main className="min-h-screen bg-[#070707]">
      <header className="flex items-baseline justify-between px-8 pt-8 pb-0">
        <div className="flex items-baseline gap-4">
          <h1
            className="font-display text-[28px] font-light tracking-[0.1em] text-[#e2d9c8]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            lumi<span className="italic text-neutral-600">ère</span>
          </h1>
          <span className="text-[9px] tracking-[0.25em] text-neutral-700 uppercase hidden sm:block">
            cinema by colour
          </span>
        </div>
        <button
          onClick={() => setShowSearch(s => !s)}
          className="text-[9px] tracking-[0.2em] uppercase text-neutral-600 hover:text-[#e2d9c8] transition-colors"
        >
          {showSearch ? 'cancel' : 'search'}
        </button>
      </header>

      {showSearch && (
        <form onSubmit={handleSearch} className="px-8 pt-4">
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="search films, series..."
            className="w-full bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[11px] tracking-wider py-2 outline-none placeholder-neutral-700 focus:border-neutral-600 transition-colors"
          />
        </form>
      )}

      <SpectrumBar activeIndex={activeHue} onSelect={setActiveHue} />

      <div className="flex items-center justify-between px-8 py-4 border-b border-[#111] mt-4">
        <div className="text-[10px] text-neutral-600 tracking-widest">
          {loading ? 'loading...' : extracting
            ? `${movies.filter(m => colorizedRef.current.has(m.id)).length} / ${movies.length} analysed`
            : `${movies.length} films`}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={mediaType}
            onChange={e => handleTypeChange(e.target.value as 'movie' | 'tv')}
            className="bg-[#070707] border border-[#1e1e1e] text-neutral-500 font-mono text-[9px] tracking-widest uppercase py-1 px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none"
          >
            <option value="movie">films</option>
            <option value="tv">series</option>
          </select>

          <select
            value={sort}
            onChange={e => handleSortChange(e.target.value)}
            className="bg-[#070707] border border-[#1e1e1e] text-neutral-500 font-mono text-[9px] tracking-widest uppercase py-1 px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="skeleton rounded-sm"
                style={{ aspectRatio: '2/3', animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        ) : movies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-[10px] tracking-[0.3em] text-neutral-700 uppercase">
              no results found
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {movies.map((movie, i) => (
              <PosterCard
                key={movie.id}
                movie={movie}
                index={i}
                onClick={setSelected}
              />
            ))}
          </div>
        )}
      </div>

      <MovieModal
        movie={selected}
        genres={genres}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
