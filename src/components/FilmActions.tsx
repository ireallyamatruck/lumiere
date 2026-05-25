'use client';

import { useState, useEffect } from 'react';
import { supabase, Watchlist } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Movie, getTitle } from '@/lib/tmdb';

interface Props {
  movie: Movie;
  onAuthRequired: () => void;
  onReviewSubmit?: () => void;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <div style={{ fontSize: '11px', color: hover || value ? '#ccc' : '#444', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px', textAlign: 'center', transition: 'color 0.2s' }}>
        rate
      </div>
      <div className="flex gap-1 justify-center">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star === value ? 0 : star)}
            style={{ fontSize: '24px', color: star <= (hover || value) ? '#f0ebe0' : '#252525', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s', padding: '0 2px' }}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

const ACTION_ICONS: Record<string, string> = {
  watched: '◎', like: '♥', watchlist: '⊕', review: '✎'
};

export default function FilmActions({ movie, onAuthRequired, onReviewSubmit }: Props) {
  const { user } = useAuth();
  const tmdbId = movie.id;
  const mediaType = movie.title ? 'movie' : 'tv';

  const [watched, setWatched] = useState(false);
  const [liked, setLiked] = useState(false);
  const [rating, setRating] = useState(0);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [inWatchlists, setInWatchlists] = useState<Set<string>>(new Set());
  const [showReview, setShowReview] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [listCreated, setListCreated] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [w, l, r, wl] = await Promise.all([
        supabase.from('watched').select('id').eq('user_id', user.id).eq('tmdb_id', tmdbId).single(),
        supabase.from('likes').select('id').eq('user_id', user.id).eq('tmdb_id', tmdbId).single(),
        supabase.from('ratings').select('rating').eq('user_id', user.id).eq('tmdb_id', tmdbId).single(),
        supabase.from('watchlists').select('*').eq('user_id', user.id),
      ]);
      setWatched(!!w.data);
      setLiked(!!l.data);
      setRating(r.data?.rating ?? 0);
      setWatchlists(wl.data || []);
      if (wl.data?.length) {
        const ids = wl.data.map((w: Watchlist) => w.id);
        const { data: items } = await supabase.from('watchlist_items').select('watchlist_id').in('watchlist_id', ids).eq('tmdb_id', tmdbId);
        setInWatchlists(new Set((items || []).map((i: any) => i.watchlist_id)));
      }
    };
    load();
  }, [user, tmdbId]);

  const guard = (fn: () => void) => { if (!user) { onAuthRequired(); return; } fn(); };

  const toggleWatched = () => guard(async () => {
    if (watched) await supabase.from('watched').delete().eq('user_id', user!.id).eq('tmdb_id', tmdbId);
    else await supabase.from('watched').insert({ user_id: user!.id, tmdb_id: tmdbId, media_type: mediaType });
    setWatched(!watched);
  });

  const toggleLike = () => guard(async () => {
    if (liked) await supabase.from('likes').delete().eq('user_id', user!.id).eq('tmdb_id', tmdbId);
    else await supabase.from('likes').insert({ user_id: user!.id, tmdb_id: tmdbId, media_type: mediaType });
    setLiked(!liked);
  });

  const handleRating = (val: number) => guard(async () => {
    if (val === 0) await supabase.from('ratings').delete().eq('user_id', user!.id).eq('tmdb_id', tmdbId);
    else await supabase.from('ratings').upsert({ user_id: user!.id, tmdb_id: tmdbId, media_type: mediaType, rating: val, updated_at: new Date().toISOString() }, { onConflict: 'user_id,tmdb_id' });
    setRating(val);
  });

  const submitReview = async () => {
    if (!reviewBody.trim() || !user) return;
    setSubmitting(true);
    await supabase.from('reviews').insert({
      user_id: user.id, tmdb_id: tmdbId, media_type: mediaType,
      title: reviewTitle || null, body: reviewBody, contains_spoilers: spoiler,
      created_at: new Date().toISOString(),
    });
    setSubmitting(false);
    setShowReview(false);
    setReviewTitle('');
    setReviewBody('');
    onReviewSubmit?.();
  };

  const toggleWatchlist = async (wlId: string) => {
    if (!user) return;
    if (inWatchlists.has(wlId)) {
      await supabase.from('watchlist_items').delete().eq('watchlist_id', wlId).eq('tmdb_id', tmdbId);
      setInWatchlists(prev => { const s = new Set(prev); s.delete(wlId); return s; });
    } else {
      await supabase.from('watchlist_items').insert({ watchlist_id: wlId, tmdb_id: tmdbId, media_type: mediaType });
      setInWatchlists(prev => new Set([...prev, wlId]));
      setLastAdded(wlId);
      setTimeout(() => setLastAdded(null), 2000);
    }
  };

