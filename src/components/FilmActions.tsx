'use client';

import { useState, useEffect } from 'react';
import { supabase, Watchlist } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Movie, getTitle } from '@/lib/tmdb';

interface Props {
  movie: Movie;
  onAuthRequired: () => void;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star === value ? 0 : star)}
          className="text-[22px] transition-colors"
          style={{ color: star <= (hover || value) ? '#e2d9c8' : '#2a2a2a' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function FilmActions({ movie, onAuthRequired }: Props) {
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

      // Check which watchlists contain this film
      if (wl.data?.length) {
        const ids = wl.data.map((w: Watchlist) => w.id);
        const { data: items } = await supabase
          .from('watchlist_items')
          .select('watchlist_id')
          .in('watchlist_id', ids)
          .eq('tmdb_id', tmdbId);
        setInWatchlists(new Set((items || []).map((i: { watchlist_id: string }) => i.watchlist_id)));
      }
    };
    load();
  }, [user, tmdbId]);

  const guard = (fn: () => void) => {
    if (!user) { onAuthRequired(); return; }
    fn();
  };

  const toggleWatched = () => guard(async () => {
    if (watched) {
      await supabase.from('watched').delete().eq('user_id', user!.id).eq('tmdb_id', tmdbId);
    } else {
      await supabase.from('watched').insert({ user_id: user!.id, tmdb_id: tmdbId, media_type: mediaType });
    }
    setWatched(!watched);
  });

  const toggleLike = () => guard(async () => {
    if (liked) {
      await supabase.from('likes').delete().eq('user_id', user!.id).eq('tmdb_id', tmdbId);
    } else {
      await supabase.from('likes').insert({ user_id: user!.id, tmdb_id: tmdbId, media_type: mediaType });
    }
    setLiked(!liked);
  });

  const handleRating = (val: number) => guard(async () => {
    if (val === 0) {
      await supabase.from('ratings').delete().eq('user_id', user!.id).eq('tmdb_id', tmdbId);
    } else {
      await supabase.from('ratings').upsert({
        user_id: user!.id, tmdb_id: tmdbId, media_type: mediaType, rating: val, updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,tmdb_id' });
    }
    setRating(val);
  });

  const submitReview = async () => {
    if (!reviewBody.trim() || !user) return;
    setSubmitting(true);
    await supabase.from('reviews').upsert({
      user_id: user.id, tmdb_id: tmdbId, media_type: mediaType,
      title: reviewTitle || null, body: reviewBody, contains_spoilers: spoiler,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,tmdb_id' });
    setSubmitting(false);
    setShowReview(false);
  };

  const toggleWatchlist = async (wlId: string) => {
    if (!user) return;
    if (inWatchlists.has(wlId)) {
      await supabase.from('watchlist_items').delete().eq('watchlist_id', wlId).eq('tmdb_id', tmdbId);
      setInWatchlists(prev => { const s = new Set(prev); s.delete(wlId); return s; });
    } else {
      await supabase.from('watchlist_items').insert({ watchlist_id: wlId, tmdb_id: tmdbId, media_type: mediaType });
      setInWatchlists(prev => new Set([...prev, wlId]));
    }
  };

  const createList = async () => {
    if (!newListName.trim() || !user) return;
    const { data } = await supabase.from('watchlists').insert({
      user_id: user.id, name: newListName.trim(), is_public: true
    }).select().single();
    if (data) {
      setWatchlists(prev => [...prev, data]);
      setNewListName('');
    }
  };

  const iconStyle = (active: boolean) => ({
    color: active ? '#e2d9c8' : '#444',
    transition: 'color 0.2s',
  });

  return (
    <div className="border-t border-[#1a1a1a] mt-4">
      {/* Main actions row */}
      <div className="flex items-center justify-around py-4">
        {[
          { label: 'watched', icon: '◎', active: watched, onClick: toggleWatched },
          { label: 'like', icon: '♥', active: liked, onClick: toggleLike },
          { label: 'watchlist', icon: '⊕', active: false, onClick: () => guard(() => setShowLists(!showLists)) },
          { label: 'review', icon: '✎', active: showReview, onClick: () => guard(() => setShowReview(!showReview)) },
        ].map(({ label, icon, active, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex flex-col items-center gap-1 group"
          >
            <span className="text-[18px] transition-all duration-200 group-hover:scale-110" style={iconStyle(active)}>
              {icon}
            </span>
            <span className="text-[8px] tracking-[0.15em] uppercase" style={{ color: active ? '#888' : '#333' }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Star rating */}
      <div className="px-4 pb-3 flex flex-col items-center gap-1">
        <div className="text-[9px] tracking-[0.2em] uppercase text-neutral-700 mb-1">rate</div>
        <StarRating value={rating} onChange={handleRating} />
      </div>

      {/* Watchlists panel */}
      {showLists && (
        <div className="px-4 pb-4 border-t border-[#1a1a1a] pt-3">
          <div className="text-[9px] tracking-[0.2em] uppercase text-neutral-600 mb-3">add to list</div>
          {watchlists.length === 0 && (
            <div className="text-[10px] text-neutral-700 mb-3">no lists yet</div>
          )}
          {watchlists.map(wl => (
            <button
              key={wl.id}
              onClick={() => toggleWatchlist(wl.id)}
              className="flex items-center gap-2 w-full py-1 text-left"
            >
              <span className="text-[14px]" style={{ color: inWatchlists.has(wl.id) ? '#e2d9c8' : '#333' }}>
                {inWatchlists.has(wl.id) ? '◼' : '◻'}
              </span>
              <span className="text-[11px] tracking-wide" style={{ color: inWatchlists.has(wl.id) ? '#e2d9c8' : '#555' }}>
                {wl.name}
              </span>
            </button>
          ))}
          <div className="flex gap-2 mt-3">
            <input
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              placeholder="new list name..."
              className="flex-1 bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[10px] py-1 outline-none focus:border-neutral-600"
              onKeyDown={e => { if (e.key === 'Enter') createList(); }}
            />
            <button onClick={createList} className="text-[10px] text-neutral-600 hover:text-[#e2d9c8] tracking-widest transition-colors">
              + create
            </button>
          </div>
        </div>
      )}

      {/* Review panel */}
      {showReview && (
        <div className="px-4 pb-4 border-t border-[#1a1a1a] pt-3">
          <div className="text-[9px] tracking-[0.2em] uppercase text-neutral-600 mb-3">
            review — {getTitle(movie)}
          </div>
          <input
            value={reviewTitle}
            onChange={e => setReviewTitle(e.target.value)}
            placeholder="title (optional)"
            className="w-full bg-transparent border-b border-[#1e1e1e] text-[#e2d9c8] font-mono text-[11px] py-1 outline-none focus:border-neutral-600 mb-3"
          />
          <textarea
            value={reviewBody}
            onChange={e => setReviewBody(e.target.value)}
            placeholder="your thoughts..."
            rows={4}
            className="w-full bg-[#0a0a0a] border border-[#1e1e1e] text-[#e2d9c8] font-mono text-[11px] p-3 outline-none focus:border-neutral-700 rounded-sm resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)}
                className="accent-neutral-600" />
              <span className="text-[9px] tracking-widest text-neutral-600 uppercase">contains spoilers</span>
            </label>
            <button
              onClick={submitReview}
              disabled={!reviewBody.trim() || submitting}
              className="text-[9px] tracking-[0.2em] uppercase px-4 py-2 border border-[#333] text-[#e2d9c8] rounded-sm hover:border-neutral-500 transition-all disabled:opacity-30"
            >
              {submitting ? 'saving...' : 'save review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
