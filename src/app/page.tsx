'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Movie, fetchDiscover, fetchGenres } from '@/lib/tmdb';
import { hueToRange } from '@/lib/colors';
import ColorPicker from '@/components/ColorPicker';
import PosterCard from '@/components/PosterCard';
import MovieModal from '@/components/MovieModal';
import CosmosView from '@/components/CosmosView';

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'popular' },
  { value: 'vote_average.desc', label: 'top rated' },
  { value: 'release_date.desc', label: 'recent' },
];

type ViewMode = 'grid' | 'cosmos';

function hueDist(a: number, b: number) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

export default function Home() {
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [displayed, setDisplayed] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractCount, setExtractCount] = useState(0);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [sort, setSort] = useState('popularity.desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterActive, setFilterActive] = useState(false);
  const [cosmosHue, setCosmosHue] = useState<number | null>(null);

  // Color picker state
  const [pickerHue, setPickerHue] = useState(210);
  const [pickerSat, setPickerSat] = useState(70);
  const [pickerLit, setPickerLit] = useState(45);

  const colorizedRef = useRef<Set<number>>(new Set());

  const load = useCallback(async (type: 'movie' | 'tv', sortBy: string) => {
    setLoading(true);
    setAllMovies([]);
    setDisplayed([]);
    setFilterActive(false);
    setExtractCount(0);
    colorizedRef.current = new Set();
    try {
      const [results, genreList] = await Promise.all([
        fetchDiscover(type, sortBy, 5),
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

    const BATCH = 20;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      try {
        const res = await fetch('/api/colors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posterPaths: batch.map(m => m.poster_path!) }),
        });
        const { results } = await res.json();
        batch.forEach(movie => {
          const data = results[movie.poster_path!];
          if (data) {
            movie.dominantColor = data.dominant;
            movie.palette = data.palette;
            movie.colorHue = data.hue;
            movie.colorSat = data.saturation;
            movie.colorLit = data.lightness;
          }
          colorizedRef.current.add(movie.id);
        });
        setExtractCount(colorizedRef.current.size);
        setAllMovies(prev => [...prev]);
      } catch {
        batch.forEach(m => colorizedRef.current.add(m.id));
      }
    }
    setExtracting(false);
  }, []);

  useEffect(() => {
    if (allMovies.length > 0) colorizeMovies(allMovies);
  }, [allMovies.length, colorizeMovies]);

  const handleGo = useCallback((h: number, s: number, l: number) => {
    setFilterActive(true);
    setCosmosHue(h);

    // Match films whose hue is within 22°, saturation within 30, lightness within 30
    const filtered = allMovies.filter(m => {
      if (m.colorHue === undefined) return false;
      const hd = hueDist(m.colorHue, h);
      const sd = Math.abs((m.colorSat ?? 50) - s);
      const ld = Math.abs((m.colorLit ?? 50) - l);
      return hd < 22 && sd < 35 && ld < 35;
    });

    // If too few matches, relax to hue-only
    if (filtered.length < 5) {
      const hueOnly = allMovies.filter(m =>
        m.colorHue !== undefined && hueDist(m.colorHue, h) < 30
      );
      setDisplayed(hueOnly.length > 0 ? hueOnly : allMovies);
    } else {
      setDisplayed(filtered);
    }
  }, [allMovies]);

  const handleClear = () => {
    setDisplayed(allMovies);
    setFilterActive(false);
    setCosmosHue(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    colorizedRef.current = new Set();
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
    ? `colouring ${extractCount} / ${allMovies.length}`
    : filterActive
    ? `${displayed.length} matches · ${allMovies.length} total`
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
        <div className="flex items-center gap-5">
          {filterActive && (
            <button
              onClick={handleClear}
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
          <div className="flex items-center gap-1 border border-[#1e1e1e] rounded-sm overflow-hidden">
            {(['grid', 'cosmos'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className="text-[9px] tracking-[0.15em] uppercase px-3 py-1 transition-all duration-200"
                style={{
                  background: viewMode === v ? '#1a1a1a' : 'transparent',
                  color: viewMode === v ? '#e2d9c8' : '#444',
                }}
              >
                {v}
              </button>
            ))}
          </div>
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

      <ColorPicker
        hue={pickerHue}
        saturation={pickerSat}
        lightness={pickerLit}
        onChange={(h, s, l) => { setPickerHue(h); setPickerSat(s); setPickerLit(l); }}
        onGo={handleGo}
      />

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

      {viewMode === 'cosmos' ? (
        <CosmosView movies={allMovies} onSelect={setSelected} activeHue={cosmosHue} />
      ) : (
        <div className="px-8 py-6">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="skeleton rounded-sm" style={{ aspectRatio: '2/3', animationDelay: `${i * 40}ms` }} />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
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
      )}

      <MovieModal movie={selected} genres={genres} onClose={() => setSelected(null)} />
    </main>
  );
}