  const createList = async () => {
    if (!newListName.trim() || !user) return;
    const { data } = await supabase.from('watchlists').insert({ user_id: user.id, name: newListName.trim(), is_public: true }).select().single();
    if (data) {
      setWatchlists(prev => [...prev, data]);
      setNewListName('');
      setListCreated(true);
      setTimeout(() => setListCreated(false), 2000);
    }
  };

  const actions = [
    { key: 'watched', label: 'watched', active: watched, onClick: toggleWatched },
    { key: 'like', label: 'like', active: liked, onClick: toggleLike },
    { key: 'watchlist', label: 'watchlist', active: showLists, onClick: () => guard(() => setShowLists(!showLists)) },
    { key: 'review', label: 'review', active: showReview, onClick: () => guard(() => setShowReview(!showReview)) },
  ];

  return (
    <div style={{ borderTop: '1px solid #1a1a1a', marginTop: '4px' }}>
      {/* Main action row */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '16px 8px 12px' }}>
        {actions.map(({ key, label, active, onClick }) => {
          const isHovered = hoveredAction === key;
          const isActive = active;
          return (
            <button key={key} onClick={onClick}
              onMouseEnter={() => setHoveredAction(key)}
              onMouseLeave={() => setHoveredAction(null)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              <span style={{ fontSize: '20px', color: isActive ? '#f0ebe0' : isHovered ? '#ccc' : '#333', transition: 'color 0.2s, transform 0.2s', transform: isHovered ? 'scale(1.15)' : 'scale(1)', display: 'block' }}>
                {ACTION_ICONS[key]}
              </span>
              <span style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: isActive ? '#aaa' : isHovered ? '#888' : '#2a2a2a', transition: 'color 0.2s' }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Star rating */}
      <div style={{ paddingBottom: '14px' }}>
        <StarRating value={rating} onChange={handleRating} />
      </div>

      {/* Watchlists panel */}
      {showLists && (
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#666', marginBottom: '10px' }}>add to list</div>
          {watchlists.length === 0 && <div style={{ fontSize: '11px', color: '#444', marginBottom: '10px' }}>no lists yet</div>}
          {watchlists.map(wl => (
            <button key={wl.id} onClick={() => toggleWatchlist(wl.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '5px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: '14px', color: inWatchlists.has(wl.id) ? '#f0ebe0' : '#2a2a2a', transition: 'color 0.2s' }}>
                {inWatchlists.has(wl.id) ? '◼' : '◻'}
              </span>
              <span style={{ fontSize: '12px', color: inWatchlists.has(wl.id) ? '#e2d9c8' : '#666', transition: 'color 0.2s', flex: 1 }}>
                {wl.name}
              </span>
              {lastAdded === wl.id && (
                <span style={{ fontSize: '10px', color: '#6aab6a', letterSpacing: '0.1em', transition: 'opacity 0.3s' }}>added</span>
              )}
            </button>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input value={newListName} onChange={e => setNewListName(e.target.value)}
              placeholder="new list name..."
              style={{ flex: 1, background: 'transparent', borderBottom: '1px solid #222', color: '#e2d9c8', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 0', outline: 'none' }}
              onKeyDown={e => { if (e.key === 'Enter') createList(); }} />
            <button onClick={createList} style={{ fontSize: '10px', color: listCreated ? '#6aab6a' : '#666', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={e => { if (!listCreated) e.currentTarget.style.color = '#ccc'; }}
              onMouseLeave={e => { if (!listCreated) e.currentTarget.style.color = '#666'; }}>
              {listCreated ? '✓ created' : '+ create'}
            </button>
          </div>
        </div>
      )}

      {/* Review panel */}
      {showReview && (
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#666', marginBottom: '10px' }}>
            review — {getTitle(movie)}
          </div>
          <input value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} placeholder="title (optional)"
            style={{ width: '100%', background: 'transparent', borderBottom: '1px solid #1e1e1e', color: '#e2d9c8', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 0', outline: 'none', marginBottom: '10px' }} />
          <textarea value={reviewBody} onChange={e => setReviewBody(e.target.value)} placeholder="your thoughts..." rows={4}
            style={{ width: '100%', background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#e2d9c8', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '10px', outline: 'none', borderRadius: '3px', resize: 'none', lineHeight: '1.6' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} />
              <span style={{ fontSize: '10px', color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>spoilers</span>
            </label>
            <button onClick={submitReview} disabled={!reviewBody.trim() || submitting}
              style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid #333', color: '#e2d9c8', padding: '6px 14px', borderRadius: '3px', background: 'transparent', cursor: 'pointer', opacity: reviewBody.trim() ? 1 : 0.3, transition: 'all 0.2s' }}
              onMouseEnter={e => { if (reviewBody.trim()) e.currentTarget.style.borderColor = '#888'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; }}>
              {submitting ? 'saving...' : 'save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
