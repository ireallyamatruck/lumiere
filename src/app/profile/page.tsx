'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { posterUrl, Movie } from '@/lib/tmdb';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import MovieModal from '@/components/MovieModal';

type Tab = 'profile' | 'activity' | 'colors' | 'critiques' | 'favourites' | 'lists' | 'circles';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'activity', label: 'Activity' },
  { id: 'colors', label: 'Colors' },
  { id: 'critiques', label: 'Critiques' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'lists', label: 'Lists' },
  { id: 'circles', label: 'Circle' },
];

interface Stats { colors: number; palette: number; lists: number; following: number; followers: number }
interface FilmEntry { id?: string; tmdb_id: number; media_type: string; watched_at?: string; created_at?: string; poster_path?: string; title?: string; rating?: number; colorHex?: string; overview?: string; vote_average?: number; genre_ids?: number[] }
interface FavoriteSlot { position: number; dbId?: string; tmdb_id?: number; media_type?: string; poster_path?: string; title?: string; colorHex?: string }
interface ReviewEntry { id: string; tmdb_id: number; media_type: string; created_at: string; title?: string; body: string; poster_path?: string; film_title?: string; rating?: number }
interface ActivityItem { type: 'watched' | 'liked' | 'reviewed'; tmdb_id: number; media_type: string; date: string; poster_path?: string; title?: string; body?: string; rating?: number }
interface WatchlistData { id: string; name: string; is_public: boolean; items: { tmdb_id: number; media_type: string }[] }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function thisYear() { return new Date().getFullYear(); }

