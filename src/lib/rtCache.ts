// Shared module-level cache: tmdb_id → RT rating string (e.g. "94%") or null if fetched but absent.
// Written by MovieModal when a rating loads; read by PosterCard on hover re-render.
const rtCache = new Map<number, string | null>();
export default rtCache;
