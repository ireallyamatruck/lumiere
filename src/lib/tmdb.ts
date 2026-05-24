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
  colorHue?: number;
  colorSat?: number;
  colorLit?: number;
  // Cinema theme (from backdrop)
  cinemaColor?: string;
  cinemaPalette?: string[];
  cinemaHue?: number;
  cinemaSat?: number;
  cinemaLit?: number;
}

export interface Genre {
  id: number;
  name: string;
}

async function fetchPage(type: 'movie' | 'tv', sort: string, page: number): Promise<Movie[]> {
  const url = `${TMDB_BASE}/discover/${type}?api_key=${API_KEY}&sort_by=${sort}&vote_count.gte=50&page=${page}&include_adult=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).filter((m: Movie) => m.poster_path);
  } catch {
    return [];
  }
}

// Fetch initial batch fast (50 pages = ~1000 films)
export async function fetchDiscover(
  type: 'movie' | 'tv',
  sort: string,
  pages = 50
): Promise<Movie[]> {
  const CHUNK = 10; // 10 parallel requests at a time
  const all: Movie[] = [];
  const seen = new Set<number>();

  for (let start = 1; start <= pages; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, pages);
    const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const results = await Promise.all(pageNums.map(p => fetchPage(type, sort, p)));
    results.flat().forEach(m => {
      if (!seen.has(m.id)) { seen.add(m.id); all.push(m); }
    });
  }
  return all;
}

// Background loader — calls onBatch each chunk so UI updates progressively
export async function fetchMorePages(
  type: 'movie' | 'tv',
  sort: string,
  fromPage: number,
  toPage: number,
  existingIds: Set<number>,
  onBatch: (movies: Movie[]) => void
): Promise<void> {
  const CHUNK = 10;
  for (let start = fromPage; start <= toPage; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, toPage);
    const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const results = await Promise.all(pageNums.map(p => fetchPage(type, sort, p)));
    const batch = results.flat().filter(m => !existingIds.has(m.id));
    batch.forEach(m => existingIds.add(m.id));
    if (batch.length > 0) onBatch(batch);
    // Small pause to avoid rate limiting
    await new Promise(r => setTimeout(r, 250));
  }
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

export function backdropUrl(path: string, size: 'w300' | 'w780' | 'w1280' = 'w300') {
  return `${TMDB_IMG}/${size}${path}`;
}

export function getTitle(movie: Movie): string {
  return movie.title || movie.name || 'Untitled';
}

export function getYear(movie: Movie): string {
  return (movie.release_date || movie.first_air_date || '').slice(0, 4);
}