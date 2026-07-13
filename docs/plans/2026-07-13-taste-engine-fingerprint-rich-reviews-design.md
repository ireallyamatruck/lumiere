# lumière — Taste Engine, Colour Fingerprint & Rich-Media Reviews

**Date:** 2026-07-13
**Status:** Approved — ready for task-planning
**Decisions locked:**
- Build all three features, sequenced: recommendation engine → fingerprint → rich-media reviews.
- Recommendation architecture: **A core + C layer** — deterministic colour+genre scoring now, Claude re-ranking / fingerprint prose layered on as Feature 2.

---

## Motivation

The pitch's three headline differentiators are unbuilt. Today: cosmos is a static hue-ordered map, `moviedive` only does per-film "similar" (pull), reviews are text-only, and nothing models a user's taste. This design closes that gap with one shared data model.

**Push vs pull:** Netflix-style "pull" recommends films most *similar* to what you watched. lumière does YouTube-style "push" — high taste-fit films that *expand* taste, driven by a novelty term + diversity re-rank, so the feed surfaces films the user would never find themselves.

---

## Shared foundation: the taste vector

All three features read from one derivation. For a user, join their signals (`watched`, `likes`, `ratings`) to each film's colour (`color_hue/sat/lit`) and `genre_ids` (already present in the blob cache / `movies_cache`). Compute:

- **Colour centroid** — weighted mean of films' HSL. *Hue is circular* → mean uses vector (sin/cos) averaging, not arithmetic. Weights: liked or 4–5★ films weighted higher; recent watches decay-weighted so taste tracks recent direction.
- **Genre affinity** — normalized, weighted histogram over `genre_ids`.
- **Era skew** — decade histogram (used by fingerprint prose).
- **k=5 colour clusters** — k-means over the user's films' HSL, for the fingerprint palette band.

Implementation: `src/lib/taste.ts` — pure functions, unit-tested:
- `circularMeanHue(hues, weights)` — sin/cos vector mean.
- `hslDistance(a, b)` — hue wraparound handled.
- `buildTasteVector(films)` → `{ centroid, genreAffinity, eraSkew, clusters }`.
- `scoreCandidate(film, tasteVector, recentWatches)` → number.
- `mmrRerank(scored, lambda)` → diversified list.

No side effects — trivially testable.

---

## Feature 1 — Recommendation engine (deterministic core)

**Route:** `GET /api/recommendations` (user derived from session; falls back to `?userId=`).

1. Read user signals from Supabase.
2. Load ~10k candidate pool from blob cache.
3. Score every **unwatched** film:
   ```
   score = w_colour·colourFit + w_genre·genreFit + w_novelty·noveltyBoost
   ```
   - `colourFit` — proximity to colour centroid (circular hue distance).
   - `genreFit` — overlap with genre affinity.
   - `noveltyBoost` — **the push signal**: penalizes films too close to specific recent watches; dampens extreme popularity; rewards mid-popularity films in taste-adjacent regions.
4. **MMR diversity re-rank** so the feed isn't 20 near-identical films.
5. **Cold start** (<5 films watched): popularity + colour-diversity sampler ("explore mode").
6. Cache per-user (short TTL); invalidate on new watch/like/rating.

Default weights (tunable): `w_colour=0.45, w_genre=0.35, w_novelty=0.20`, `mmr_lambda=0.7`, `recencyHalfLife=30 films`.

**Surface:** a "For You" mode — ranked strip + highlighting inside existing `CosmosView`, so recommendations live in the cosmos per the pitch.

---

## Feature 2 — Colour fingerprint (Claude "C" layer)

At a configurable threshold (default 50 films), reusing the same taste vector:

- **Visual** — palette band from k=5 colour clusters. Pure client render, no cost.
- **Prose** — `POST /api/fingerprint` sends the **structured taste summary only** (top genres, named colour clusters, era skew, top directors, a few notable films — never raw tables) to Claude (`@anthropic-ai/sdk`, `claude-haiku-4-5` default, sonnet optional). Returns 2–3 sentences.
- **Storage** — new `taste_profiles` table (`user_id`, `palette jsonb`, `prose text`, `film_count_at_gen`, `generated_at`). Regenerated when film count grows ≥10 or on demand. Shown on public profile.
- **Re-rank** — same Claude layer optionally re-ranks recommendation top-N + adds a one-line "why you'd love this." Aggressively cached.

---

## Feature 3 — Rich-media reviews

- **Schema** — add `media jsonb` to `reviews`: `[{url, type:'image'|'video'|'gif', w, h}]`.
- **Storage** — Supabase Storage bucket `review-media` (public read, authenticated write via RLS). Client uploads directly via supabase-js; validation (images ≤5MB, video ≤25MB, type allowlist); preview thumbnails in `FilmActions` review form.
- **Render** — image grid / inline video / gif in review cards (`MovieModal` + profile reviews).
- Basic client validation now; Claude-vision moderation as a later hook.

---

## Cross-cutting

- **Env:** `ANTHROPIC_API_KEY` (new). Everything else reuses existing keys.
- **Security:** RLS on `taste_profiles`; storage bucket policies; file type/size validation; Claude only ever receives aggregated summaries, never other users' raw data.
- **Migrations:** (1) `taste_profiles` table; (2) `reviews.media` column + `review-media` bucket. SQL provided for the user to run in Supabase.
- **Testing:** unit tests on `taste.ts` math (the risky part); manual preview verification for UI surfaces.

## Build order

1. **Phase 1** — `taste.ts` + `/api/recommendations` + For-You cosmos surface.
2. **Phase 2** — `taste_profiles` + `/api/fingerprint` + Claude re-rank + profile fingerprint.
3. **Phase 3** — media schema/bucket + upload UI + render.
