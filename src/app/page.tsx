'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Movie, fetchDiscover, fetchGenres } from '@/lib/tmdb';
import { extractColors, hueToRange, HUE_RANGES } from '@/lib/colors';
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
  const [filtered, setFiltered] = useState<Movie[]>([]);
  const [activeHue, setActiveHue] = useState(7);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [sort, setSort] = useState('popularity.desc');
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const colorizedRef = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    colorizedRef.current = new Set();
    try {
      const [movies, genreList] = await Promise.all([
        fetchDiscover(mediaType, sort, 1),
        fetchGenres(mediaType),
      ]);
      const genreMap: Record<number, string> = {};
      genreList.forEach(g => { genreMap[g.id] = g.name; });
      setGenres(genreMap);
      setAllMovies(movies);
    } catch {
      setAllMovies([]);
    }
    setLoading(false);
  }, [mediaType, sort]);

  useEffect(() => { load(); }, [load]);

  const colorizeMovies = useCallback(async (movies: Movie[]) => {
    setExtracting(true);
    const toProcess = movies.filter(m => !colorizedRef.current.has(m.id) && m.poster_path);
    for (const movie of toProcess) {
      if (colorizedRef.current.has(movie.id)) continue;
      const url = `https://image.tmdb.org/t/p/w185${movie.poster_path}`;
      const result = await extractColors(url);
      if (result) {
        movie.dominantColor = result.dominant;
        movie.palette = result.palette;
        (movie as Movie & { _hueIndex: number })._hueIndex = hueToRange(result.hue);
      }
      colorizedRef.current.add(movie.id);
    }
    setAllMovies(prev => [...prev]);
    setExtracting(false);
  }, []);

  useEffect(() => {
    if (allMovies.length > 0) colorizeMovies(allMovies);
  }, [allMovies, colorizeMovies]);

  useEffect(() => {
    if (allMovies.length === 0) { setFiltered([]); return; }
    const colorized = allMovies.filter(m => colorizedRef.current.has(m.id));
    const uncolorized = allMovies.filter(m => !colorizedRef.current.has(m.id));
    const match = colorized.filter(m => {
      const idx = (m as Movie & { _hueIndex?: number })._hueIndex;
      return idx === activeHue;
    });
    setFiltered([...match, ...uncolorized.slice(0, 4)]);
  }, [allMovies, activeHue, extracting]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    const { searchMovies } = await import('@/lib/tmdb');
    const results = await searchMovies(searchQuery);
    setAllMovies(results);
    setLoading(false);
    setShowSearch(false);
  };

  const activeRange = HUE_RANGES[activeHue];

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

      <SpectrumBar activeIndex={activeHue} onSelect={setActiveHue} />

      <div className="flex items-center justify-between px-8 py-4 border-b border-[#111] mt-4">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: activeRange.display }}
          />
          <span className="text-[10px] text-neutral-600 tracking-widest">
            {extracting ? 'analysing posters...' : `${filtered.length} films`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={mediaType}
            onChange={e => setMediaType(e.target.value as 'movie' | 'tv')}
            className="bg-transparent border border-[#1e1e1e] text-neutral-600 font-mono text-[9px] tracking-widest uppercase py-1 px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none"
          >
            <option value="movie">films</option>
            <option value="tv">series</option>
          </select>

          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-transparent border border-[#1e1e1e] text-neutral-600 font-mono text-[9px] tracking-widest uppercase py-1 px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none"
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-[10px] tracking-[0.3em] text-neutral-700 uppercase mb-3">
              no films found in this hue
            </div>
            <div className="text-[9px] text-neutral-800 tracking-wider">
              try an adjacent colour
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {filtered.map((movie, i) => (
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
