'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Movie, fetchDiscover, fetchMorePages, fetchGenres } from '@/lib/tmdb';
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
type ColorMode = 'poster' | 'cinema';

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
  const [extractCount, setExtractCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [bgLoading, setBgLoading] = useState(false);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [sort, setSort] = useState('popularity.desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [colorMode, setColorMode] = useState<ColorMode>('poster');
  const [filterActive, setFilterActive] = useState(false);
  const [cosmosHue, setCosmosHue] = useState<number | null>(null);
  const [pickerHue, setPickerHue] = useState(210);
  const [pickerSat, setPickerSat] = useState(70);
  const [pickerLit, setPickerLit] = useState(45);

  const colorizedRef = useRef<Set<number>>(new Set());
  const idSetRef = useRef<Set<number>>(new Set());
  const moviesRef = useRef<Movie[]>([]);

  const colorizeMovies = useCallback(async (movies: Movie[], mode: ColorMode) => {
    const pending = movies.filter(m => {
      const alreadyDone = mode === 'poster' ? m.colorHue !== undefined : m.cinemaHue !== undefined;
      return !alreadyDone && (mode === 'poster' ? m.poster_path : m.backdrop_path);
    });
    if (!pending.length) return;

    const BATCH = 20;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      try {
        const body = colorMode === 'poster'
          ? { posterPaths: batch.map(m => m.poster_path!) }
          : { backdropPaths: batch.map(m => m.backdrop_path!) };

        const res = await fetch('/api/colors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const { results } = await res.json();

        batch.forEach(movie => {
          const key = mode === 'poster' ? movie.poster_path! : movie.backdrop_path!;
          const data = results[key];
          if (data) {
            if (mode === 'poster') {
              movie.dominantColor = data.dominant;
              movie.palette = data.palette;
              movie.colorHue = data.hue;
              movie.colorSat = data.saturation;
              movie.colorLit = data.lightness;
            } else {
              movie.cinemaColor = data.dominant;
              movie.cinemaPalette = data.palette;
              movie.cinemaHue = data.hue;
              movie.cinemaSat = data.saturation;
              movie.cinemaLit = data.lightness;
            }
          }
          colorizedRef.current.add(movie.id);
        });

        setExtractCount(prev => prev + batch.length);
        setAllMovies(prev => [...prev]);
      } catch {
        batch.forEach(m => colorizedRef.current.add(m.id));
      }
    }
  }, [colorMode]);

  const load = useCallback(async (type: 'movie' | 'tv', sortBy: string) => {
    setLoading(true);
    setAllMovies([]);
    setDisplayed([]);
    setFilterActive(false);
    setExtractCount(0);
    setTotalCount(0);
    colorizedRef.current = new Set();
    idSetRef.current = new Set();
    moviesRef.current = [];

    try {
      const [results, genreList] = await Promise.all([
        fetchDiscover(type, sortBy, 50),
        fetchGenres(type),
      ]);
      const genreMap: Record<number, string> = {};
      genreList.forEach(g => { genreMap[g.id] = g.name; });
      setGenres(genreMap);
      results.forEach(m => idSetRef.current.add(m.id));
      moviesRef.current = results;
      setAllMovies(results);
      setDisplayed(results);
      setTotalCount(results.length);
    } catch {
      setAllMovies([]);
      setDisplayed([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(mediaType, sort); }, [mediaType, sort, load]);

  // Colorize initial batch
  useEffect(() => {
    if (allMovies.length > 0 && !loading) {
      colorizeMovies(allMovies, colorMode);
    }
  }, [allMovies.length, loading, colorMode, colorizeMovies]);

  // Background load more pages (51–400)
  useEffect(() => {
    if (loading || bgLoading) return;
    const type = mediaType;
    const sortBy = sort;
    setBgLoading(true);

    fetchMorePages(type, sortBy, 51, 400, idSetRef.current, (batch) => {
      moviesRef.current = [...moviesRef.current, ...batch];
      setAllMovies(prev => {
        const next = [...prev, ...batch];
        setTotalCount(next.length);
        // Colorize new batch
        colorizeMovies(batch, colorMode);
        return next;
      });
    }).finally(() => setBgLoading(false));
  }, [loading]);  // only run once after initial load

  const handleGo = useCallback((h: number, s: number, l: number) => {
    setFilterActive(true);
    setCosmosHue(h);

    const isPoster = colorMode === 'poster';
    const filtered = allMovies.filter(m => {
      const mh = isPoster ? m.colorHue : m.cinemaHue;
      const ms = isPoster ? m.colorSat : m.cinemaSat;
      const ml = isPoster ? m.colorLit : m.cinemaLit;
      if (mh === undefined) return false;
      return hueDist(mh, h) < 15 && Math.abs((ms ?? 50) - s) < 25 && Math.abs((ml ?? 50) - l) < 40;
    });

    // Relax if too few
    if (filtered.length < 8) {
      const hueOnly = allMovies.filter(m => {
        const mh = isPoster ? m.colorHue : m.cinemaHue;
        return mh !== undefined && hueDist(mh, h) < 25;
      });
      setDisplayed(hueOnly.length > 0 ? hueOnly : allMovies);
    } else {
      setDisplayed(filtered);
    }
  }, [allMovies, colorMode]);

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
    : filterActive
    ? `${displayed.length} matches · ${totalCount} total`
    : bgLoading
    ? `${totalCount} films · loading more...`
    : `${totalCount} films`;

  return (
    <main className="min-h-screen bg-[#070707]">
      <header className="flex items-center justify-between px-8 pt-8 pb-0">
        <div className="flex items-baseline gap-5">
          <h1
            className="font-display font-light tracking-[0.1em] text-[#e2d9c8]"
            style={{ fontFamily: 'var(--font-display)', fontSize: '38px' }}
          >
            lumi<span className="italic text-neutral-500">ère</span>
          </h1>
          <span className="text-[11px] tracking-[0.25em] text-neutral-700 uppercase hidden sm:block">
            cinema by colour
          </span>
        </div>

        <div className="flex items-center gap-5">
          {filterActive && (
            <button
              onClick={handleClear}
              className="text-[11px] tracking-[0.2em] uppercase text-neutral-700 hover:text-[#e2d9c8] transition-colors"
            >
              clear
            </button>
          )}
          <button
            onClick={() => setShowSearch(s => !s)}
            className="text-[11px] tracking-[0.2em] uppercase text-neutral-600 hover:text-[#e2d9c8] transition-colors"
          >
            {showSearch ? 'cancel' : 'search'}
          </button>
          <div className="flex items-center gap-1 border border-[#1e1e1e] rounded-sm overflow-hidden">
            {(['grid', 'cosmos'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className="text-[10px] tracking-[0.15em] uppercase px-3 py-[5px] transition-all duration-200"
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
        <form onSubmit={handleSearch} className="px-8 pt-5">
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="search films, series..."
            className="w-full bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[12px] tracking-wider py-2 outline-none placeholder-neutral-700 focus:border-neutral-600 transition-colors"
          />
        </form>
      )}

      {/* Color mode toggle + picker */}
      <div className="px-8 pt-6">
        <div className="flex items-center gap-6 mb-4">
          <div className="text-[11px] tracking-[0.25em] text-neutral-600 uppercase">colour source</div>
          <div className="flex items-center gap-1 border border-[#1e1e1e] rounded-sm overflow-hidden">
            {(['poster', 'cinema'] as ColorMode[]).map(m => (
              <button
                key={m}
                onClick={() => setColorMode(m)}
                className="text-[10px] tracking-[0.15em] uppercase px-3 py-[5px] transition-all duration-200"
                style={{
                  background: colorMode === m ? '#1a1a1a' : 'transparent',
                  color: colorMode === m ? '#e2d9c8' : '#444',
                }}
              >
                {m === 'poster' ? 'poster art' : 'film scene'}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-neutral-700 tracking-wide">
            {colorMode === 'poster' ? 'colour from poster artwork' : 'colour from actual film scenes'}
          </span>
        </div>
      </div>

      <ColorPicker
        hue={pickerHue}
        saturation={pickerSat}
        lightness={pickerLit}
        onChange={(h, s, l) => { setPickerHue(h); setPickerSat(s); setPickerLit(l); }}
        onGo={handleGo}
      />

      <div className="flex items-center justify-between px-8 py-4 border-b border-[#111] mt-5">
        <div className="text-[11px] text-neutral-600 tracking-widest">{countLabel}</div>
        <div className="flex items-center gap-3">
          <select
            value={mediaType}
            onChange={e => setMediaType(e.target.value as 'movie' | 'tv')}
            className="bg-[#070707] border border-[#1e1e1e] text-neutral-500 font-mono text-[10px] tracking-widest uppercase py-[5px] px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none"
          >
            <option value="movie">films</option>
            <option value="tv">series</option>
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-[#070707] border border-[#1e1e1e] text-neutral-500 font-mono text-[10px] tracking-widest uppercase py-[5px] px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none"
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
              <div className="text-[12px] tracking-[0.3em] text-neutral-700 uppercase">no results found</div>
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