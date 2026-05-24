'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { posterUrl } from '@/lib/tmdb';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

type Tab = 'palette' | 'mycolors' | 'frames' | 'critiques' | 'queue' | 'lists' | 'likes' | 'tags' | 'circle';

const TABS: { id: Tab; label: string }[] = [
  { id: 'palette', label: 'Palette' },
  { id: 'mycolors', label: 'My Colors' },
  { id: 'frames', label: 'Frames' },
  { id: 'critiques', label: 'Critiques' },
  { id: 'queue', label: 'Queue' },
  { id: 'lists', label: 'Lists' },
  { id: 'likes', label: 'Likes' },
  { id: 'tags', label: 'Tags' },
  { id: 'circle', label: 'Circle' },
];

interface Stats {
  films: number;
  reviews: number;
  lists: number;
  following: number;
  followers: number;
  likes: number;
}

interface ActivityItem {
  type: 'watched' | 'review' | 'like' | 'watchlist';
  tmdb_id: number;
  poster_path?: string;
  title?: string;
  body?: string;
  date: string;
  color?: string;
}

export default function ProfilePage() {
  const { user, profile, signOut, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('palette');
  const [stats, setStats] = useState<Stats>({ films: 0, reviews: 0, lists: 0, following: 0, followers: 0, likes: 0 });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [watchedPosters, setWatchedPosters] = useState<any[]>([]);
  const [likedPosters, setLikedPosters] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [reputation, setReputation] = useState(0);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [tmdbCache, setTmdbCache] = useState<Record<number, any>>({});

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading]);

  useEffect(() => {
    if (!user || !profile) return;
    setBioInput(profile.bio || '');
    loadAll();
  }, [user, profile]);

  const fetchTmdb = async (tmdb_id: number, media_type = 'movie') => {
    if (tmdbCache[tmdb_id]) return tmdbCache[tmdb_id];
    const key = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const res = await fetch(`https://api.themoviedb.org/3/${media_type}/${tmdb_id}?api_key=${key}`);
    const data = await res.json();
    setTmdbCache(prev => ({ ...prev, [tmdb_id]: data }));
    return data;
  };

  const loadAll = async () => {
    if (!user) return;
    const uid = user.id;

    const [
      { data: watched },
      { data: likedData },
      { data: reviewData },
      { data: listData },
      { data: followingData },
      { data: followersData },
    ] = await Promise.all([
      supabase.from('watched').select('*').eq('user_id', uid).order('watched_at', { ascending: false }),
      supabase.from('likes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('reviews').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('watchlists').select('*, watchlist_items(count)').eq('user_id', uid),
      supabase.from('follows').select('*, profiles!follows_following_id_fkey(username, display_name)').eq('follower_id', uid),
      supabase.from('follows').select('*, profiles!follows_follower_id_fkey(username, display_name)').eq('following_id', uid),
    ]);

    setStats({
      films: watched?.length || 0,
      reviews: reviewData?.length || 0,
      lists: listData?.length || 0,
      following: followingData?.length || 0,
      followers: followersData?.length || 0,
      likes: likedData?.length || 0,
    });

    setFollowing(followingData || []);
    setFollowers(followersData || []);
    setReviews(reviewData || []);
    setLists(listData || []);

    // Fetch TMDB data for watched + liked
    const watchedWithData = await Promise.all(
      (watched || []).slice(0, 40).map(async w => {
        const d = await fetchTmdb(w.tmdb_id, w.media_type);
        return { ...w, poster_path: d?.poster_path, title: d?.title || d?.name, color: null };
      })
    );
    setWatchedPosters(watchedWithData);

    const likedWithData = await Promise.all(
      (likedData || []).slice(0, 40).map(async l => {
        const d = await fetchTmdb(l.tmdb_id, l.media_type);
        return { ...l, poster_path: d?.poster_path, title: d?.title || d?.name };
      })
    );
    setLikedPosters(likedWithData);

    // Build activity timeline
    const acts: ActivityItem[] = [
      ...(watched || []).slice(0, 20).map((w: any) => ({ type: 'watched' as const, tmdb_id: w.tmdb_id, date: w.watched_at })),
      ...(likedData || []).slice(0, 20).map((l: any) => ({ type: 'like' as const, tmdb_id: l.tmdb_id, date: l.created_at })),
      ...(reviewData || []).slice(0, 20).map((r: any) => ({ type: 'review' as const, tmdb_id: r.tmdb_id, date: r.created_at, body: r.body })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Enrich activity with TMDB
    const enriched = await Promise.all(acts.slice(0, 30).map(async a => {
      const d = await fetchTmdb(a.tmdb_id);
      return { ...a, poster_path: d?.poster_path, title: d?.title || d?.name };
    }));
    setActivity(enriched);

    // Reputation: likes on reviews
    const { data: reviewLikes } = await supabase
      .from('review_likes').select('id').in('review_id', (reviewData || []).map((r: any) => r.id));
    const totalLikes = (reviewLikes || []).length;
    const rep = Math.min(5, (totalLikes / Math.max(1, (reviewData || []).length)) * 2.5);
    setReputation(Math.round(rep * 10) / 10);
  };

  const saveBio = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ bio: bioInput }).eq('id', user.id);
    setEditingBio(false);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading || !profile) return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center">
      <div style={{ fontSize: '11px', color: '#444', letterSpacing: '0.3em' }}>loading...</div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#070707]" style={{ color: '#e2d9c8' }}>
      {/* Header nav */}
      <div className="flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: '#111' }}>
        <a href="/" className="font-display font-light" style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: '#f0ebe0', textDecoration: 'none' }}>
          lumi<span style={{ fontStyle: 'italic', color: '#666' }}>ère</span>
        </a>
        <button onClick={async () => { await signOut(); router.push('/'); }}
          style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ccc')}
          onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
          logout
        </button>
      </div>

      {/* Profile hero */}
      <div className="px-8 py-8 border-b" style={{ borderColor: '#111' }}>
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '28px', color: '#888', fontFamily: 'var(--font-display)', fontWeight: 300 }}>
              {profile.username?.[0]?.toUpperCase()}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 300, color: '#f0ebe0' }}>
                {profile.display_name || profile.username}
              </h1>
              {reputation > 0 && (
                <span style={{ fontSize: '12px', color: '#888' }}>★ {reputation.toFixed(1)}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', letterSpacing: '0.05em' }}>
              @{profile.username}
            </div>

            {/* Bio */}
            {editingBio ? (
              <div className="flex gap-2 items-center">
                <input value={bioInput} onChange={e => setBioInput(e.target.value)}
                  style={{ background: 'transparent', borderBottom: '1px solid #333', color: '#ccc', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '4px 0', outline: 'none', width: '300px' }}
                  onKeyDown={e => { if (e.key === 'Enter') saveBio(); if (e.key === 'Escape') setEditingBio(false); }}
                  autoFocus
                />
                <button onClick={saveBio} style={{ fontSize: '10px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.15em' }}>save</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <p style={{ fontSize: '13px', color: '#888', fontStyle: profile.bio ? 'normal' : 'italic' }}>
                  {profile.bio || 'no bio yet'}
                </p>
                <button onClick={() => setEditingBio(true)}
                  style={{ fontSize: '10px', color: '#444', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#444')}>
                  edit
                </button>
              </div>
            )}

            <div style={{ fontSize: '12px', color: '#555', marginTop: '10px', letterSpacing: '0.08em', fontStyle: 'italic' }}>
              colors are cinema, & cinema is color
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 flex-shrink-0">
            {[
              { label: 'films', val: stats.films },
              { label: 'reviews', val: stats.reviews },
              { label: 'lists', val: stats.lists },
              { label: 'following', val: stats.following },
              { label: 'followers', val: stats.followers },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div style={{ fontSize: '22px', fontWeight: 400, color: '#f0ebe0', lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b" style={{ borderColor: '#111' }}>
        <div className="flex px-8 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '14px 18px', fontSize: '12px', letterSpacing: '0.1em',
                color: tab === t.id ? '#f0ebe0' : '#555',
                borderBottom: tab === t.id ? '2px solid #f0ebe0' : '2px solid transparent',
                background: 'none', border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.2s',
              }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = '#aaa'; }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = '#555'; }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-8 py-8">

        {/* PALETTE — watched films as poster grid */}
        {tab === 'palette' && (
          <div>
            <div style={{ fontSize: '11px', color: '#555', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '20px' }}>
              {stats.films} films watched
            </div>
            {watchedPosters.length === 0 ? (
              <Empty text="no films watched yet" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                {watchedPosters.map((w, i) => (
                  <PosterThumb key={i} poster_path={w.poster_path} title={w.title} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* MY COLORS — activity timeline */}
        {tab === 'mycolors' && (
          <div style={{ maxWidth: '600px' }}>
            <div style={{ fontSize: '11px', color: '#555', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '24px' }}>
              recent activity
            </div>
            {activity.length === 0 ? <Empty text="no activity yet" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {activity.map((a, i) => (
                  <ActivityRow key={i} item={a} formatDate={formatDate} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* FRAMES — diary */}
        {tab === 'frames' && (
          <div style={{ maxWidth: '600px' }}>
            {activity.filter(a => a.type === 'watched').length === 0 ? <Empty text="no entries yet" /> : (
              activity.filter(a => a.type === 'watched').map((a, i) => (
                <ActivityRow key={i} item={a} formatDate={formatDate} />
              ))
            )}
          </div>
        )}

        {/* CRITIQUES — reviews */}
        {tab === 'critiques' && (
          <div style={{ maxWidth: '640px' }}>
            {reviews.length === 0 ? <Empty text="no reviews written yet" /> : (
              reviews.map((r, i) => (
                <div key={i} style={{ borderBottom: '1px solid #111', paddingBottom: '20px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.15em', marginBottom: '6px' }}>
                    {formatDate(r.created_at)}
                  </div>
                  {r.title && <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px', color: '#e8e0d0', marginBottom: '6px' }}>{r.title}</div>}
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: '#bbb', lineHeight: '1.7' }}>{r.body}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* QUEUE — watchlists */}
        {tab === 'queue' && (
          <div>
            {lists.length === 0 ? <Empty text="no watchlists yet" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
                {lists.map((l: any, i: number) => (
                  <div key={i} style={{ border: '1px solid #1e1e1e', borderRadius: '4px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '14px', color: '#e8e0d0', marginBottom: '4px' }}>{l.name}</div>
                    {l.description && <div style={{ fontSize: '12px', color: '#666' }}>{l.description}</div>}
                    <div style={{ fontSize: '10px', color: '#444', marginTop: '6px', letterSpacing: '0.1em' }}>
                      {l.watchlist_items?.[0]?.count || 0} films
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LISTS */}
        {tab === 'lists' && (
          <div style={{ maxWidth: '480px' }}>
            {lists.length === 0 ? <Empty text="no lists yet" /> : (
              lists.map((l: any, i: number) => (
                <div key={i} style={{ borderBottom: '1px solid #111', padding: '14px 0' }}>
                  <div style={{ fontSize: '14px', color: '#e8e0d0' }}>{l.name}</div>
                  <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>{formatDate(l.created_at)}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* LIKES */}
        {tab === 'likes' && (
          <div>
            {likedPosters.length === 0 ? <Empty text="no liked films yet" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                {likedPosters.map((l, i) => (
                  <PosterThumb key={i} poster_path={l.poster_path} title={l.title} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAGS */}
        {tab === 'tags' && <Empty text="no tags yet" />}

        {/* CIRCLE — following/followers */}
        {tab === 'circle' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', maxWidth: '640px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#555', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '16px' }}>
                following {stats.following}
              </div>
              {following.length === 0 ? <Empty text="not following anyone" /> : (
                following.map((f: any, i: number) => (
                  <UserRow key={i} username={f.profiles?.username} displayName={f.profiles?.display_name} />
                ))
              )}
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#555', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '16px' }}>
                followers {stats.followers}
              </div>
              {followers.length === 0 ? <Empty text="no followers yet" /> : (
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

function PosterThumb({ poster_path, title }: { poster_path: string | null; title: string }) {
  if (!poster_path) return null;
  return (
    <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: '3px', overflow: 'hidden', background: '#111', cursor: 'pointer' }}
      title={title}>
      <Image src={posterUrl(poster_path, 'w185')} alt={title} fill style={{ objectFit: 'cover' }} unoptimized />
    </div>
  );
}

function ActivityRow({ item, formatDate }: { item: any; formatDate: (d: string) => string }) {
  const typeLabel: Record<string, string> = {
    watched: 'watched', like: 'liked', review: 'reviewed', watchlist: 'added to watchlist'
  };
  return (
    <div style={{ display: 'flex', gap: '14px', padding: '12px 0', borderBottom: '1px solid #0f0f0f', alignItems: 'flex-start' }}>
      {item.poster_path && (
        <div style={{ width: '36px', height: '54px', borderRadius: '2px', overflow: 'hidden', flexShrink: 0, background: '#111' }}>
          <Image src={posterUrl(item.poster_path, 'w185')} alt={item.title || ''} width={36} height={54} style={{ objectFit: 'cover' }} unoptimized />
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{typeLabel[item.type]}</span>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: '#e0d8c8', marginTop: '2px' }}>{item.title}</div>
          </div>
          <div style={{ fontSize: '10px', color: '#444', letterSpacing: '0.05em', flexShrink: 0, marginLeft: '12px' }}>
            {formatDate(item.date)}
          </div>
        </div>
        {item.body && (
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: '#888', marginTop: '6px', lineHeight: '1.6' }}>
            {item.body.slice(0, 120)}{item.body.length > 120 ? '...' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

function UserRow({ username, displayName }: { username: string; displayName: string }) {
  return (
    <a href={`/user/${username}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', textDecoration: 'none' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#666' }}>
        {username?.[0]?.toUpperCase()}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: '#ccc' }}>{displayName || username}</div>
        <div style={{ fontSize: '10px', color: '#555' }}>@{username}</div>
      </div>
    </a>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: '12px', color: '#444', letterSpacing: '0.15em', padding: '40px 0' }}>{text}</div>;
}