export default function ProfilePage() {
  const { user, profile, signOut, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('profile');
  const [stats, setStats] = useState<Stats>({ colors: 0, palette: 0, lists: 0, following: 0, followers: 0 });
  const [favorites, setFavorites] = useState<FavoriteSlot[]>([1, 2, 3, 4].map(p => ({ position: p })));
  const [allWatched, setAllWatched] = useState<FilmEntry[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [likedFilms, setLikedFilms] = useState<FilmEntry[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [bioSaved, setBioSaved] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<FilmEntry[]>([]);
  const [pickerSearching, setPickerSearching] = useState(false);
  const [modalFilm, setModalFilm] = useState<Movie | null>(null);
  const [modalReadOnly, setModalReadOnly] = useState(false);
  const [watchedColors, setWatchedColors] = useState<string[]>([]);
  const [colorYearFilter, setColorYearFilter] = useState<number | null>(null);
  const [circlesView, setCirclesView] = useState<'followers' | 'following'>('following');
  const [watchlistsData, setWatchlistsData] = useState<WatchlistData[]>([]);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const tmdbCache = useRef<Record<number, any>>({});

  useEffect(() => {
    if (!loading && !user) router.push('/');
    if (!loading && !profile) setPageLoading(false);
  }, [user, profile, loading]);

  useEffect(() => {
    if (!user || !profile) return;
    setBioInput(profile.bio || '');
    loadAll();
  }, [user?.id, profile?.id]);

  const fetchTmdb = useCallback(async (tmdb_id: number, media_type = 'movie') => {
    if (tmdbCache.current[tmdb_id]) return tmdbCache.current[tmdb_id];
    const key = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const res = await fetch(`https://api.themoviedb.org/3/${media_type}/${tmdb_id}?api_key=${key}`);
    const data = await res.json();
    tmdbCache.current[tmdb_id] = data;
    return data;
  }, []);

  const fetchColor = useCallback(async (poster_path: string): Promise<string | undefined> => {
    try {
      const res = await fetch('/api/colors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posterPaths: [poster_path] }),
      });
      const { results } = await res.json();
      return results[poster_path]?.dominant;
    } catch { return undefined; }
  }, []);

  const loadAll = async () => {
    if (!user) return;
    const uid = user.id;
    try {
      const [
        { data: watched },
        { data: likedData },
        { data: reviewData },
        { data: ratingsData },
        { data: listData },
        { data: favData },
      ] = await Promise.all([
        supabase.from('watched').select('*').eq('user_id', uid).order('watched_at', { ascending: false }),
        supabase.from('likes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('reviews').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('ratings').select('*').eq('user_id', uid),
        supabase.from('watchlists').select('id, name, is_public').eq('user_id', uid),
        supabase.from('favorite_films').select('*').eq('user_id', uid).order('position'),
      ]);

      const [followingRes, followersRes] = await Promise.all([
        supabase.from('follows').select('*, profiles!follows_following_id_fkey(username, display_name)').eq('follower_id', uid),
        supabase.from('follows').select('*, profiles!follows_follower_id_fkey(username, display_name)').eq('following_id', uid),
      ]);

      const rMap: Record<number, number> = {};
      (ratingsData || []).forEach((r: any) => { rMap[r.tmdb_id] = r.rating; });

      const followingData = followingRes.error ? [] : (followingRes.data || []);
      const followersData = followersRes.error ? [] : (followersRes.data || []);
      setFollowing(followingData);
      setFollowers(followersData);

      const watchedThisYear = (watched || []).filter((w: any) => {
        return new Date(w.watched_at).getFullYear() === thisYear();
      }).length;

      setStats({
        colors: watched?.length || 0,
        palette: watchedThisYear,
        lists: listData?.length || 0,
        following: followingData.length,
        followers: followersData.length,
      });

      // Load watchlist items
      const listIds = (listData || []).map((l: any) => l.id);
      if (listIds.length > 0) {
        const { data: wlItems } = await supabase.from('watchlist_items').select('watchlist_id, tmdb_id, media_type').in('watchlist_id', listIds);
        const grouped: Record<string, { tmdb_id: number; media_type: string }[]> = {};
        listIds.forEach((id: string) => { grouped[id] = []; });
        (wlItems || []).forEach((item: any) => { grouped[item.watchlist_id]?.push({ tmdb_id: item.tmdb_id, media_type: item.media_type }); });
        setWatchlistsData((listData || []).map((l: any) => ({ id: l.id, name: l.name, is_public: l.is_public, items: grouped[l.id] || [] })));
      }

      // Enrich watched films
      const watchedEnriched = await Promise.all(
        (watched || []).slice(0, 60).map(async (w: any) => {
          try {
            const d = await fetchTmdb(w.tmdb_id, w.media_type);
            return { ...w, poster_path: d?.poster_path, title: d?.title || d?.name, rating: rMap[w.tmdb_id], overview: d?.overview, vote_average: d?.vote_average, genre_ids: d?.genre_ids };
          } catch { return { ...w, rating: rMap[w.tmdb_id] }; }
        })
      );
      setAllWatched(watchedEnriched);

      // Fetch dominant colors for palette strip
      const colorPaths = watchedEnriched.filter(w => w.poster_path).slice(0, 24).map(w => w.poster_path!);
      if (colorPaths.length > 0) {
        try {
          const res = await fetch('/api/colors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posterPaths: colorPaths }) });
          const { results } = await res.json();
          const colors = colorPaths.map(p => results[p]?.dominant).filter(Boolean) as string[];
          setWatchedColors(colors);
        } catch {}
      }

      // Enrich liked films
      const likedEnriched = await Promise.all(
        (likedData || []).slice(0, 60).map(async (l: any) => {
          try {
            const d = await fetchTmdb(l.tmdb_id, l.media_type);
            return { ...l, poster_path: d?.poster_path, title: d?.title || d?.name };
          } catch { return l; }
        })
      );
      setLikedFilms(likedEnriched);

      // Enrich reviews
      const reviewsEnriched = await Promise.all(
        (reviewData || []).slice(0, 20).map(async (r: any) => {
          try {
            const d = await fetchTmdb(r.tmdb_id, r.media_type);
            return { ...r, poster_path: d?.poster_path, film_title: d?.title || d?.name, rating: rMap[r.tmdb_id] };
          } catch { return { ...r, film_title: 'unknown' }; }
        })
      );
      setReviews(reviewsEnriched);

      // Build activity feed — deduplicated by tmdb_id (reviewed > liked > watched priority)
      const allActs: ActivityItem[] = [
        ...(reviewData || []).slice(0, 20).map((r: any) => ({ type: 'reviewed' as const, tmdb_id: r.tmdb_id, media_type: r.media_type, date: r.created_at || new Date().toISOString(), body: r.body })),
        ...(likedData || []).slice(0, 20).map((l: any) => ({ type: 'liked' as const, tmdb_id: l.tmdb_id, media_type: l.media_type, date: l.created_at })),
        ...(watched || []).slice(0, 20).map((w: any) => ({ type: 'watched' as const, tmdb_id: w.tmdb_id, media_type: w.media_type, date: w.watched_at, rating: rMap[w.tmdb_id] })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const seenAct = new Set<number>();
      const acts = allActs.filter(a => { if (seenAct.has(a.tmdb_id)) return false; seenAct.add(a.tmdb_id); return true; }).slice(0, 20);

      const actsEnriched = await Promise.all(acts.map(async a => {
        try {
          const d = await fetchTmdb(a.tmdb_id, a.media_type);
          return { ...a, poster_path: d?.poster_path, title: d?.title || d?.name };
        } catch { return { ...a, title: 'unknown' }; }
      }));
      setRecentActivity(actsEnriched);

      // Load favorites
      if (favData && favData.length > 0) {
        const slots: FavoriteSlot[] = [1, 2, 3, 4].map(p => ({ position: p }));
        await Promise.all(favData.map(async (f: any) => {
          try {
            const d = await fetchTmdb(f.tmdb_id, f.media_type);
            const poster_path = d?.poster_path;
            const colorHex = poster_path ? await fetchColor(poster_path) : undefined;
            slots[f.position - 1] = { position: f.position, dbId: f.id, tmdb_id: f.tmdb_id, media_type: f.media_type, poster_path, title: d?.title || d?.name, colorHex };
          } catch { /* leave slot empty */ }
        }));
        setFavorites(slots);
      }
    } catch (e) {
      console.error('Profile load error:', e);
    } finally {
      setPageLoading(false);
    }
  };

  const saveBio = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ bio: bioInput }).eq('id', user.id);
    await refreshProfile();
    setEditingBio(false);
    setBioSaved(true);
    setTimeout(() => setBioSaved(false), 2500);
  };

  const openModal = (film: FilmEntry, readOnly = false) => {
    const cached = tmdbCache.current[film.tmdb_id];
    setModalFilm({
      id: film.tmdb_id,
      media_type: film.media_type,
      title: cached?.title || cached?.name || film.title,
      name: cached?.name,
      poster_path: film.poster_path || cached?.poster_path,
      backdrop_path: cached?.backdrop_path,
      overview: cached?.overview || film.overview || '',
      vote_average: cached?.vote_average || film.vote_average || 0,
      vote_count: cached?.vote_count || 0,
      release_date: cached?.release_date,
      first_air_date: cached?.first_air_date,
      genre_ids: cached?.genre_ids || film.genre_ids || [],
    });
    setModalReadOnly(readOnly);
  };

  const openPicker = (position: number) => {
    setPickerSlot(position);
    setPickerQuery('');
    setPickerResults(allWatched.filter(w => w.poster_path).slice(0, 20));
  };

  const searchPicker = useCallback(async (q: string) => {
    setPickerQuery(q);
    if (!q.trim()) { setPickerResults(allWatched.filter(w => w.poster_path).slice(0, 20)); return; }
    setPickerSearching(true);
    try {
      const key = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${key}&query=${encodeURIComponent(q)}&include_adult=false`);
      const data = await res.json();
      const results = (data.results || []).filter((r: any) => r.poster_path && (r.media_type === 'movie' || r.media_type === 'tv')).slice(0, 12).map((r: any) => ({
        tmdb_id: r.id, media_type: r.media_type, poster_path: r.poster_path, title: r.title || r.name,
      }));
      setPickerResults(results);
    } catch { }
    setPickerSearching(false);
  }, [allWatched]);

  const pickFavorite = async (film: FilmEntry) => {
    if (!user || pickerSlot === null) return;
    const position = pickerSlot;
    try {
      await supabase.from('favorite_films').upsert({ user_id: user.id, tmdb_id: film.tmdb_id, media_type: film.media_type, position }, { onConflict: 'user_id,position' });
      const colorHex = film.poster_path ? await fetchColor(film.poster_path) : undefined;
      setFavorites(prev => prev.map(s => s.position === position ? { position, tmdb_id: film.tmdb_id, media_type: film.media_type, poster_path: film.poster_path, title: film.title, colorHex } : s));
    } catch (e) { console.error(e); }
    setPickerSlot(null);
  };

  const removeFavorite = async (position: number) => {
    if (!user) return;
    await supabase.from('favorite_films').delete().eq('user_id', user.id).eq('position', position);
    setFavorites(prev => prev.map(s => s.position === position ? { position } : s));
  };

  if (loading || pageLoading) return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center">
      <div style={{ fontSize: '11px', color: '#3a3a3a', letterSpacing: '0.3em' }}>loading...</div>
    </div>
  );
  if (!profile) return null;

  return (
    <main className="min-h-screen bg-[#070707]" style={{ color: '#e2d9c8' }}>

      {/* Favorite picker modal */}
      {pickerSlot !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setPickerSlot(null); }}>
          <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: '4px', width: '520px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #141414', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#555' }}>
                choose a film for slot {pickerSlot}
              </div>
              <button onClick={() => setPickerSlot(null)} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #0f0f0f' }}>
              <input
                autoFocus
                value={pickerQuery}
                onChange={e => searchPicker(e.target.value)}
                placeholder="search any film or series..."
                style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #1e1e1e', color: '#e2d9c8', fontSize: '13px', padding: '6px 0', outline: 'none' }}
              />
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
              {pickerSearching ? (
                <div style={{ fontSize: '11px', color: '#333', letterSpacing: '0.2em', padding: '20px 0' }}>searching...</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                  {pickerResults.map((f, i) => f.poster_path ? (
                    <div key={i} onClick={() => pickFavorite(f)} style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111', cursor: 'pointer' }} title={f.title}>
                      <Image src={posterUrl(f.poster_path, 'w185')} alt={f.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 32px', borderBottom: '1px solid #0f0f0f' }}>
        <a href="/" style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: '#e2d9c8', textDecoration: 'none', fontWeight: 300 }}>
          lumi<span style={{ fontStyle: 'italic', color: '#555' }}>ère</span>
        </a>
        <button onClick={async () => { await signOut(); router.push('/'); }}
          style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#333', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#888')}
          onMouseLeave={e => (e.currentTarget.style.color = '#333')}>
          logout
        </button>
      </div>

      {/* Profile header */}
      <div style={{ padding: '40px 32px 0', borderBottom: '1px solid #0f0f0f' }}>
        {/* Top row: avatar + info */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', marginBottom: '28px' }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#111', border: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={profile.username} width={80} height={80} style={{ objectFit: 'cover' }} unoptimized />
              ) : (
                <span style={{ fontSize: '28px', color: '#444', fontFamily: 'var(--font-display)', fontWeight: 300 }}>
                  {profile.username?.[0]?.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Name + edit + bio */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 300, color: '#f0ebe0', margin: 0 }}>
                {profile.username}
              </h1>
              {bioSaved && <span style={{ fontSize: '10px', color: '#6aab6a', letterSpacing: '0.15em' }}>saved</span>}
              <button
                onClick={() => setEditingBio(true)}
                style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#555', background: 'none', border: '1px solid #222', borderRadius: '2px', padding: '4px 10px', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#aaa'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#555'; }}
              >
                edit profile
              </button>
            </div>
            {editingBio ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  value={bioInput} onChange={e => setBioInput(e.target.value)}
                  style={{ background: 'transparent', borderBottom: '1px solid #2a2a2a', color: '#ccc', fontSize: '13px', padding: '3px 0', outline: 'none', width: '320px' }}
                  onKeyDown={e => { if (e.key === 'Enter') saveBio(); if (e.key === 'Escape') setEditingBio(false); }}
                  autoFocus
                />
                <button onClick={saveBio} style={{ fontSize: '10px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}>save</button>
                <button onClick={() => setEditingBio(false)} style={{ fontSize: '10px', color: '#333', background: 'none', border: 'none', cursor: 'pointer' }}>cancel</button>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: profile.bio ? '#777' : '#2e2e2e', fontStyle: profile.bio ? 'normal' : 'italic', margin: 0 }}>
                {profile.bio || 'no bio yet'}
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0', marginBottom: '0', flexWrap: 'wrap' }}>
          {[
            { key: 'colors', label: 'colors', val: stats.colors },
            { key: 'year', label: `palette ${thisYear()}`, val: stats.palette },
            { key: 'lists', label: 'lists', val: stats.lists },
            { key: 'following', label: 'following', val: stats.following },
            { key: 'followers', label: 'followers', val: stats.followers },
          ].map((s, i) => (
            <div key={s.key}
              onClick={() => {
                if (s.key === 'colors') { setTab('colors'); setColorYearFilter(null); }
                else if (s.key === 'year') { setTab('colors'); setColorYearFilter(thisYear()); }
                else if (s.key === 'lists') { setTab('lists'); }
                else if (s.key === 'following') { setTab('circles'); setCirclesView('following'); }
                else if (s.key === 'followers') { setTab('circles'); setCirclesView('followers'); }
              }}
              style={{ paddingRight: '28px', marginRight: i < 4 ? '28px' : 0, borderRight: i < 4 ? '1px solid #141414' : 'none', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.querySelector('div:first-child') as HTMLElement).style.color = '#fff'}
              onMouseLeave={e => (e.currentTarget.querySelector('div:first-child') as HTMLElement).style.color = '#e2d9c8'}
            >
              <div style={{ fontSize: '18px', color: '#e2d9c8', fontWeight: 300, lineHeight: 1, transition: 'color 0.15s' }}>{s.val}</div>
              <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: '5px' }}>{s.label}</div>
            </div>
          ))}
          {/* Colour palette strip from watched films */}
          {watchedColors.length > 0 && (
            <div style={{ marginLeft: '28px', paddingLeft: '28px', borderLeft: '1px solid #141414' }}>
              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', maxWidth: '180px' }}>
                {watchedColors.map((c, i) => (
                  <div key={i} title={c} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c, flexShrink: 0 }} />
                ))}
              </div>
              <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: '5px' }}>your palette</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', marginTop: '28px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '12px 20px 12px 0', marginRight: '24px',
                fontSize: '13px', letterSpacing: '0.05em',
                color: tab === t.id ? '#e2d9c8' : '#3a3a3a',
                background: 'none', border: 'none',
                borderBottom: tab === t.id ? '2px solid #e2d9c8' : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = '#888'; }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = '#3a3a3a'; }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '40px 32px', maxWidth: '1100px' }}>

        {/* PROFILE — Your Colors + Recent Activity */}
        {tab === 'profile' && (
          <div>
            {/* Your Colors */}
            <div style={{ marginBottom: '52px' }}>
              <div style={{ fontSize: '10px', color: '#2e2e2e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>
                your colours
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {favorites.map(slot => (
                  <FavoriteSlotCard
                    key={slot.position}
                    slot={slot}
                    onAdd={() => openPicker(slot.position)}
                    onRemove={() => removeFavorite(slot.position)}
                  />
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', color: '#2e2e2e', letterSpacing: '0.3em', textTransform: 'uppercase' }}>recent activity</div>
                  <button onClick={() => setTab('activity')} style={{ fontSize: '10px', color: '#333', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#333')}>
                    all
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '6px', maxWidth: '700px' }}>
                  {recentActivity.filter(a => a.poster_path).slice(0, 8).map((a, i) => (
                    <div key={i} onClick={() => a.type === 'reviewed' ? setTab('critiques') : openModal(a as FilmEntry, true)}
                      style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111', cursor: 'pointer', transition: 'filter 0.2s, transform 0.2s' }}
                      title={a.title}
                      onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.35)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                      onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; }}>
                      <Image src={posterUrl(a.poster_path!, 'w185')} alt={a.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY — full timeline */}
        {tab === 'activity' && (
          <div style={{ maxWidth: '580px' }}>
            {recentActivity.length === 0 ? <EmptyState text="no activity yet" /> : (
              recentActivity.map((a, i) => (
                <ActivityRow key={i} item={a}
                  onClick={() => {
                    if (a.type === 'reviewed') { setTab('critiques'); }
                    else openModal(a as FilmEntry, true);
                  }}
                />
              ))
            )}
          </div>
        )}

        {/* COLORS — all watched films */}
        {tab === 'colors' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', color: '#2e2e2e', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
                {colorYearFilter ? `${colorYearFilter} · ` : ''}{(colorYearFilter ? allWatched.filter(w => new Date(w.watched_at || w.created_at || '').getFullYear() === colorYearFilter) : allWatched).length} films
              </div>
              {colorYearFilter && (
                <button onClick={() => setColorYearFilter(null)} style={{ fontSize: '9px', color: '#555', background: 'none', border: '1px solid #222', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#aaa')} onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                  all years
                </button>
              )}
            </div>
            {allWatched.length === 0 ? <EmptyState text="no films watched yet" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '5px' }}>
                {(colorYearFilter ? allWatched.filter(w => new Date(w.watched_at || w.created_at || '').getFullYear() === colorYearFilter) : allWatched)
                  .map((w, i) => <FilmTile key={i} film={w} onClick={() => openModal(w, true)} />)}
              </div>
            )}
          </div>
        )}

        {/* CRITIQUES — reviews */}
        {tab === 'critiques' && (
          <div style={{ maxWidth: '660px' }}>
            <div style={{ fontSize: '10px', color: '#2e2e2e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '20px' }}>
              {stats.colors > 0 ? reviews.length : 0} reviews
            </div>
            {reviews.length === 0 ? <EmptyState text="no reviews written yet" /> : (
              reviews.map((r, i) => <ReviewCard key={i} review={r} onPosterClick={() => openModal(r as FilmEntry, false)} />)
            )}
          </div>
        )}

        {/* FAVOURITES — liked films */}
        {tab === 'favourites' && (
          <div>
            {likedFilms.length === 0 ? <EmptyState text="no liked films yet" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '5px' }}>
                {likedFilms.map((l, i) => <FilmTile key={i} film={l} onClick={() => openModal(l, false)} />)}
              </div>
            )}
          </div>
        )}
        {/* LISTS */}
        {tab === 'lists' && (
          <div style={{ maxWidth: '800px' }}>
            {watchlistsData.length === 0 ? <EmptyState text="no lists yet" /> : (
              watchlistsData.map(wl => (
                <div key={wl.id} style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <button onClick={() => setExpandedList(expandedList === wl.id ? null : wl.id)}
                        style={{ fontSize: '13px', color: '#e2d9c8', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em', padding: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#e2d9c8')}>
                        {wl.name}
                      </button>
                      <span style={{ fontSize: '10px', color: '#333', marginLeft: '10px', letterSpacing: '0.1em' }}>{wl.items.length} films</span>
                    </div>
                    <span style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.15em', textTransform: 'uppercase' }}>{wl.is_public ? 'public' : 'private'}</span>
                  </div>
                  {expandedList === wl.id ? (
                    <ListItemGrid items={wl.items} fetchTmdb={fetchTmdb} onFilmClick={(film) => openModal(film, false)} />
                  ) : (
                    <ListPreviewStrip items={wl.items} fetchTmdb={fetchTmdb} />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* CIRCLES */}
        {tab === 'circles' && (
          <div>
            <div style={{ display: 'flex', gap: '24px', marginBottom: '32px' }}>
              {(['following', 'followers'] as const).map(v => (
                <button key={v} onClick={() => setCirclesView(v)}
                  style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: circlesView === v ? '#e2d9c8' : '#333', background: 'none', border: 'none', borderBottom: circlesView === v ? '1px solid #e2d9c8' : '1px solid transparent', paddingBottom: '6px', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {v} · {v === 'followers' ? stats.followers : stats.following}
                </button>
              ))}
            </div>
            {circlesView === 'followers' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                {followers.length === 0 ? <EmptyState text="no followers yet" /> :
                  followers.map((f: any, i: number) => <UserCircle key={i} profile={f['profiles!follows_follower_id_fkey'] || f.profiles} />)}
              </div>
            )}
            {circlesView === 'following' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                {following.length === 0 ? <EmptyState text="not following anyone yet" /> :
                  following.map((f: any, i: number) => <UserCircle key={i} profile={f['profiles!follows_following_id_fkey'] || f.profiles} />)}
              </div>
            )}
          </div>
        )}

      </div>
      <MovieModal movie={modalFilm} genres={{}} onClose={() => setModalFilm(null)} onAuthRequired={() => {}} readOnly={modalReadOnly} />
    </main>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FavoriteSlotCard({ slot, onAdd, onRemove }: { slot: FavoriteSlot; onAdd: () => void; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isEmpty = !slot.tmdb_id;

  if (isEmpty) {
    return (
      <div
        onClick={onAdd}
        style={{ width: '140px', flexShrink: 0, cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '3px', border: `1px dashed ${hovered ? '#333' : '#1a1a1a'}`, background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
          <span style={{ fontSize: '20px', color: hovered ? '#444' : '#1e1e1e', transition: 'color 0.2s' }}>+</span>
        </div>
        <div style={{ height: '4px', background: '#0f0f0f', borderRadius: '0 0 2px 2px', marginTop: '2px' }} />
      </div>
    );
  }

  return (
    <div style={{ width: '140px', flexShrink: 0 }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '3px', overflow: 'hidden', background: '#111', cursor: 'pointer' }}>
        {slot.poster_path && (
          <Image src={posterUrl(slot.poster_path, 'w342')} alt={slot.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
        )}
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '12px 10px', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: '#e2d9c8', lineHeight: 1.3 }}>{slot.title}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onAdd}
                style={{ fontSize: '9px', color: '#aaa', background: 'none', border: '1px solid #777', borderRadius: '2px', padding: '3px 8px', cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.background = '#222'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#777'; e.currentTarget.style.background = 'none'; }}>
                change
              </button>
              <button onClick={e => { e.stopPropagation(); onRemove(); }}
                style={{ fontSize: '9px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', transition: 'color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ff6b6b'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#888'; }}>
                remove
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Colour swatch */}
      <div style={{ height: '4px', background: slot.colorHex || '#141414', borderRadius: '0 0 2px 2px', marginTop: '2px', transition: 'background 0.3s' }} />
    </div>
  );
}

function FilmTile({ film, onClick }: { film: FilmEntry; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  if (!film.poster_path) return null;
  return (
    <div
      style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111', cursor: 'pointer' }}
      title={film.title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Image src={posterUrl(film.poster_path, 'w185')} alt={film.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
      {hovered && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '7px 6px' }}>
          <div style={{ fontSize: '10px', color: '#e2d9c8', lineHeight: 1.3 }}>{film.title}</div>
          {film.rating && <div style={{ fontSize: '9px', color: '#888', marginTop: '2px', letterSpacing: '1px' }}>{'★'.repeat(film.rating)}</div>}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ item, onClick }: { item: ActivityItem; onClick?: () => void }) {
  const label = { watched: 'watched', liked: 'liked', reviewed: 'reviewed' }[item.type];
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', gap: '14px', padding: '11px 8px', borderBottom: '1px solid #0a0a0a', alignItems: 'flex-start', cursor: onClick ? 'pointer' : 'default', borderRadius: '4px', background: hovered ? '#0c0c0c' : 'transparent', transform: hovered ? 'scale(1.01)' : 'scale(1)', transition: 'all 0.15s ease', margin: '0 -8px' }}>
      {item.poster_path ? (
        <div style={{ width: '34px', flexShrink: 0 }}>
          <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111' }}>
            <Image src={posterUrl(item.poster_path, 'w185')} alt={item.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
          </div>
        </div>
      ) : <div style={{ width: '34px', flexShrink: 0 }} />}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '3px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: '#ddd5c3' }}>{item.title}</div>
          </div>
          <div style={{ fontSize: '10px', color: '#2e2e2e', flexShrink: 0, marginLeft: '12px' }}>{formatDate(item.date)}</div>
        </div>
        {item.rating && <div style={{ fontSize: '10px', color: '#555', marginTop: '3px', letterSpacing: '1px' }}>{'★'.repeat(item.rating)}</div>}
        {item.body && <p style={{ fontSize: '12px', color: '#555', marginTop: '5px', lineHeight: 1.6, margin: '5px 0 0' }}>{item.body.slice(0, 120)}{item.body.length > 120 ? '...' : ''}</p>}
      </div>
    </div>
  );
}

function ReviewCard({ review, onPosterClick }: { review: ReviewEntry; onPosterClick?: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '16px', padding: '18px 0', borderBottom: '1px solid #0f0f0f' }}>
      {review.poster_path && (
        <div onClick={onPosterClick} style={{ width: '48px', flexShrink: 0, cursor: onPosterClick ? 'pointer' : 'default' }}
          onMouseEnter={e => { if (onPosterClick) e.currentTarget.style.filter = 'brightness(1.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
          <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111', transition: 'filter 0.2s' }}>
            <Image src={posterUrl(review.poster_path, 'w185')} alt={review.film_title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
          </div>
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: '#e2d9c8' }}>{review.film_title}</div>
            {review.rating && <div style={{ fontSize: '11px', color: '#555', marginTop: '3px', letterSpacing: '1px' }}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</div>}
          </div>
          <div style={{ fontSize: '10px', color: '#2e2e2e', flexShrink: 0, marginLeft: '16px' }}>{formatDate(review.created_at)}</div>
        </div>
        {review.title && <div style={{ fontSize: '13px', color: '#888', marginBottom: '6px', fontStyle: 'italic' }}>{review.title}</div>}
        <p style={{ fontSize: '13px', color: '#555', lineHeight: '1.7', margin: 0 }}>
          {review.body.slice(0, 220)}{review.body.length > 220 ? '...' : ''}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ fontSize: '12px', color: '#222', letterSpacing: '0.15em', padding: '48px 0' }}>{text}</div>;
}

function ListItemGrid({ items, fetchTmdb, onFilmClick }: { items: { tmdb_id: number; media_type: string }[]; fetchTmdb: (id: number, type: string) => Promise<any>; onFilmClick: (film: any) => void }) {
  const [enriched, setEnriched] = useState<any[]>([]);
  useEffect(() => {
    Promise.all(items.slice(0, 50).map(async item => {
      try { const d = await fetchTmdb(item.tmdb_id, item.media_type); return { ...item, poster_path: d?.poster_path, title: d?.title || d?.name, overview: d?.overview, vote_average: d?.vote_average, genre_ids: d?.genre_ids }; }
      catch { return item; }
    })).then(setEnriched);
  }, [items.length]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '4px' }}>
      {enriched.map((item, i) => item.poster_path ? (
        <div key={i} onClick={() => onFilmClick(item)}
          style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111', cursor: 'pointer', transition: 'filter 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
          <Image src={posterUrl(item.poster_path, 'w185')} alt={item.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
        </div>
      ) : <div key={i} style={{ aspectRatio: '2/3', background: '#111', borderRadius: '2px' }} />)}
    </div>
  );
}

function ListPreviewStrip({ items, fetchTmdb }: {
  items: { tmdb_id: number; media_type: string }[];
  fetchTmdb: (id: number, type: string) => Promise<any>;
}) {
  const [posters, setPosters] = useState<(string | null)[]>([]);

  useEffect(() => {
    const toLoad = items.slice(0, 8);
    Promise.all(toLoad.map(async item => {
      try {
        const d = await fetchTmdb(item.tmdb_id, item.media_type);
        return d?.poster_path || null;
      } catch { return null; }
    })).then(setPosters);
  }, [items.length]);

  if (items.length === 0) return <div style={{ fontSize: '11px', color: '#222', letterSpacing: '0.1em' }}>empty</div>;

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {(posters.length ? posters : Array(Math.min(items.length, 8)).fill(null)).map((poster, i) => (
        <div key={i} style={{ width: '56px', aspectRatio: '2/3', borderRadius: '2px', background: '#111', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          {poster && (
            <Image src={posterUrl(poster, 'w185')} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
          )}
        </div>
      ))}
    </div>
  );
}

function UserCircle({ profile }: { profile: any }) {
  if (!profile) return null;
  return (
    <a href={`/profile/${profile?.username}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '72px' }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#555', fontFamily: 'var(--font-display)', fontWeight: 300, transition: 'border-color 0.2s', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#888')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2a2a')}>
        {profile?.username?.[0]?.toUpperCase()}
      </div>
      <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.05em', textAlign: 'center', wordBreak: 'break-word', transition: 'color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
        onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
        {profile?.username}
      </div>
    </a>
  );
}
