'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Movie, fetchDiscover, fetchGenres } from '@/lib/tmdb';
import { extractColors, hueToRange } from '@/lib/colors';
import SpectrumBar from '@/components/SpectrumBar';
import PosterCard from '@/components/PosterCard';
import MovieModal from '@/components/MovieModal';

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'popular' },
  { value: 'vote_average.desc', label: 'top rated' },
  { value: 'release_date.desc', label: 'recent' },
];

export default function Home() {
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [displayed, setDisplayed] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [sort, setSort] = useState('popularity.desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeHue, setActiveHue] = useState(7);
  const [filterActive, setFilterActive] = useState(false);
  const colorizedRef = useRef<Set<number>>(new Set());
  const hueMapRef = useRef<Map<number, number>>(new Map());

  const load = useCallback(async (type: 'movie' | 'tv', sortBy: string) => {
    setLoading(true);
    setAllMovies([]);
    setDisplayed([]);
    setFilterActive(false);
    colorizedRef.current = new Set();
    hueMapRef.current = new Map();
    try {
      const [results, genreList] = await Promise.all([
        fetchDiscover(type, sortBy, 1),
        fetchGenres(type),
      ]);
      const genreMap: Record<number, string> = {};
      genreList.forEach(g => { genreMap[g.id] = g.name; });
      setGenres(genreMap);
      setAllMovies(results);
      setDisplayed(results);
    } catch {
      setAllMovies([]);
      setDisplayed([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(mediaType, sort); }, [mediaType, sort, load]);

  const colorizeMovies = useCallback(async (movies: Movie[]) => {
    const pending = movies.filter(m => !colorizedRef.current.has(m.id) && m.poster_path);
    if (!pending.length) return;
    setExtracting(true);
    for (let i = 0; i < pending.length; i++) {
      const movie = pending[i];
      if (colorizedRef.current.has(movie.id)) continue;
      const url = `https://image.tmdb.org/t/p/w185${movie.poster_path}`;
      const result = await extractColors(url);
      if (result) {
        movie.dominantColor = result.dominant;
        movie.palette = result.palette;
        hueMapRef.current.set(movie.id, hueToRange(result.hue));
      }
      colorizedRef.current.add(movie.id);
      if (i % 4 === 3) setAllMovies(prev => [...prev]);
    }
    setAllMovies(prev => [...prev]);
    setExtracting(false);
  }, []);

  useEffect(() => {
    if (allMovies.length > 0) colorizeMovies(allMovies);
  }, [allMovies.length, colorizeMovies]);

  const handleGo = useCallback((hueIndex: number) => {
    setFilterActive(true);
    const filtered = allMovies.filter(m => hueMapRef.current.get(m.id) === hueIndex);
    setDisplayed(filtered.length > 0 ? filtered : allMovies);
  }, [allMovies]);

  const handleHueSelect = (i: number) => {
    setActiveHue(i);
    if (filterActive) setFilterActive(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    colorizedRef.current = new Set();
    hueMapRef.current = new Map();
    setFilterActive(false);
    const { searchMovies } = await import('@/lib/tmdb');
    const results = await searchMovies(searchQuery);
    setAllMovies(results);
    setDisplayed(results);
    setLoading(false);
    setShowSearch(false);
  };

  const countLabel = loading
    ? 'loading...'
    : extracting
    ? `analysing ${colorizedRef.current.size} / ${allMovies.length}`
    : filterActive
    ? `${displayed.length} in hue`
    : `${displayed.length} films`;

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
        <div className="flex items-center gap-4">
          {filterActive && (
            <button
              onClick={() => { setDisplayed(allMovies); setFilterActive(false); }}
              className="text-[9px] tracking-[0.2em] uppercase text-neutral-700 hover:text-[#e2d9c8] transition-colors"
            >
              clear
            </button>
          )}
          <button
            onClick={() => setShowSearch(s => !s)}
            className="text-[9px] tracking-[0.2em] uppercase text-neutral-600 hover:text-[#e2d9c8] transition-colors"
          >
            {showSearch ? 'cancel' : 'search'}
          </button>
        </div>
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

      <SpectrumBar activeIndex={activeHue} onSelect={handleHueSelect} onGo={handleGo} />

      <div className="flex items-center justify-between px-8 py-4 border-b border-[#111] mt-4">
        <div className="text-[10px] text-neutral-600 tracking-widest">{countLabel}</div>
        <div className="flex items-center gap-3">
          <select
            value={mediaType}
            onChange={e => setMediaType(e.target.value as 'movie' | 'tv')}
            className="bg-[#070707] border border-[#1e1e1e] text-neutral-500 font-mono text-[9px] tracking-widest uppercase py-1 px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none"
          >
            <option value="movie">films</option>
            <option value="tv">series</option>
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
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
              <div key={i} className="skeleton rounded-sm" style={{ aspectRatio: '2/3', animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-[10px] tracking-[0.3em] text-neutral-700 uppercase">no results found</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {displayed.map((movie, i) => (
              <PosterCard key={movie.id} movie={movie} index={i} onClick={setSelected} />
            ))}
          </div>
        )}
      </div>

      <MovieModal movie={selected} genres={genres} onClose={() => setSelected(null)} />
    </main>
  );
}