'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Movie, posterUrl, getTitle, getYear } from '@/lib/tmdb';
import { supabase, Review } from '@/lib/supabase';
import FilmActions from './FilmActions';

interface Props {
  movie: Movie | null;
  genres: Record<number, string>;
  onClose: () => void;
  onAuthRequired: () => void;
}

export default function MovieModal({ movie, genres, onClose, onAuthRequired }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const { user } = require('@/context/AuthContext').useAuth();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = movie ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [movie]);

  useEffect(() => {
    if (!movie) return;
    supabase
      .from('reviews')
      .select('*, profiles(username, display_name, avatar_url)')
      .eq('tmdb_id', movie.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setReviews(data || []));
  }, [movie?.id]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col md:flex-row w-full max-w-[640px] my-8 animate-fade-up"
        style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: '6px', opacity: 0 }}
      >
        {/* Poster */}
        {movie.poster_path && (
          <div className="relative w-full md:w-[200px] flex-shrink-0" style={{ aspectRatio: '2/3', minHeight: '200px' }}>
            <Image src={posterUrl(movie.poster_path, 'w342')} alt={title} fill className="object-cover rounded-tl-md rounded-bl-md" unoptimized />
            {movie.dominantColor && (
              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-bl-md" style={{ background: movie.dominantColor, opacity: 0.8 }} />
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-col flex-1 overflow-y-auto max-h-[85vh]">
          <div className="p-6">
            <div className="font-display text-[26px] font-light leading-tight text-[#e2d9c8] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              {title}
            </div>
            <div className="text-[11px] text-neutral-600 tracking-[0.15em] mb-4 flex items-center gap-3">
              <span>{year}</span>
              {movie.vote_average > 0 && <><span className="text-neutral-800">·</span><span>{movie.vote_average.toFixed(1)} imdb</span></>}
            </div>

            {movieGenres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {movieGenres.map(g => (
                  <span key={g} className="text-[9px] tracking-[0.15em] uppercase border border-[#222] text-neutral-600 px-2 py-[3px] rounded-sm">{g}</span>
                ))}
              </div>
            )}

            {palette.length > 0 && (
              <div className="flex gap-1 mb-4">
                {palette.map((c, i) => <div key={i} className="h-[12px] flex-1 rounded-sm" style={{ background: c }} />)}
              </div>
            )}

            {movie.overview && (
              <p className="font-display font-light text-[14px] leading-relaxed text-neutral-500 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {movie.overview}
              </p>
            )}
          </div>

          {/* Film actions */}
          <FilmActions movie={movie} onAuthRequired={onAuthRequired} />

          {/* Reviews section */}
          {reviews.length > 0 && (
            <div className="px-6 pb-6 border-t border-[#1a1a1a] pt-4">
              <div className="text-[9px] tracking-[0.25em] uppercase text-neutral-600 mb-4">reviews</div>
              {reviews.map(review => (
                <ReviewCard
                  key={review.id}
                  review={review}
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
            <button onClick={onClose} className="text-[9px] tracking-[0.2em] uppercase border border-[#2a2a2a] text-neutral-600 px-4 py-2 rounded-sm hover:border-neutral-600 hover:text-[#e2d9c8] transition-all duration-200">
              close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review, commentValue, onCommentChange, onCommentSubmit, submitting, user, onAuthRequired }:
  { review: Review; commentValue: string; onCommentChange: (v: string) => void; onCommentSubmit: () => void; submitting: boolean; user: any; onAuthRequired: () => void }) {
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
    <div className="mb-5 pb-5 border-b border-[#111] last:border-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-[#1e1e1e] flex items-center justify-center text-[9px] text-neutral-500">
          {review.profiles?.username?.[0]?.toUpperCase()}
        </div>
        <span className="text-[10px] text-neutral-500 tracking-wide">{review.profiles?.username}</span>
        {review.contains_spoilers && (
          <span className="text-[8px] tracking-widest uppercase border border-[#333] text-neutral-700 px-1 py-[1px]">spoiler</span>
        )}
      </div>
      {review.title && (
        <div className="font-display text-[15px] font-light text-[#e2d9c8] mb-1" style={{ fontFamily: 'var(--font-display)' }}>{review.title}</div>
      )}
      <p className="text-[12px] text-neutral-500 leading-relaxed font-display font-light" style={{ fontFamily: 'var(--font-display)' }}>{review.body}</p>

      <button onClick={loadComments} className="mt-2 text-[9px] tracking-widest text-neutral-700 hover:text-neutral-500 transition-colors uppercase">
        {showComments ? 'hide comments' : 'comments'}
      </button>

      {showComments && (
        <div className="mt-3 pl-3 border-l border-[#1e1e1e]">
          {comments.map(c => (
            <div key={c.id} className="mb-2">
              <span className="text-[9px] text-neutral-600 tracking-wide">{c.profiles?.username} · </span>
              <span className="text-[11px] text-neutral-500">{c.body}</span>
            </div>
          ))}
          {user ? (
            <div className="flex gap-2 mt-2">
              <input
                value={commentValue}
                onChange={e => onCommentChange(e.target.value)}
                placeholder="add a comment..."
                className="flex-1 bg-transparent border-b border-[#1e1e1e] text-[#e2d9c8] font-mono text-[10px] py-1 outline-none focus:border-neutral-700"
                onKeyDown={e => { if (e.key === 'Enter') onCommentSubmit(); }}
              />
              <button onClick={onCommentSubmit} disabled={submitting} className="text-[9px] text-neutral-600 hover:text-[#e2d9c8] tracking-widest transition-colors">
                {submitting ? '...' : 'post'}
              </button>
            </div>
          ) : (
            <button onClick={onAuthRequired} className="mt-2 text-[9px] text-neutral-700 hover:text-neutral-500 tracking-wide transition-colors">sign in to comment</button>
          )}
        </div>
      )}
    </div>
  );
}
