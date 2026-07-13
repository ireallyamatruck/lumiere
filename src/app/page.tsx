'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Movie, fetchDiscover, fetchMorePages, fetchGenres, posterUrl } from '@/lib/tmdb';
import ColorPicker from '@/components/ColorPicker';
import PosterCard from '@/components/PosterCard';
import MovieModal from '@/components/MovieModal';
import CosmosView from '@/components/CosmosView';
import AuthModal from '@/components/AuthModal';
import { useAuth } from '@/context/AuthContext';
import { useRecommendations } from '@/hooks/useRecommendations';

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'popular' },
  { value: 'vote_average.desc', label: 'top rated' },
  { value: 'release_date.desc', label: 'recent' },
];

// Derive HSL from a hex colour string — O(1), no network call needed
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  let r = parseInt(m[1], 16) / 255;
  let g = parseInt(m[2], 16) / 255;
  let b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Fill in missing colorHue/Sat/Lit from dominantColor so cosmos shows instantly
function enrichColours(movies: Movie[]): Movie[] {
  movies.forEach(m => {
    if (m.colorHue === undefined && m.dominantColor) {
      const hsl = hexToHsl(m.dominantColor);
      if (hsl) { m.colorHue = hsl.h; m.colorSat = hsl.s; m.colorLit = hsl.l; }
    }
  });
  return movies;
}

function sortMovies(movies: Movie[], sortBy: string): Movie[] {
  if (sortBy === 'vote_average.desc') {
    return [...movies].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  }
  if (sortBy === 'release_date.desc') {
    return [...movies].sort((a, b) => {
      const da = a.release_date || a.first_air_date || '';
      const db = b.release_date || b.first_air_date || '';
      return db.localeCompare(da);
    });
  }
  return movies; // popularity.desc — already sorted by popularity_rank in cache
}

