'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { posterUrl } from '@/lib/tmdb';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

type Tab = 'films' | 'diary' | 'reviews' | 'watchlist' | 'likes' | 'lists' | 'circle';

const TABS: { id: Tab; label: string }[] = [
  { id: 'films', label: 'Films' },
  { id: 'diary', label: 'Diary' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'likes', label: 'Likes' },
  { id: 'lists', label: 'Lists' },
  { id: 'circle', label: 'Circle' },
];

interface Stats { films: number; reviews: number; lists: number; following: number; followers: number }
interface FilmEntry {
  id: string; tmdb_id: number; media_type: string; watched_at: string;
  poster_path?: string; title?: string; rating?: number;
}
interface ReviewEntry {
  id: string; tmdb_id: number; media_type: string; created_at: string;
  title?: string; body: string; poster_path?: string; film_title?: string; rating?: number;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProfilePage() {
  const { user, profile, signOut, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('films');
  const [stats, setStats] = useState<Stats>({ films: 0, reviews: 0, lists: 0, following: 0, followers: 0 });
  const [allWatched, setAllWatched] = useState<FilmEntry[]>([]);
  const [recentFilms, setRecentFilms] = useState<FilmEntry[]>([]);
  const [likedFilms, setLikedFilms] = useState<FilmEntry[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [tmdbCache] = useState<Record<number, any>>({});

  useEffect(() => {
    if (!loading && !user) router.push('/');
    if (!loading && !profile) setPageLoading(false);
  }, [user, profile, loading]);

  useEffect(() => {
    if (!user || !profile) return;
    setBioInput(profile.bio || '');
    loadAll();
  }, [user?.id]);

  const fetchTmdb = async (tmdb_id: number, media_type = 'movie') => {
    if (tmdbCache[tmdb_id]) return tmdbCache[tmdb_id];
    const key = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const res = await fetch(`https://api.themoviedb.org/3/${media_type}/${tmdb_id}?api_key=${key}`);
    const data = await res.json();
    tmdbCache[tmdb_id] = data;
    return data;
  };

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
      ] = await Promise.all([
        supabase.from('watched').select('*').eq('user_id', uid).order('watched_at', { ascending: false }),
        supabase.from('likes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('reviews').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('ratings').select('*').eq('user_id', uid),
        supabase.from('watchlists').select('*, watchlist_items(count)').eq('user_id', uid),
      ]);

      const [followingRes, followersRes] = await Promise.all([
        supabase.from('follows').select('*, profiles!follows_following_id_fkey(username, display_name)').eq('follower_id', uid),
        supabase.from('follows').select('*, profiles!follows_follower_id_fkey(username, display_name)').eq('following_id', uid),
      ]);

      const followingData = followingRes.error ? [] : (followingRes.data || []);
      const followersData = followersRes.error ? [] : (followersRes.data || []);

      const rMap: Record<number, number> = {};
      (ratingsData || []).forEach((r: any) => { rMap[r.tmdb_id] = r.rating; });

      setStats({
        films: watched?.length || 0,
        reviews: reviewData?.length || 0,
        lists: listData?.length || 0,
        following: followingData.length,
        followers: followersData.length,
      });
      setFollowing(followingData);
      setFollowers(followersData);
      setWatchlists(listData || []);

      const watchedEnriched = await Promise.all(
        (watched || []).slice(0, 60).map(async (w: any) => {
          try {
            const d = await fetchTmdb(w.tmdb_id, w.media_type);
            return { ...w, poster_path: d?.poster_path, title: d?.title || d?.name, rating: rMap[w.tmdb_id] };
          } catch { return { ...w, poster_path: null, title: '', rating: rMap[w.tmdb_id] }; }
        })
      );
      setAllWatched(watchedEnriched);
      setRecentFilms(watchedEnriched.filter(f => f.poster_path).slice(0, 5));

      const likedEnriched = await Promise.all(
        (likedData || []).slice(0, 60).map(async (l: any) => {
          try {
            const d = await fetchTmdb(l.tmdb_id, l.media_type);
            return { ...l, poster_path: d?.poster_path, title: d?.title || d?.name };
          } catch { return { ...l, poster_path: null, title: '' }; }
        })
      );
      setLikedFilms(likedEnriched);

      const reviewsEnriched = await Promise.all(
        (reviewData || []).slice(0, 20).map(async (r: any) => {
          try {
            const d = await fetchTmdb(r.tmdb_id, r.media_type);
            return { ...r, poster_path: d?.poster_path, film_title: d?.title || d?.name, rating: rMap[r.tmdb_id] };
          } catch { return { ...r, poster_path: null, film_title: 'unknown', rating: rMap[r.tmdb_id] }; }
        })
      );
      setReviews(reviewsEnriched);
    } catch (e) {
      console.error('Profile load error:', e);
    } finally {
      setPageLoading(false);
    }
  };

  const saveBio = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ bio: bioInput }).eq('id', user.id);
    setEditingBio(false);
  };

  if (loading || pageLoading) return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center">
      <div style={{ fontSize: '11px', color: '#444', letterSpacing: '0.3em' }}>loading...</div>
    </div>
  );
  if (!profile) return null;

  // Group diary by month
  const diaryByMonth: Record<string, FilmEntry[]> = {};
  allWatched.forEach(w => {
    const key = new Date(w.watched_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!diaryByMonth[key]) diaryByMonth[key] = [];
    diaryByMonth[key].push(w);
  });

  return (
    <main className="min-h-screen bg-[#070707]" style={{ color: '#e2d9c8' }}>
      {/* Nav */}
      <div className="flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: '#111' }}>
        <a href="/" style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: '#f0ebe0', textDecoration: 'none', fontWeight: 300 }}>
          lumi<span style={{ fontStyle: 'italic', color: '#555' }}>ère</span>
        </a>
        <button
          onClick={async () => { await signOut(); router.push('/'); }}
          style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#444', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
          onMouseLeave={e => (e.currentTarget.style.color = '#444')}
        >logout</button>
      </div>

      {/* Profile header */}
      <div className="px-8 pt-10 pb-8 border-b" style={{ borderColor: '#111' }}>
        <div style={{ maxWidth: '900px' }}>
          {/* Top row */}
          <div className="flex items-start gap-6 mb-8">
            <div style={{
              width: '68px', height: '68px', borderRadius: '50%',
              background: '#111', border: '1px solid #1e1e1e', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '24px', color: '#555', fontFamily: 'var(--font-display)', fontWeight: 300 }}>
                {profile.username?.[0]?.toUpperCase()}
              </span>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 300, color: '#f0ebe0', lineHeight: 1, marginBottom: '4px' }}>
                {profile.display_name || profile.username}
              </div>
              <div style={{ fontSize: '11px', color: '#3a3a3a', letterSpacing: '0.1em', marginBottom: '12px' }}>
                @{profile.username}
              </div>
              {editingBio ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    value={bioInput}
                    onChange={e => setBioInput(e.target.value)}
                    style={{ background: 'transparent', borderBottom: '1px solid #2a2a2a', color: '#ccc', fontSize: '13px', padding: '3px 0', outline: 'none', width: '300px' }}
                    onKeyDown={e => { if (e.key === 'Enter') saveBio(); if (e.key === 'Escape') setEditingBio(false); }}
                    autoFocus
                  />
                  <button onClick={saveBio} style={{ fontSize: '10px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}>save</button>
                  <button onClick={() => setEditingBio(false)} style={{ fontSize: '10px', color: '#444', background: 'none', border: 'none', cursor: 'pointer' }}>cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', color: profile.bio ? '#777' : '#2e2e2e', fontStyle: profile.bio ? 'normal' : 'italic' }}>
                    {profile.bio || 'add a bio'}
                  </span>
                  <button
                    onClick={() => setEditingBio(true)}
                    style={{ fontSize: '10px', color: '#2e2e2e', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#2e2e2e')}
                  >edit</button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '32px', flexShrink: 0 }}>
              {[
                { label: 'films', val: stats.films },
                { label: 'reviews', val: stats.reviews },
                { label: 'following', val: stats.following },
                { label: 'followers', val: stats.followers },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', color: '#e2d9c8', lineHeight: 1, fontWeight: 300 }}>{s.val}</div>
                  <div style={{ fontSize: '9px', color: '#3a3a3a', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '5px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent films strip */}
          {recentFilms.length > 0 && (
            <div>
              <div style={{ fontSize: '9px', color: '#2e2e2e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '10px' }}>recent films</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {recentFilms.map((f, i) => (
                  <div key={i} style={{ width: '48px', flexShrink: 0 }} title={f.title}>
                    <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111' }}>
                      <Image src={posterUrl(f.poster_path!, 'w185')} alt={f.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
                    </div>
                    {f.rating && (
                      <div style={{ fontSize: '9px', color: '#555', marginTop: '3px', letterSpacing: '1px', textAlign: 'center' }}>
                        {'★'.repeat(f.rating)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #111' }}>
        <div style={{ display: 'flex', paddingLeft: '32px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '13px 16px',
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: tab === t.id ? '#e2d9c8' : '#444',
                background: 'none',
                border: 'none',
                borderBottom: tab === t.id ? '1px solid #e2d9c8' : '1px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = '#888'; }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = '#444'; }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '32px', maxWidth: '960px' }}>

        {/* FILMS — dense poster grid */}
        {tab === 'films' && (
          <div>
            <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '20px' }}>
              {stats.films} films watched
            </div>
            {allWatched.length === 0 ? <EmptyState text="no films watched yet" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '5px' }}>
                {allWatched.map((w, i) => (
                  <FilmTile key={i} film={w} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* DIARY — grouped by month */}
        {tab === 'diary' && (
          <div style={{ maxWidth: '640px' }}>
            {allWatched.length === 0 ? <EmptyState text="no diary entries yet" /> : (
              Object.entries(diaryByMonth).map(([month, films]) => (
                <div key={month} style={{ marginBottom: '40px' }}>
                  <div style={{
                    fontSize: '10px', color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase',
                    marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #0f0f0f',
                  }}>
                    {month}
                  </div>
                  {films.map((f, i) => <DiaryRow key={i} film={f} />)}
                </div>
              ))
            )}
          </div>
        )}

        {/* REVIEWS */}
        {tab === 'reviews' && (
          <div style={{ maxWidth: '660px' }}>
            <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '20px' }}>
              {stats.reviews} reviews
            </div>
            {reviews.length === 0 ? <EmptyState text="no reviews written yet" /> : (
              reviews.map((r, i) => <ReviewCard key={i} review={r} />)
            )}
          </div>
        )}

        {/* WATCHLIST */}
        {tab === 'watchlist' && (
          <div style={{ maxWidth: '480px' }}>
            {watchlists.length === 0 ? <EmptyState text="no watchlists yet" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {watchlists.map((l: any, i: number) => (
                  <div key={i} style={{ border: '1px solid #141414', borderRadius: '3px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '14px', color: '#e2d9c8', marginBottom: '4px' }}>{l.name}</div>
                    {l.description && <div style={{ fontSize: '12px', color: '#555', marginBottom: '6px' }}>{l.description}</div>}
                    <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      {l.watchlist_items?.[0]?.count || 0} films
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LIKES */}
        {tab === 'likes' && (
          <div>
            {likedFilms.length === 0 ? <EmptyState text="no liked films yet" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '5px' }}>
                {likedFilms.map((l, i) => <FilmTile key={i} film={l} />)}
              </div>
            )}
          </div>
        )}

        {/* LISTS */}
        {tab === 'lists' && (
          <div style={{ maxWidth: '480px' }}>
            {watchlists.length === 0 ? <EmptyState text="no lists yet" /> : (
              watchlists.map((l: any, i: number) => (
                <div key={i} style={{ borderBottom: '1px solid #0f0f0f', padding: '14px 0' }}>
                  <div style={{ fontSize: '15px', color: '#e2d9c8' }}>{l.name}</div>
                  <div style={{ fontSize: '10px', color: '#333', marginTop: '5px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {l.watchlist_items?.[0]?.count || 0} films · {formatDate(l.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* CIRCLE */}
        {tab === 'circle' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', maxWidth: '540px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '16px' }}>
                following · {stats.following}
              </div>
              {following.length === 0 ? <EmptyState text="not following anyone" /> : (
                following.map((f: any, i: number) => (
                  <UserRow key={i} username={f.profiles?.username} displayName={f.profiles?.display_name} />
                ))
              )}
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '16px' }}>
                followers · {stats.followers}
              </div>
              {followers.length === 0 ? <EmptyState text="no followers yet" /> : (
                followers.map((f: any, i: number) => (
                  <UserRow key={i} username={f.profiles?.username} displayName={f.profiles?.display_name} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function FilmTile({ film }: { film: FilmEntry }) {
  const [hovered, setHovered] = useState(false);
  if (!film.poster_path) return null;
  return (
    <div
      style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111', cursor: 'pointer' }}
      title={film.title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Image src={posterUrl(film.poster_path, 'w185')} alt={film.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
      {hovered && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '8px 6px' }}>
          <div style={{ fontSize: '10px', color: '#e2d9c8', lineHeight: 1.3 }}>{film.title}</div>
          {film.rating && (
            <div style={{ fontSize: '9px', color: '#888', marginTop: '3px', letterSpacing: '1px' }}>{'★'.repeat(film.rating)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function DiaryRow({ film }: { film: FilmEntry }) {
  const date = new Date(film.watched_at);
  return (
    <div style={{ display: 'flex', gap: '14px', padding: '10px 0', borderBottom: '1px solid #0a0a0a', alignItems: 'flex-start' }}>
      <div style={{ width: '38px', textAlign: 'center', flexShrink: 0, paddingTop: '2px' }}>
        <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {date.toLocaleDateString('en-US', { weekday: 'short' })}
        </div>
        <div style={{ fontSize: '20px', color: '#444', lineHeight: 1, marginTop: '2px', fontWeight: 300 }}>
          {date.getDate()}
        </div>
      </div>
      {film.poster_path ? (
        <div style={{ width: '30px', flexShrink: 0 }}>
          <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111' }}>
            <Image src={posterUrl(film.poster_path, 'w185')} alt={film.title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
          </div>
        </div>
      ) : <div style={{ width: '30px', flexShrink: 0 }} />}
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: '#ddd5c3', marginBottom: '4px' }}>{film.title}</div>
        {film.rating && (
          <div style={{ fontSize: '11px', color: '#555', letterSpacing: '1px' }}>
            {'★'.repeat(film.rating)}{'☆'.repeat(5 - film.rating)}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewEntry }) {
  return (
    <div style={{ display: 'flex', gap: '16px', padding: '18px 0', borderBottom: '1px solid #0f0f0f' }}>
      {review.poster_path && (
        <div style={{ width: '48px', flexShrink: 0 }}>
          <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '2px', overflow: 'hidden', background: '#111' }}>
            <Image src={posterUrl(review.poster_path, 'w185')} alt={review.film_title || ''} fill style={{ objectFit: 'cover' }} unoptimized />
          </div>
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: '#e2d9c8' }}>{review.film_title}</div>
            {review.rating && (
              <div style={{ fontSize: '11px', color: '#555', marginTop: '3px', letterSpacing: '1px' }}>
                {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
              </div>
            )}
          </div>
          <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.05em', flexShrink: 0, marginLeft: '16px' }}>
            {formatDate(review.created_at)}
          </div>
        </div>
        {review.title && (
          <div style={{ fontSize: '13px', color: '#999', marginBottom: '6px', fontStyle: 'italic' }}>{review.title}</div>
        )}
        <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.7', margin: 0 }}>
          {review.body.slice(0, 220)}{review.body.length > 220 ? '...' : ''}
        </p>
      </div>
    </div>
  );
}

function UserRow({ username, displayName }: { username: string; displayName: string }) {
  return (
    <a href={`/user/${username}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', textDecoration: 'none' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#111', border: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#444', flexShrink: 0 }}>
        {username?.[0]?.toUpperCase()}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: '#bbb' }}>{displayName || username}</div>
        <div style={{ fontSize: '10px', color: '#444' }}>@{username}</div>
      </div>
    </a>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ fontSize: '12px', color: '#2e2e2e', letterSpacing: '0.15em', padding: '48px 0' }}>{text}</div>;
}
