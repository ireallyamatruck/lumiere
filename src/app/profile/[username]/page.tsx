'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { posterUrl } from '@/lib/tmdb';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import MovieModal from '@/components/MovieModal';

type Tab = 'watched' | 'reviews' | 'lists';

interface PublicProfile {
  id: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
}

interface FilmEntry {
  tmdb_id: number;
  media_type: string;
  poster_path?: string;
  title?: string;
  overview?: string;
  vote_average?: number;
  genre_ids?: number[];
}

interface ReviewEntry {
  id: string;
  tmdb_id: number;
  media_type: string;
  created_at: string;
  title?: string;
  body: string;
  poster_path?: string;
  film_title?: string;
}

interface WatchlistData {
  id: string;
  name: string;
  is_public: boolean;
  items: { tmdb_id: number; media_type: string }[];
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PublicProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const username = params?.username as string;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('watched');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [stats, setStats] = useState({ watched: 0, reviews: 0, lists: 0, following: 0, followers: 0 });
  const [watchedFilms, setWatchedFilms] = useState<FilmEntry[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [lists, setLists] = useState<WatchlistData[]>([]);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [modalFilm, setModalFilm] = useState<any | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const tmdbCache = useRef<Record<number, any>>({});

  const fetchTmdb = useCallback(async (tmdb_id: number, media_type = 'movie') => {
    if (tmdbCache.current[tmdb_id]) return tmdbCache.current[tmdb_id];
    const key = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const res = await fetch(`https://api.themoviedb.org/3/${media_type}/${tmdb_id}?api_key=${key}`);
    const data = await res.json();
    tmdbCache.current[tmdb_id] = data;
    return data;
  }, []);

  useEffect(() => {
    if (!username) return;
    loadProfile();
  }, [username]);

  useEffect(() => {
    if (!profile || !user) return;
    checkFollowing();
  }, [profile?.id, user?.id]);

  const loadProfile = async () => {
    setLoading(true);
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (!profileData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setProfile(profileData);
    const uid = profileData.id;

    const [
      { count: watchedCount },
      { count: reviewCount },
      { data: listsData },
      { count: followingCount },
      { count: followersCount },
    ] = await Promise.all([
      supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('watchlists').select('id, name, is_public').eq('user_id', uid).eq('is_public', true),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
    ]);

    setStats({
      watched: watchedCount || 0,
      reviews: reviewCount || 0,
      lists: listsData?.length || 0,
      following: followingCount || 0,
      followers: followersCount || 0,
    });

    // Watched films
    const { data: watchedData } = await supabase
      .from('watched')
      .select('tmdb_id, media_type')
      .eq('user_id', uid)
      .order('watched_at', { ascending: false })
      .limit(60);

    const watchedEnriched = await Promise.all(
      (watchedData || []).map(async (w: any) => {
        try {
          const d = await fetchTmdb(w.tmdb_id, w.media_type);
          return { ...w, poster_path: d?.poster_path, title: d?.title || d?.name, overview: d?.overview, vote_average: d?.vote_average, genre_ids: d?.genre_ids };
        } catch { return w; }
      })
    );
    setWatchedFilms(watchedEnriched);

    // Reviews
    const { data: reviewData } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20);

    const reviewsEnriched = await Promise.all(
      (reviewData || []).map(async (r: any) => {
        try {
          const d = await fetchTmdb(r.tmdb_id, r.media_type);
          return { ...r, poster_path: d?.poster_path, film_title: d?.title || d?.name };
        } catch { return { ...r, film_title: 'unknown' }; }
      })
    );
    setReviews(reviewsEnriched);

    // Public lists
    if (listsData && listsData.length > 0) {
      const listIds = listsData.map((l: any) => l.id);
      const { data: wlItems } = await supabase
        .from('watchlist_items')
        .select('watchlist_id, tmdb_id, media_type')
        .in('watchlist_id', listIds);
      const grouped: Record<string, any[]> = {};
      listIds.forEach((id: string) => { grouped[id] = []; });
      (wlItems || []).forEach((item: any) => { grouped[item.watchlist_id]?.push(item); });
      setLists(listsData.map((l: any) => ({
        id: l.id, name: l.name, is_public: l.is_public,
        items: grouped[l.id] || [],
      })));
    }

    setLoading(false);
  };

  const checkFollowing = async () => {
    if (!user || !profile) return;
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', profile.id)
      .maybeSingle();
    setIsFollowing(!!data);
  };

  const toggleFollow = async () => {
    if (!user) { setShowAuthPrompt(true); return; }
    if (!profile) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profile.id);
      setIsFollowing(false);
      setStats(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id });
      setIsFollowing(true);
      setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
    }
    setFollowLoading(false);
  };

  const openModal = (film: FilmEntry) => {
    const cached = tmdbCache.current[film.tmdb_id];
    setModalFilm({
      id: film.tmdb_id,
      media_type: film.media_type,
      title: cached?.title || cached?.name || film.title,
      name: cached?.name,
      poster_path: film.poster_path || cached?.poster_path,
      overview: cached?.overview || film.overview || '',
      vote_average: cached?.vote_average || film.vote_average || 0,
      vote_count: cached?.vote_count || 0,
      release_date: cached?.release_date,
      first_air_date: cached?.first_air_date,
      genre_ids: cached?.genre_ids || film.genre_ids || [],
    });
  };

  const isOwnProfile = user && profile && user.id === profile.id;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'watched', label: 'Watched' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'lists', label: 'Lists' },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center">
      <div style={{ fontSize: '11px', color: '#3a3a3a', letterSpacing: '0.3em' }}>loading...</div>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center flex-col gap-5">
      <div style={{ fontSize: '13px', color: '#444', letterSpacing: '0.15em' }}>user not found</div>
      <a href="/" style={{ fontSize: '10px', color: '#333', letterSpacing: '0.2em', textTransform: 'uppercase', textDecoration: 'none' }}>← home</a>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#070707]" style={{ color: '#e2d9c8' }}>

      {/* Sign-in nudge */}
      {showAuthPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAuthPrompt(false)}>
          <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '32px', textAlign: 'center', maxWidth: '300px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: '#f0ebe0', marginBottom: '12px' }}>sign in to follow</div>
            <p style={{ fontSize: '12px', color: '#666', lineHeight: 1.7, marginBottom: '20px' }}>create an account to follow users and track films</p>
            <a href="/" style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#e2d9c8', textDecoration: 'none', border: '1px solid #444', borderRadius: '3px', padding: '8px 20px' }}>
              go to lumière
            </a>
          </div>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 32px', borderBottom: '1px solid #0f0f0f' }}>
        <a href="/" style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: '#e2d9c8', textDecoration: 'none', fontWeight: 300 }}>
          lumi<span style={{ fontStyle: 'italic', color: '#555' }}>ère</span>
        </a>
        {user && (
          <a href="/profile" style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#333', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#888')}
            onMouseLeave={e => (e.currentTarget.style.color = '#333')}>
            my profile
          </a>
        )}
      </div>

      {/* Profile header */}
      <div style={{ padding: '40px 32px 0', borderBottom: '1px solid #0f0f0f' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', marginBottom: '28px' }}>

          {/* Avatar */}
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#111', border: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.username} width={80} height={80} style={{ objectFit: 'cover' }} unoptimized />
            ) : (
              <span style={{ fontSize: '28px', color: '#444', fontFamily: 'var(--font-display)', fontWeight: 300 }}>
                {profile?.username?.[0]?.toUpperCase()}
              </span>
            )}
          </div>

          {/* Name + bio + follow */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 300, color: '#f0ebe0', margin: 0 }}>
                {profile?.username}
              </h1>
              {isOwnProfile ? (
                <a href="/profile"
                  style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#555', border: '1px solid #222', borderRadius: '2px', padding: '4px 10px', textDecoration: 'none', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#555'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#222'; }}>
                  edit profile
                </a>
              ) : (
                <FollowButton isFollowing={isFollowing} loading={followLoading} onClick={toggleFollow} />
              )}
            </div>
            <p style={{ fontSize: '13px', color: profile?.bio ? '#777' : '#2e2e2e', fontStyle: profile?.bio ? 'normal' : 'italic', margin: 0 }}>
              {profile?.bio || 'no bio'}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap' }}>
          {[
            { label: 'watched', val: stats.watched },
            { label: 'reviews', val: stats.reviews },
            { label: 'lists', val: stats.lists },
            { label: 'following', val: stats.following },
            { label: 'followers', val: stats.followers },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ paddingRight: '28px', marginRight: i < arr.length - 1 ? '28px' : 0, borderRight: i < arr.length - 1 ? '1px solid #141414' : 'none' }}>
              <div style={{ fontSize: '18px', color: '#e2d9c8', fontWeight: 300, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: '5px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', marginTop: '28px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '12px 20px 12px 0', marginRight: '24px', fontSize: '13px', letterSpacing: '0.05em', color: tab === t.id ? '#e2d9c8' : '#3a3a3a', background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #e2d9c8' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.15s' }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = '#888'; }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = '#3a3a3a'; }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '40px 32px', maxWidth: '1100px' }}>

        {tab === 'watched' && (
          watchedFilms.filter(w => w.poster_path).length === 0
            ? <EmptyState text="nothing watched yet" />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '5px' }}>
                {watchedFilms.filter(w => w.poster_path).map((w, i) => (
                  <FilmTile key={i} film={w} onClick={() => openModal(w)} />
                ))}
              </div>
            )
        )}

        {tab === 'reviews' && (
          <div style={{ maxWidth: '660px' }}>
            {reviews.length === 0 ? <EmptyState text="no reviews yet" /> : (
              reviews.map((r, i) => (
                <ReviewCard key={i} review={r} onPosterClick={() => openModal(r as any)} />
              ))
            )}
          </div>
        )}

        {tab === 'lists' && (
          <div style={{ maxWidth: '800px' }}>
            {lists.length === 0 ? <EmptyState text="no public lists" /> : (
              lists.map(wl => (
                <div key={wl.id} style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <button onClick={() => setExpandedList(expandedList === wl.id ? null : wl.id)}
                      style={{ fontSize: '13px', color: '#e2d9c8', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em', padding: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#e2d9c8')}>
                      {wl.name}
                    </button>
                    <span style={{ fontSize: '10px', color: '#333', letterSpacing: '0.1em' }}>{wl.items.length} films</span>
                  </div>
                  {expandedList === wl.id ? (
                    <ListItemGrid items={wl.items} fetchTmdb={fetchTmdb} onFilmClick={openModal} />
                  ) : (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {wl.items.slice(0, 8).map((_, i) => (
                        <div key={i} style={{ width: '60px', aspectRatio: '2/3', borderRadius: '2px', background: '#111', flexShrink: 0 }} />
                      ))}
                      {wl.items.length === 0 && <div style={{ fontSize: '11px', color: '#222' }}>empty</div>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <MovieModal
        movie={modalFilm}
        genres={{}}
        onClose={() => setModalFilm(null)}
        onAuthRequired={() => setShowAuthPrompt(true)}
        readOnly={false}
      />
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FollowButton({ isFollowing, loading, onClick }: { isFollowing: boolean; loading: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase',
        padding: '5px 16px', borderRadius: '3px', cursor: loading ? 'default' : 'pointer',
        transition: 'all 0.2s', opacity: loading ? 0.5 : 1,
        background: isFollowing ? (hovered ? '#1a0000' : 'transparent') : '#e2d9c8',
        color: isFollowing ? (hovered ? '#ff6b6b' : '#888') : '#0d0d0d',
        border: isFollowing ? `1px solid ${hovered ? '#5a1a1a' : '#2a2a2a'}` : '1px solid #e2d9c8',
      }}>
      {loading ? '...' : isFollowing ? (hovered ? 'unfollow' : 'following ✓') : 'follow'}
    </button>
  );
}

function FilmTile({ film, onClick }: { film: any; onClick?: () => void }) {
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
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review, onPosterClick }: { review: any; onPosterClick?: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '16px', padding: '18px 0', borderBottom: '1px solid #0f0f0f' }}>
      {review.poster_path && (
        <div onClick={onPosterClick} style={{ width: '48px', flexShrink: 0, cursor: 'pointer', transition: 'filter 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}>
          <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111' }}>
            <Image src={posterUrl(review.poster_path, 'w185')} alt={review.film_title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
          </div>
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: '#e2d9c8' }}>{review.film_title}</div>
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

function ListItemGrid({ items, fetchTmdb, onFilmClick }: {
  items: { tmdb_id: number; media_type: string }[];
  fetchTmdb: (id: number, type: string) => Promise<any>;
  onFilmClick: (film: any) => void;
}) {
  const [enriched, setEnriched] = useState<any[]>([]);
  useEffect(() => {
    Promise.all(items.slice(0, 50).map(async item => {
      try {
        const d = await fetchTmdb(item.tmdb_id, item.media_type);
        return { ...item, poster_path: d?.poster_path, title: d?.title || d?.name, overview: d?.overview, vote_average: d?.vote_average, genre_ids: d?.genre_ids };
      } catch { return item; }
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
