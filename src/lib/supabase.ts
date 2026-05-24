import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Review = {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: string;
  title: string | null;
  body: string;
  contains_spoilers: boolean;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
};

export type ReviewComment = {
  id: string;
  review_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: Profile;
};

export type Watchlist = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
};

export type WatchlistItem = {
  id: string;
  watchlist_id: string;
  tmdb_id: number;
  media_type: string;
  added_at: string;
};
