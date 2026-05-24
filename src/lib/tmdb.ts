export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p';
export const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

export interface Movie {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_type?: string;
  dominantColor?: string;
  palette?: string[];
}

export interface Genre {
  id: number;
  name: string;
}

export async function fetchDiscover(
  type: 'movie' | 'tv',
  sort: string,
  page = 1
): Promise<Movie[]> {
  const url = `${TMDB_BASE}/discover/${type}?api_key=${API_KEY}&sort_by=${sort}&vote_count.gte=100&page=${page}&include_adult=false`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  const data = await res.json();
  return (data.results || []).filter((m: Movie) => m.poster_path);
}

export async function fetchGenres(type: 'movie' | 'tv'): Promise<Genre[]> {
  const url = `${TMDB_BASE}/genre/${type}/list?api_key=${API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  const data = await res.json();
  return data.genres || [];
}

export async function fetchMovieDetail(id: number, type: 'movie' | 'tv') {
  const url = `${TMDB_BASE}/${type}/${id}?api_key=${API_KEY}&append_to_response=credits`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  return res.json();
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const url = `${TMDB_BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).filter(
    (m: Movie) => m.poster_path && (m.media_type === 'movie' || m.media_type === 'tv')
  );
}

export function posterUrl(path: string, size: 'w185' | 'w342' | 'w500' | 'original' = 'w342') {
  return `${TMDB_IMG}/${size}${path}`;
}

export function getTitle(movie: Movie): string {
  return movie.title || movie.name || 'Untitled';
}

export function getYear(movie: Movie): string {
  return (movie.release_date || movie.first_air_date || '').slice(0, 4);
}