type ViewMode = 'grid' | 'cosmos' | 'foryou';
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
  const [searchActive, setSearchActive] = useState(false);

  // Discovery mode
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [discoveryShuffled, setDiscoveryShuffled] = useState<Movie[]>([]);

  const colorizedRef = useRef<Set<number>>(new Set());
  const idSetRef = useRef<Set<number>>(new Set());
  const fromCacheRef = useRef(false);

  const { recs, status: recStatus } = useRecommendations(allMovies, viewMode === 'foryou');

  // Restore mode from session or show overlay
  useEffect(() => {
    const saved = sessionStorage.getItem('lumiere_mode');
    if (!saved) {
      setShowDiscovery(true);
    } else {
      const isDiscover = saved === 'discover';
      setDiscoveryMode(isDiscover);
      if (!isDiscover) setFilmsRevealed(true);
    }
  }, []);

  // Shuffle once when movies arrive in discovery mode
  useEffect(() => {
    if (discoveryMode && allMovies.length > 0 && discoveryShuffled.length === 0) {
      setDiscoveryShuffled([...allMovies].sort(() => Math.random() - 0.5));
    }
  }, [discoveryMode, allMovies.length]);

  const pickMode = (mode: 'discover' | 'browse') => {
    sessionStorage.setItem('lumiere_mode', mode);
    setShowDiscovery(false);
    setDiscoveryMode(mode === 'discover');
    if (mode === 'browse') setFilmsRevealed(true);
  };

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
        enrichColours(batch);
        setExtractCount(prev => prev + batch.length);
        setAllMovies(prev => [...prev]);
      } catch { batch.forEach(m => colorizedRef.current.add(m.id)); }
    }
  }, []);

  const load = useCallback(async (type: 'movie' | 'tv', sortBy: string) => {
    setLoading(true);
    setAllMovies([]); setDisplayed([]); setFilterActive(false); setSearchActive(false);
    setExtractCount(0); setTotalCount(0);
    colorizedRef.current = new Set(); idSetRef.current = new Set();
    fromCacheRef.current = false;
    try {
      // Try Supabase cache first — instant when warm
      const cacheRes = await fetch(`/api/movies?type=${type}`);
      if (cacheRes.ok) {
        const { movies: cached } = await cacheRes.json();
        if (cached && cached.length > 100) {
          const genreList = await fetchGenres(type);
          const genreMap: Record<number, string> = {};
          genreList.forEach((g: any) => { genreMap[g.id] = g.name; });
          setGenres(genreMap);
          cached.forEach((m: Movie) => idSetRef.current.add(m.id));
          fromCacheRef.current = true;
          const sorted = enrichColours(sortMovies(cached, sortBy));
          setAllMovies(sorted); setDisplayed(sorted); setTotalCount(sorted.length);
          setLoading(false);
          const needsColor = cached.filter((m: Movie) => m.dominantColor === undefined);
          if (needsColor.length > 0) colorizeMovies(needsColor, colorMode);
          return;
        }
      }
    } catch { /* fall through to TMDB */ }

    // Fallback: fetch directly from TMDB
    try {
      const [results, genreList] = await Promise.all([fetchDiscover(type, sortBy, 50), fetchGenres(type)]);
      const genreMap: Record<number, string> = {};
      genreList.forEach(g => { genreMap[g.id] = g.name; });
      setGenres(genreMap);
      results.forEach(m => idSetRef.current.add(m.id));
      enrichColours(results);
      setAllMovies(results); setDisplayed(results); setTotalCount(results.length);
    } catch { setAllMovies([]); setDisplayed([]); }
    setLoading(false);
  }, [colorMode]);

  useEffect(() => { load(mediaType, sort); }, [mediaType, sort, load]);

  useEffect(() => {
    if (allMovies.length > 0 && !loading) colorizeMovies(allMovies, colorMode);
  }, [allMovies.length, loading, colorMode]);

  useEffect(() => {
    if (loading || bgLoading || fromCacheRef.current) return;
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
    setSearchActive(true); setFilmsRevealed(true);
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
    : searchActive ? `${displayed.length} result${displayed.length !== 1 ? 's' : ''} for "${searchQuery}"  ·  ${totalCount} total`
    : filterActive ? `${displayed.length} matches · ${totalCount} total`
    : bgLoading ? `${totalCount} films · loading more...`
    : `${totalCount} films`;

  // Cards with colours extracted, in shuffled order
  const discoveryCards = discoveryShuffled.filter(m => m.dominantColor || (m.palette && m.palette.length > 0));

  return (
    <main className="min-h-screen bg-[#070707]">

      {/* ── Discovery overlay ── */}
      {showDiscovery && (
        <div style={{ position: 'fixed', inset: 0, background: '#070707', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '48px', fontWeight: 300, color: '#f0ebe0', letterSpacing: '0.05em', marginBottom: '12px' }}>
            lumi<span style={{ fontStyle: 'italic', color: '#444' }}>ère</span>
          </div>
          <div style={{ fontSize: '11px', color: '#2e2e2e', letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: '64px' }}>
            cinema by colour
          </div>
          <div style={{ fontSize: '13px', color: '#444', letterSpacing: '0.15em', marginBottom: '36px' }}>
            how do you want to experience cinema tonight?
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={() => pickMode('discover')}
              style={{ padding: '13px 32px', border: '1px solid #2a2a2a', background: 'transparent', color: '#e2d9c8', fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '2px', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#888'; e.currentTarget.style.background = '#0c0c0c'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.background = 'transparent'; }}
            >
              discover by colour
            </button>
            <button
              onClick={() => pickMode('browse')}
              style={{ padding: '13px 32px', border: '1px solid #161616', background: 'transparent', color: '#444', fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '2px', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#999'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#161616'; e.currentTarget.style.color = '#444'; }}
            >
              just browse
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 pt-8 pb-0">
        <div className="flex items-baseline gap-5">
          <h1
            className="font-display font-light tracking-[0.1em] text-[#e2d9c8] cursor-pointer"
            style={{ fontFamily: 'var(--font-display)', fontSize: '38px' }}
            onClick={() => {
              if (!discoveryMode) {
                setFilmsRevealed(false);
                setFilterActive(false);
                setSearchActive(false);
                setCosmosHue(null);
                setDisplayed(allMovies);
                setSelectedGenres(new Set());
                setRatingMin(0); setRatingMax(10);
                setYearMin(1950); setYearMax(2025);
                setSearchQuery('');
                setShowSearch(false);
              }
            }}
          >
            lumi<span className="italic text-neutral-500">ère</span>
          </h1>
          <span className="text-[11px] tracking-[0.25em] text-neutral-700 uppercase hidden sm:block">cinema by colour</span>
        </div>

        <div className="flex items-center gap-5">
          {/* Switch mode */}
          <button
            onClick={() => {
              const next = discoveryMode ? 'browse' : 'discover';
              setDiscoveryShuffled([]);
              pickMode(next);
            }}
            style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#333', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#888')}
            onMouseLeave={e => (e.currentTarget.style.color = '#333')}
          >
            {discoveryMode ? 'browse' : 'discover'}
          </button>

          {user ? (
            <div className="flex items-center gap-4">
              <a href="/profile" className="flex items-center gap-2 transition-colors group" style={{ textDecoration: 'none' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#888', fontFamily: 'var(--font-display)', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#666')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
                >
                  {profile?.username?.[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: '12px', color: '#888', letterSpacing: '0.08em', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e2d9c8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#888')}
                >
                  {profile?.username}
                </span>
              </a>
              <button onClick={signOut}
                style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#444', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                onMouseLeave={e => (e.currentTarget.style.color = '#444')}
              >logout</button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)}
              style={{ fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#888', background: 'none', border: '1px solid #2a2a2a', borderRadius: '3px', padding: '5px 12px', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#e2d9c8'; e.currentTarget.style.borderColor = '#666'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#2a2a2a'; }}
            >
              sign in
            </button>
          )}

          {/* Browse-only controls */}
          {!discoveryMode && (
            <>
              {filterActive && (
                <button onClick={() => { setDisplayed(allMovies); setFilterActive(false); setCosmosHue(null); setFilmsRevealed(false); }}
                  className="text-[11px] tracking-[0.2em] uppercase text-neutral-700 hover:text-[#e2d9c8] transition-colors">clear</button>
              )}
              <button onClick={() => setShowSearch(s => !s)}
                className="text-[11px] tracking-[0.2em] uppercase text-neutral-600 hover:text-[#e2d9c8] transition-colors">
                {showSearch ? 'cancel' : 'search'}
              </button>
              <div className="flex items-center gap-1 border border-[#1e1e1e] rounded-sm overflow-hidden">
                {(['grid', 'cosmos', 'foryou'] as ViewMode[]).map(v => (
                  <button key={v} onClick={() => setViewMode(v)}
                    className="text-[10px] tracking-[0.15em] uppercase px-3 py-[5px] transition-all duration-200"
                    style={{ background: viewMode === v ? '#1a1a1a' : 'transparent', color: viewMode === v ? '#e2d9c8' : '#444' }}>
                    {v === 'foryou' ? 'for you' : v}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Discovery mode content ── */}
      {discoveryMode && (
        <div className="px-8 py-8">
          {loading || discoveryCards.length === 0 ? (
            <>
              <div style={{ fontSize: '10px', color: '#1e1e1e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '24px' }}>
                {loading ? 'reading colours...' : 'extracting colour palettes...'}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div key={i} className="skeleton rounded-sm" style={{ aspectRatio: '2/3', animationDelay: `${i * 30}ms` }} />
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '10px', color: '#1e1e1e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '24px' }}>
                {discoveryCards.length} films · hover to reveal
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                {discoveryCards.map(movie => (
                  <DiscoveryCard key={movie.id} movie={movie} onClick={setSelected} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Browse mode content ── */}
      {!discoveryMode && (
        <>
          {showSearch && (
            <form onSubmit={handleSearch} className="px-8 pt-5">
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="search films, series..."
                className="w-full bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[12px] tracking-wider py-2 outline-none placeholder-neutral-700 focus:border-neutral-600 transition-colors" />
            </form>
          )}

          {/* Colour source toggle */}
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

          {/* Filters */}
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

                <div className="flex flex-wrap gap-8 mb-5">
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>imdb rating</div>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: '12px', color: '#aaa', minWidth: '28px' }}>{ratingMin.toFixed(1)}</span>
                      <input type="range" min="0" max="10" step="0.5" value={ratingMin}
                        onChange={e => setRatingMin(Math.min(Number(e.target.value), ratingMax))} className="w-28 accent-neutral-500" />
                      <span style={{ fontSize: '12px', color: '#777' }}>–</span>
                      <input type="range" min="0" max="10" step="0.5" value={ratingMax}
                        onChange={e => setRatingMax(Math.max(Number(e.target.value), ratingMin))} className="w-28 accent-neutral-500" />
                      <span style={{ fontSize: '12px', color: '#aaa', minWidth: '28px' }}>{ratingMax.toFixed(1)}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>year</div>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: '12px', color: '#aaa', minWidth: '36px' }}>{yearMin}</span>
                      <input type="range" min="1900" max="2025" step="1" value={yearMin}
                        onChange={e => setYearMin(Math.min(Number(e.target.value), yearMax))} className="w-28 accent-neutral-500" />
                      <span style={{ fontSize: '12px', color: '#777' }}>–</span>
                      <input type="range" min="1900" max="2025" step="1" value={yearMax}
                        onChange={e => setYearMax(Math.max(Number(e.target.value), yearMin))} className="w-28 accent-neutral-500" />
                      <span style={{ fontSize: '12px', color: '#aaa', minWidth: '36px' }}>{yearMax}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => { setDisplayed(applyFilters(allMovies)); setShowFilters(false); setFilmsRevealed(true); }}
                    style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid #aaa', color: '#f0ebe0', padding: '7px 20px', borderRadius: '3px', background: 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >apply filters</button>
                  <button
                    onClick={() => { setSelectedGenres(new Set()); setRatingMin(0); setRatingMax(10); setYearMin(1950); setYearMax(2025); setDisplayed(allMovies); }}
                    style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#666')}
                  >reset</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-8 py-4 border-b border-[#111] mt-2">
            <div className="flex items-center gap-4">
              <div className="text-[11px] text-neutral-600 tracking-widest">{countLabel}</div>
              {filterActive && (
                <button
                  onClick={() => { setDisplayed(allMovies); setFilterActive(false); setCosmosHue(null); setFilmsRevealed(false); }}
                  style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#555', background: 'none', border: '1px solid #1e1e1e', borderRadius: '2px', padding: '3px 10px', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#e2d9c8'; e.currentTarget.style.borderColor = '#555'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#1e1e1e'; }}
                >× clear colour</button>
              )}
            </div>
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
          ) : viewMode === 'foryou' ? (
            <div className="px-8 py-6">
              {!user ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div style={{ fontSize: '12px', color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase' }}>sign in to get recommendations</div>
                  <button onClick={() => setShowAuth(true)}
                    style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid #2a2a2a', color: '#e2d9c8', padding: '7px 18px', borderRadius: '3px', background: 'transparent', cursor: 'pointer' }}>sign in</button>
                </div>
              ) : recStatus === 'loading' ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="skeleton rounded-sm" style={{ aspectRatio: '2/3', animationDelay: `${i * 40}ms` }} />
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '10px', color: '#1e1e1e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '24px' }}>
                    {recStatus === 'cold'
                      ? 'watch or rate a few films to sharpen this · exploring for now'
                      : `${recs.length} films chosen for your palette`}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {recs.map((movie, i) => (
                      <PosterCard key={movie.id} movie={movie} index={i} onClick={setSelected} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="px-8 py-6">
              {loading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="skeleton rounded-sm" style={{ aspectRatio: '2/3', animationDelay: `${i * 40}ms` }} />
                  ))}
                </div>
              ) : !filmsRevealed ? (
                <EmptyPrompt />
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
        </>
      )}

      <MovieModal movie={selected} genres={genres} onClose={() => setSelected(null)} onAuthRequired={() => setShowAuth(true)} onMovieSelect={setSelected} />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </main>
  );
}

// ─── Discovery card: palette bands → poster on hover ────────────────────────

function DiscoveryCard({ movie, onClick }: { movie: Movie; onClick: (m: Movie) => void }) {
  const [hovered, setHovered] = useState(false);
  const colors = (movie.palette && movie.palette.length > 0) ? movie.palette : [movie.dominantColor || '#111'];

  return (
    <div
      style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '3px', overflow: 'hidden', cursor: 'pointer' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(movie)}
    >
      {/* Palette face — horizontal colour bands */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', opacity: hovered ? 0 : 1, transition: 'opacity 0.35s ease' }}>
        {colors.map((c, i) => (
          <div key={i} style={{ flex: 1, background: c }} />
        ))}
      </div>

      {/* Poster + title — revealed on hover */}
      <div style={{ position: 'absolute', inset: 0, opacity: hovered ? 1 : 0, transition: 'opacity 0.35s ease' }}>
        {movie.poster_path && (
          <Image
            src={posterUrl(movie.poster_path, 'w342')}
            alt={movie.title || movie.name || ''}
            fill
            style={{ objectFit: 'cover' }}
            unoptimized
          />
        )}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '28px 10px 10px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)',
        }}>
          <div style={{ fontSize: '11px', color: '#e2d9c8', lineHeight: 1.35, letterSpacing: '0.02em' }}>
            {movie.title || movie.name}
          </div>
          {(movie.release_date || movie.first_air_date) && (
            <div style={{ fontSize: '10px', color: '#777', marginTop: '2px' }}>
              {(movie.release_date || movie.first_air_date || '').slice(0, 4)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Browse mode empty state ─────────────────────────────────────────────────

const PROMPTS = [
  { line1: 'every film has a colour.', line2: 'what are you drawn to tonight?' },
  { line1: 'cinema is painted light.', line2: 'find yours.' },
  { line1: 'mood is colour.', line2: 'pick the one that fits.' },
  { line1: 'the right film is out there.', line2: 'let colour lead you to it.' },
  { line1: 'some nights call for deep blue.', line2: 'others for burning amber.' },
  { line1: 'you already know what you want to feel.', line2: 'the colour knows the film.' },
  { line1: 'the spectrum is wide.', line2: 'your evening is waiting.' },
  { line1: 'art director, cinematographer, director —', line2: 'they all chose a colour. so do you.' },
];

function EmptyPrompt() {
  const [idx] = useState(() => Math.floor(Math.random() * PROMPTS.length));
  const prompt = PROMPTS[idx];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 300, color: '#2e2e2e', fontStyle: 'italic', lineHeight: 1.3, marginBottom: '12px', maxWidth: '480px' }}>
        {prompt.line1}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 300, color: '#252525', fontStyle: 'italic', lineHeight: 1.4, maxWidth: '400px' }}>
        {prompt.line2}
      </div>
      <div style={{ marginTop: '40px', fontSize: '10px', color: '#1e1e1e', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
        drag the colour picker · apply a filter · or search
      </div>
    </div>
  );
}
