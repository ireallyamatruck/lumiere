'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Movie, fetchDiscover, fetchMorePages, fetchGenres } from '@/lib/tmdb';
import ColorPicker from '@/components/ColorPicker';
import PosterCard from '@/components/PosterCard';
import MovieModal from '@/components/MovieModal';
import CosmosView from '@/components/CosmosView';
import AuthModal from '@/components/AuthModal';
import { useAuth } from '@/context/AuthContext';

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

const GENRES_MOVIE = [
  { id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }, { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' }, { id: 18, name: 'Drama' },
  { id: 14, name: 'Fantasy' }, { id: 27, name: 'Horror' }, { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' }, { id: 878, name: 'Sci-Fi' }, { id: 53, name: 'Thriller' },
  { id: 37, name: 'Western' }, { id: 10752, name: 'War' }, { id: 36, name: 'History' },
];

export default function Home() {
  const { user, profile, signOut } = useAuth();
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
  const [filmsRevealed, setFilmsRevealed] = useState(false);
  const [cosmosHue, setCosmosHue] = useState<number | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [pickerHue, setPickerHue] = useState(210);
  const [pickerSat, setPickerSat] = useState(70);
  const [pickerLit, setPickerLit] = useState(45);

  // Filters
  const [selectedGenres, setSelectedGenres] = useState<Set<number>>(new Set());
  const [ratingMin, setRatingMin] = useState(0);
  const [ratingMax, setRatingMax] = useState(10);
  const [yearMin, setYearMin] = useState(1950);
  const [yearMax, setYearMax] = useState(2025);
  const [showFilters, setShowFilters] = useState(false);

  const colorizedRef = useRef<Set<number>>(new Set());
  const idSetRef = useRef<Set<number>>(new Set());

  const applyFilters = useCallback((movies: Movie[]) => {
    return movies.filter(m => {
      const year = parseInt((m.release_date || m.first_air_date || '0').slice(0, 4));
      const rating = m.vote_average;
      const genreMatch = selectedGenres.size === 0 || (m.genre_ids || []).some(g => selectedGenres.has(g));
      const ratingMatch = rating >= ratingMin && rating <= ratingMax;
      const yearMatch = !year || (year >= yearMin && year <= yearMax);
      return genreMatch && ratingMatch && yearMatch;
    });
  }, [selectedGenres, ratingMin, ratingMax, yearMin, yearMax]);

  const colorizeMovies = useCallback(async (movies: Movie[], mode: ColorMode) => {
    const pending = movies.filter(m => {
      const done = mode === 'poster' ? m.colorHue !== undefined : m.cinemaHue !== undefined;
      return !done && (mode === 'poster' ? m.poster_path : m.backdrop_path);
    });
    if (!pending.length) return;

    const BATCH = 20;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      try {
        const body = mode === 'poster'
          ? { posterPaths: batch.map(m => m.poster_path!) }
          : { backdropPaths: batch.map(m => m.backdrop_path!) };
        const res = await fetch('/api/colors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const { results } = await res.json();
        batch.forEach(movie => {
          const key = mode === 'poster' ? movie.poster_path! : movie.backdrop_path!;
          const data = results[key];
          if (data) {
            if (mode === 'poster') {
              movie.dominantColor = data.dominant; movie.palette = data.palette;
              movie.colorHue = data.hue; movie.colorSat = data.saturation; movie.colorLit = data.lightness;
            } else {
              movie.cinemaColor = data.dominant; movie.cinemaPalette = data.palette;
              movie.cinemaHue = data.hue; movie.cinemaSat = data.saturation; movie.cinemaLit = data.lightness;
            }
          }
          colorizedRef.current.add(movie.id);
        });
        setExtractCount(prev => prev + batch.length);
        setAllMovies(prev => [...prev]);
      } catch { batch.forEach(m => colorizedRef.current.add(m.id)); }
    }
  }, []);

  const load = useCallback(async (type: 'movie' | 'tv', sortBy: string) => {
    setLoading(true);
    setAllMovies([]); setDisplayed([]); setFilterActive(false);
    setExtractCount(0); setTotalCount(0);
    colorizedRef.current = new Set(); idSetRef.current = new Set();
    try {
      const [results, genreList] = await Promise.all([fetchDiscover(type, sortBy, 50), fetchGenres(type)]);
      const genreMap: Record<number, string> = {};
      genreList.forEach(g => { genreMap[g.id] = g.name; });
      setGenres(genreMap);
      results.forEach(m => idSetRef.current.add(m.id));
      setAllMovies(results); setDisplayed(results); setTotalCount(results.length);
    } catch { setAllMovies([]); setDisplayed([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(mediaType, sort); }, [mediaType, sort, load]);

  useEffect(() => {
    if (allMovies.length > 0 && !loading) colorizeMovies(allMovies, colorMode);
  }, [allMovies.length, loading, colorMode]);

  useEffect(() => {
    if (loading || bgLoading) return;
    setBgLoading(true);
    fetchMorePages(mediaType, sort, 51, 400, idSetRef.current, (batch) => {
      setAllMovies(prev => {
        const next = [...prev, ...batch];
        setTotalCount(next.length);
        colorizeMovies(batch, colorMode);
        return next;
      });
    }).finally(() => setBgLoading(false));
  }, [loading]);

  // Re-apply filters when filter state changes
  useEffect(() => {
    if (!filterActive) setDisplayed(applyFilters(allMovies));
  }, [selectedGenres, ratingMin, ratingMax, yearMin, yearMax, allMovies.length]);

  const handleGo = useCallback((h: number, s: number, l: number) => {
    const isPoster = colorMode === 'poster';
    const filtered = allMovies.filter(m => {
      const mh = isPoster ? m.colorHue : m.cinemaHue;
      const ms = isPoster ? m.colorSat : m.cinemaSat;
      const ml = isPoster ? m.colorLit : m.cinemaLit;
      if (mh === undefined) return false;
      return hueDist(mh, h) < 15 && Math.abs((ms ?? 50) - s) < 25 && Math.abs((ml ?? 50) - l) < 40;
    });
    const base = filtered.length >= 8 ? filtered :
      allMovies.filter(m => {
        const mh = isPoster ? m.colorHue : m.cinemaHue;
        return mh !== undefined && hueDist(mh, h) < 25;
      });
    setDisplayed(applyFilters(base.length > 0 ? base : allMovies));
    setFilterActive(true);
    setFilmsRevealed(true);
    setCosmosHue(h);
  }, [allMovies, colorMode, applyFilters]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    colorizedRef.current = new Set(); setFilterActive(false);
    const { searchMovies } = await import('@/lib/tmdb');
    const results = await searchMovies(searchQuery);
    setAllMovies(results); setDisplayed(results);
    setLoading(false); setShowSearch(false);
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const countLabel = loading ? 'loading...'
    : filterActive ? `${displayed.length} matches · ${totalCount} total`
    : bgLoading ? `${totalCount} films · loading more...`
    : `${totalCount} films`;

  return (
    <main className="min-h-screen bg-[#070707]">
      {/* Header */}
      <header className="flex items-center justify-between px-8 pt-8 pb-0">
        <div className="flex items-baseline gap-5">
          <h1 className="font-display font-light tracking-[0.1em] text-[#e2d9c8]"
            style={{ fontFamily: 'var(--font-display)', fontSize: '38px' }}>
            lumi<span className="italic text-neutral-500">ère</span>
          </h1>
          <span className="text-[11px] tracking-[0.25em] text-neutral-700 uppercase hidden sm:block">cinema by colour</span>
        </div>

        <div className="flex items-center gap-5">
          {user ? (
            <div className="flex items-center gap-4">
              <a href="/profile" className="text-[11px] tracking-[0.15em] text-neutral-500 hover:text-[#e2d9c8] transition-colors">
                {profile?.username}
              </a>
              <button onClick={signOut} className="text-[10px] tracking-[0.2em] uppercase text-neutral-700 hover:text-neutral-500 transition-colors">logout</button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)} className="text-[11px] tracking-[0.2em] uppercase text-neutral-600 hover:text-[#e2d9c8] transition-colors">
              sign in
            </button>
          )}
          {filterActive && (
            <button onClick={() => { setDisplayed(applyFilters(allMovies)); setFilterActive(false); setCosmosHue(null); }}
              className="text-[11px] tracking-[0.2em] uppercase text-neutral-700 hover:text-[#e2d9c8] transition-colors">clear</button>
          )}
          <button onClick={() => setShowSearch(s => !s)}
            className="text-[11px] tracking-[0.2em] uppercase text-neutral-600 hover:text-[#e2d9c8] transition-colors">
            {showSearch ? 'cancel' : 'search'}
          </button>
          <div className="flex items-center gap-1 border border-[#1e1e1e] rounded-sm overflow-hidden">
            {(['grid', 'cosmos'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className="text-[10px] tracking-[0.15em] uppercase px-3 py-[5px] transition-all duration-200"
                style={{ background: viewMode === v ? '#1a1a1a' : 'transparent', color: viewMode === v ? '#e2d9c8' : '#444' }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      {showSearch && (
        <form onSubmit={handleSearch} className="px-8 pt-5">
          <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="search films, series..."
            className="w-full bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[12px] tracking-wider py-2 outline-none placeholder-neutral-700 focus:border-neutral-600 transition-colors" />
        </form>
      )}

      {/* Color source toggle */}
      <div className="px-8 pt-6">
        <div className="flex items-center gap-6 mb-4">
          <div className="text-[11px] tracking-[0.25em] text-neutral-600 uppercase">colour source</div>
          <div className="flex items-center gap-1 border border-[#1e1e1e] rounded-sm overflow-hidden">
            {(['poster', 'cinema'] as ColorMode[]).map(m => (
              <button key={m} onClick={() => setColorMode(m)}
                className="text-[10px] tracking-[0.15em] uppercase px-3 py-[5px] transition-all duration-200"
                style={{ background: colorMode === m ? '#1a1a1a' : 'transparent', color: colorMode === m ? '#e2d9c8' : '#444' }}>
                {m === 'poster' ? 'cover art' : 'aura'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ColorPicker hue={pickerHue} saturation={pickerSat} lightness={pickerLit}
        onChange={(h, s, l) => { setPickerHue(h); setPickerSat(s); setPickerLit(l); }}
        onGo={handleGo} />

      {/* Filters row */}
      <div className="px-8 pt-5">
        <button onClick={() => setShowFilters(f => !f)}
          className="flex items-center gap-2 mb-3 transition-colors"
          style={{ fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase', color: showFilters ? '#ccc' : '#888' }}>
          <span>filters</span>
          {(selectedGenres.size > 0 || ratingMin > 0 || ratingMax < 10 || yearMin > 1950 || yearMax < 2025) && (
            <span style={{ fontSize: '9px', background: '#2a2a2a', color: '#ccc', padding: '1px 6px', borderRadius: '3px' }}>active</span>
          )}
          <span>{showFilters ? '↑' : '↓'}</span>
        </button>

        {showFilters && (
          <div className="pb-5 border-b border-[#1a1a1a]">
            {/* Genres */}
            <div className="mb-5">
              <div style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>genre</div>
              <div className="flex flex-wrap gap-2">
                {GENRES_MOVIE.map(g => (
                  <button key={g.id} onClick={() => toggleGenre(g.id)}
                    className="transition-all duration-150"
                    style={{
                      fontSize: '11px', letterSpacing: '0.08em', padding: '4px 10px', borderRadius: '3px',
                      border: `1px solid ${selectedGenres.has(g.id) ? '#aaa' : '#2a2a2a'}`,
                      color: selectedGenres.has(g.id) ? '#f0ebe0' : '#777',
                      background: selectedGenres.has(g.id) ? '#222' : 'transparent',
                      cursor: 'pointer',
                    }}>
                    {g.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating + Year side by side */}
            <div className="flex flex-wrap gap-8 mb-5">
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>
                  imdb rating
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '12px', color: '#aaa', minWidth: '28px' }}>{ratingMin.toFixed(1)}</span>
                  <input type="range" min="0" max="10" step="0.5" value={ratingMin}
                    onChange={e => setRatingMin(Math.min(Number(e.target.value), ratingMax))}
                    className="w-28 accent-neutral-500" />
                  <span style={{ fontSize: '12px', color: '#777' }}>–</span>
                  <input type="range" min="0" max="10" step="0.5" value={ratingMax}
                    onChange={e => setRatingMax(Math.max(Number(e.target.value), ratingMin))}
                    className="w-28 accent-neutral-500" />
                  <span style={{ fontSize: '12px', color: '#aaa', minWidth: '28px' }}>{ratingMax.toFixed(1)}</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>
                  year
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '12px', color: '#aaa', minWidth: '36px' }}>{yearMin}</span>
                  <input type="range" min="1900" max="2025" step="1" value={yearMin}
                    onChange={e => setYearMin(Math.min(Number(e.target.value), yearMax))}
                    className="w-28 accent-neutral-500" />
                  <span style={{ fontSize: '12px', color: '#777' }}>–</span>
                  <input type="range" min="1900" max="2025" step="1" value={yearMax}
                    onChange={e => setYearMax(Math.max(Number(e.target.value), yearMin))}
                    className="w-28 accent-neutral-500" />
                  <span style={{ fontSize: '12px', color: '#aaa', minWidth: '36px' }}>{yearMax}</span>
                </div>
              </div>
            </div>

            {/* Apply + Reset */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setDisplayed(applyFilters(allMovies)); setShowFilters(false); setFilmsRevealed(true); }}
                style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid #aaa', color: '#f0ebe0', padding: '7px 20px', borderRadius: '3px', background: 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                apply filters
              </button>
              <button
                onClick={() => { setSelectedGenres(new Set()); setRatingMin(0); setRatingMax(10); setYearMin(1950); setYearMax(2025); setDisplayed(allMovies); }}
                style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
                onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              >
                reset
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-8 py-4 border-b border-[#111] mt-2">
        <div className="text-[11px] text-neutral-600 tracking-widest">{countLabel}</div>
        <div className="flex items-center gap-3">
          <select value={mediaType} onChange={e => setMediaType(e.target.value as 'movie' | 'tv')}
            className="bg-[#070707] border border-[#1e1e1e] text-neutral-500 font-mono text-[10px] tracking-widest uppercase py-[5px] px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none">
            <option value="movie">films</option>
            <option value="tv">series</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="bg-[#070707] border border-[#1e1e1e] text-neutral-500 font-mono text-[10px] tracking-widest uppercase py-[5px] px-3 rounded-sm outline-none cursor-pointer hover:border-[#333] transition-colors appearance-none">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
          ) : !filmsRevealed ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 300, color: '#333', marginBottom: '12px', fontStyle: 'italic' }}>
                pick a colour to begin
              </div>
              <div style={{ fontSize: '11px', color: '#2a2a2a', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
                or apply a filter below
              </div>
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div style={{ fontSize: '12px', color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase' }}>no results found</div>
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

      <MovieModal movie={selected} genres={genres} onClose={() => setSelected(null)} onAuthRequired={() => setShowAuth(true)} />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </main>
  );
}
