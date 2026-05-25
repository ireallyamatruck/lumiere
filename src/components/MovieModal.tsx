'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Movie, posterUrl, getTitle, getYear } from '@/lib/tmdb';
import { supabase, Review } from '@/lib/supabase';
import FilmActions from './FilmActions';
import { useAuth } from '@/context/AuthContext';

interface Props {
  movie: Movie | null;
  genres: Record<number, string>;
  onClose: () => void;
  onAuthRequired: () => void;
  readOnly?: boolean;
}

export default function MovieModal({ movie, genres, onClose, onAuthRequired, readOnly }: Props) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewLikes, setReviewLikes] = useState<Record<string, number>>({});
  const [userLikedReviews, setUserLikedReviews] = useState<Set<string>>(new Set());
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [rtRating, setRtRating] = useState<string | null>(null);
  const [showReviews, setShowReviews] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = movie ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [movie]);

  const fetchReviews = async (movieId: number) => {
    const { data } = await supabase
      .from('reviews')
      .select('*, profiles(username, display_name, avatar_url)')
      .eq('tmdb_id', movieId)
      .order('created_at', { ascending: false });
    const revs = data || [];
    setReviews(revs);
    if (revs.length === 0) return;
    const ids = revs.map((r: any) => r.id);
    const { data: likes } = await supabase.from('review_likes').select('review_id').in('review_id', ids);
    const counts: Record<string, number> = {};
    (likes || []).forEach((l: any) => { counts[l.review_id] = (counts[l.review_id] || 0) + 1; });
    setReviewLikes(counts);
    if (user) {
      const { data: myLikes } = await supabase.from('review_likes').select('review_id').in('review_id', ids).eq('user_id', user.id);
      setUserLikedReviews(new Set((myLikes || []).map((l: any) => l.review_id)));
    }
  };

  useEffect(() => {
    if (!movie) { setReviews([]); setRtRating(null); setShowReviews(false); return; }
    fetchReviews(movie.id);
    const type = movie.title ? 'movie' : 'tv';
    fetch(`/api/ratings?tmdb_id=${movie.id}&type=${type}`)
      .then(r => r.json()).then(d => { if (d.rt) setRtRating(d.rt); }).catch(() => {});
  }, [movie?.id, user?.id]);

  const toggleReviewLike = async (reviewId: string) => {
    if (!user) { onAuthRequired(); return; }
    const isLiked = userLikedReviews.has(reviewId);
    if (isLiked) {
      await supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', user.id);
      setUserLikedReviews(prev => { const s = new Set(prev); s.delete(reviewId); return s; });
      setReviewLikes(prev => ({ ...prev, [reviewId]: Math.max(0, (prev[reviewId] || 1) - 1) }));
    } else {
      await supabase.from('review_likes').insert({ review_id: reviewId, user_id: user.id });
      setUserLikedReviews(prev => new Set([...prev, reviewId]));
      setReviewLikes(prev => ({ ...prev, [reviewId]: (prev[reviewId] || 0) + 1 }));
    }
  };

  const submitComment = async (reviewId: string) => {
    if (!user || !reviewComment[reviewId]?.trim()) return;
    setSubmittingComment(reviewId);
    await supabase.from('review_comments').insert({
      review_id: reviewId, user_id: user.id, body: reviewComment[reviewId].trim()
    });
    setReviewComment(prev => ({ ...prev, [reviewId]: '' }));
    setSubmittingComment(null);
  };

  if (!movie) return null;

  const title = getTitle(movie);
  const year = getYear(movie);
  const movieGenres = (movie.genre_ids || []).map(id => genres[id]).filter(Boolean);
  const palette = movie.palette || [];

  // Sort reviews: own first, then by like count
  const sortedReviews = [...reviews].sort((a: any, b: any) => {
    if (a.user_id === user?.id) return -1;
    if (b.user_id === user?.id) return 1;
    return (reviewLikes[b.id] || 0) - (reviewLikes[a.id] || 0);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col md:flex-row w-full max-w-[640px] my-8 animate-fade-up"
        style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '6px', opacity: 0 }}
      >
        {/* Poster */}
        {movie.poster_path && (
          <div className="relative w-full md:w-[200px] flex-shrink-0" style={{ aspectRatio: '2/3', minHeight: '200px' }}>
            <Image src={posterUrl(movie.poster_path, 'w342')} alt={title} fill className="object-cover rounded-tl-md rounded-bl-md" unoptimized />
            {movie.dominantColor && (
              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-bl-md" style={{ background: movie.dominantColor, opacity: 0.9 }} />
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-col flex-1 overflow-y-auto" style={{ maxHeight: '85vh' }}>
          <div className="p-6">
            {/* Title */}
            <div className="font-display font-light leading-tight mb-2"
              style={{ fontFamily: 'var(--font-display)', fontSize: '30px', color: '#f5f0e8' }}>
              {title}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mb-4" style={{ fontSize: '13px', color: '#999', letterSpacing: '0.1em', flexWrap: 'wrap' }}>
              <span>{year}</span>
              {movie.vote_average > 0 && (
                <>
                  <span style={{ color: '#444' }}>·</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ background: '#F5C518', color: '#000', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '2px', letterSpacing: '0.03em', lineHeight: '14px' }}>IMDb</span>
                    <span style={{ color: '#ccc' }}>{movie.vote_average.toFixed(1)}</span>
                  </span>
                </>
              )}
              {rtRating && (
                <>
                  <span style={{ color: '#444' }}>·</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ background: '#FA320A', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '2px', letterSpacing: '0.03em', lineHeight: '14px' }}>RT</span>
                    <span style={{ color: '#ccc' }}>{rtRating}</span>
                  </span>
                </>
              )}
            </div>

            {/* Genres */}
            {movieGenres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {movieGenres.map(g => (
                  <span key={g}
                    style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', border: '1px solid #333', color: '#bbb', padding: '3px 8px', borderRadius: '2px' }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Palette */}
            {palette.length > 0 && (
              <div className="flex gap-1 mb-4">
                {palette.map((c, i) => <div key={i} className="h-[14px] flex-1 rounded-sm" style={{ background: c }} />)}
              </div>
            )}

            {/* Overview */}
            {movie.overview && (
              <p className="font-display font-light leading-relaxed mb-2"
                style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: '#bbb' }}>
                {movie.overview}
              </p>
            )}
          </div>

          {/* Film actions */}
          {!readOnly && <FilmActions movie={movie} onAuthRequired={onAuthRequired} onReviewSubmit={() => fetchReviews(movie.id)} />}

          {/* View Reviews toggle */}
          {!readOnly && (
            <div className="px-6 pb-2">
              <button
                onClick={() => { const next = !showReviews; setShowReviews(next); if (next) fetchReviews(movie.id); }}
                style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: showReviews ? '#e2d9c8' : '#444', background: 'none', border: '1px solid #1e1e1e', borderRadius: '3px', padding: '7px 16px', cursor: 'pointer', transition: 'all 0.2s', width: '100%' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#e2d9c8'; }}
                onMouseLeave={e => { if (!showReviews) { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.color = '#444'; } }}
              >
                {showReviews ? 'hide reviews' : `view reviews${reviews.length > 0 ? ` · ${reviews.length}` : ''}`}
              </button>
            </div>
          )}

          {/* Reviews section */}
          {(showReviews || readOnly) && sortedReviews.length > 0 && (
            <div className="px-6 pb-6 border-t pt-4" style={{ borderColor: '#1a1a1a' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#555', marginBottom: '16px' }}>
                reviews
              </div>
              {sortedReviews.map((review: any) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  isOwn={review.user_id === user?.id}
                  likeCount={reviewLikes[review.id] || 0}
                  liked={userLikedReviews.has(review.id)}
                  onLike={() => toggleReviewLike(review.id)}
                  commentValue={reviewComment[review.id] || ''}
                  onCommentChange={v => setReviewComment(prev => ({ ...prev, [review.id]: v }))}
                  onCommentSubmit={() => submitComment(review.id)}
                  submitting={submittingComment === review.id}
                  user={user}
                  onAuthRequired={onAuthRequired}
                />
              ))}
            </div>
          )}

          <div className="px-6 pb-5">
            <button onClick={onClose}
              style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid #333', color: '#aaa', padding: '8px 16px', borderRadius: '3px', background: 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = '#f5f0e8'; (e.target as HTMLButtonElement).style.borderColor = '#666'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = '#aaa'; (e.target as HTMLButtonElement).style.borderColor = '#333'; }}
            >
              close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review, isOwn, likeCount, liked, onLike, commentValue, onCommentChange, onCommentSubmit, submitting, user, onAuthRequired }:
  { review: any; isOwn: boolean; likeCount: number; liked: boolean; onLike: () => void; commentValue: string; onCommentChange: (v: string) => void; onCommentSubmit: () => void; submitting: boolean; user: any; onAuthRequired: () => void }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);

  const loadComments = async () => {
    if (showComments) { setShowComments(false); return; }
    const { data } = await supabase.from('review_comments')
      .select('*, profiles(username)')
      .eq('review_id', review.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
    setShowComments(true);
  };

  return (
    <div className="mb-5 pb-5 border-b last:border-0" style={{ borderColor: '#1a1a1a' }}>
      <div className="flex items-center gap-2 mb-2">
        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#888' }}>
          {review.profiles?.username?.[0]?.toUpperCase()}
        </div>
        <span style={{ fontSize: '12px', color: isOwn ? '#e2d9c8' : '#aaa', letterSpacing: '0.05em' }}>{review.profiles?.username}</span>
        {isOwn && <span style={{ fontSize: '9px', color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>you</span>}
        {review.contains_spoilers && (
          <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid #333', color: '#666', padding: '1px 5px' }}>spoiler</span>
        )}
      </div>
      {review.title && (
        <div className="font-display font-light mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: '#e8e0d0' }}>{review.title}</div>
      )}
      <p className="font-display font-light leading-relaxed" style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: '#bbb' }}>{review.body}</p>

      {/* Like + comments row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '10px' }}>
        <button onClick={onLike}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: liked ? '#e2d9c8' : '#444', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s', letterSpacing: '0.1em' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2d9c8'; }}
          onMouseLeave={e => { if (!liked) e.currentTarget.style.color = '#444'; }}>
          <span style={{ fontSize: '13px' }}>{liked ? '♥' : '♡'}</span>
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button onClick={loadComments}
          style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#444', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
          onMouseLeave={e => (e.currentTarget.style.color = '#444')}>
          {showComments ? 'hide' : 'comments'}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 pl-3" style={{ borderLeft: '1px solid #1e1e1e' }}>
          {comments.map(c => (
            <div key={c.id} className="mb-2">
              <span style={{ fontSize: '11px', color: '#777' }}>{c.profiles?.username} · </span>
              <span style={{ fontSize: '12px', color: '#bbb' }}>{c.body}</span>
            </div>
          ))}
          {user ? (
            <div className="flex gap-2 mt-2">
              <input
                value={commentValue}
                onChange={e => onCommentChange(e.target.value)}
                placeholder="add a comment..."
                style={{ flex: 1, background: 'transparent', borderBottom: '1px solid #222', color: '#e2d9c8', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 0', outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter') onCommentSubmit(); }}
              />
              <button onClick={onCommentSubmit} disabled={submitting}
                style={{ fontSize: '10px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}>
                {submitting ? '...' : 'post'}
              </button>
            </div>
          ) : (
            <button onClick={onAuthRequired} style={{ marginTop: '8px', fontSize: '10px', color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>
              sign in to comment
            </button>
          )}
        </div>
      )}
    </div>
  );
}
