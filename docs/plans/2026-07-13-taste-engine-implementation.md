# Taste Engine, Colour Fingerprint & Rich-Media Reviews — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Ship the three unbuilt pitch differentiators — a YouTube-style personalized recommender, a Claude-generated colour taste fingerprint, and rich-media (image/video/gif) reviews.

**Architecture:** One shared pure module `src/lib/taste.ts` derives a taste vector from the user's watched/liked/rated films joined to colour + genre data. Phase 1 scores recommendations **client-side** (the browser already holds `allMovies` with colour data). Phase 2 adds a server route calling Claude for the fingerprint prose (API key is server-only) and persists to a `taste_profiles` table. Phase 3 adds a `media jsonb` column + Supabase Storage bucket for rich reviews.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Supabase (Postgres + Storage + Auth), `@anthropic-ai/sdk` (new), `vitest` (new, dev), existing Vercel Blob movie cache.

**Design doc:** `docs/plans/2026-07-13-taste-engine-fingerprint-rich-reviews-design.md`

**Deviation from design (approved rationale):** design named `/api/recommendations`; plan computes recs client-side in Phase 1 because `allMovies` is already in the browser and signals are tiny — avoids a service-role read path and gives instant recompute. Server routes are introduced only where the Anthropic key forces them (Phase 2).

---

## Conventions for every task

- TDD where a pure function exists (`godmode:test-first`): write the failing test, run it red, implement, run it green, commit.
- UI/integration tasks have no unit test — they end with a **manual verification** via the preview server + a commit.
- Exact file paths in every step. Commit after every task.
- Match existing style: inline styles with the dark palette (`#070707` bg, `#e2d9c8`/`#f0ebe0` text, `#1e1e1e`/`#2a2a2a` borders), lowercase uppercase-tracked labels, `var(--font-mono)` / `var(--font-display)`.

---

# PHASE 0 — Test infrastructure

### Task 0: Add vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/smoke.test.ts`

**Step 1: Install vitest**

Run: `npm i -D vitest`
Expected: added to devDependencies, no errors.

**Step 2: Add test script**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

**Step 4: Smoke test**

`src/lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('vitest', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

**Step 5: Run**

Run: `npm test`
Expected: 1 passed.

**Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/__tests__/smoke.test.ts
git commit -m "test: add vitest test runner"
```

---

# PHASE 1 — Recommendation engine (deterministic, client-side)

### Task 1: Taste math primitives (`circularMeanHue`, `hueDistance`, `hslDistance`)

**Files:**
- Create: `src/lib/taste.ts`
- Create: `src/lib/taste.test.ts`

**Step 1: Failing tests** — `src/lib/taste.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { circularMeanHue, hueDistance, hslDistance } from './taste';

describe('hueDistance', () => {
  it('wraps around 360', () => { expect(hueDistance(350, 10)).toBe(20); });
  it('plain distance', () => { expect(hueDistance(30, 60)).toBe(30); });
  it('is symmetric', () => { expect(hueDistance(10, 350)).toBe(20); });
});

describe('circularMeanHue', () => {
  it('averages across the 0/360 seam', () => {
    const m = circularMeanHue([350, 10], [1, 1]);
    expect(Math.min(m, 360 - m)).toBeLessThan(1); // ~0
  });
  it('weights pull the mean', () => {
    const m = circularMeanHue([0, 90], [3, 1]);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(45);
  });
});

describe('hslDistance', () => {
  it('is 0 for identical', () => {
    expect(hslDistance({ h: 200, s: 50, l: 50 }, { h: 200, s: 50, l: 50 })).toBe(0);
  });
  it('grows with hue gap', () => {
    const near = hslDistance({ h: 200, s: 50, l: 50 }, { h: 210, s: 50, l: 50 });
    const far = hslDistance({ h: 200, s: 50, l: 50 }, { h: 20, s: 50, l: 50 });
    expect(far).toBeGreaterThan(near);
  });
});
```

**Step 2: Run red** — `npx vitest run src/lib/taste.test.ts` → FAIL (module not found).

**Step 3: Implement** — `src/lib/taste.ts`:
```ts
export interface Hsl { h: number; s: number; l: number }

/** Minimum circular distance between two hues in degrees, 0..180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Weighted circular mean of hues (degrees), returns 0..360. */
export function circularMeanHue(hues: number[], weights: number[]): number {
  let x = 0, y = 0;
  for (let i = 0; i < hues.length; i++) {
    const r = (hues[i] * Math.PI) / 180;
    x += Math.cos(r) * weights[i];
    y += Math.sin(r) * weights[i];
  }
  if (x === 0 && y === 0) return 0;
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Normalized 0..1 distance in HSL space (hue circular). */
export function hslDistance(a: Hsl, b: Hsl): number {
  const dh = hueDistance(a.h, b.h) / 180;        // 0..1
  const ds = Math.abs(a.s - b.s) / 100;          // 0..1
  const dl = Math.abs(a.l - b.l) / 100;          // 0..1
  return (dh * 0.6 + ds * 0.25 + dl * 0.15);
}
```

**Step 4: Run green** — `npx vitest run src/lib/taste.test.ts` → PASS.

**Step 5: Commit**
```bash
git add src/lib/taste.ts src/lib/taste.test.ts
git commit -m "feat(taste): circular hue distance, mean, and HSL distance"
```

---

### Task 2: `buildTasteVector`

**Files:**
- Modify: `src/lib/taste.ts`
- Modify: `src/lib/taste.test.ts`

**Step 1: Append failing tests:**
```ts
import { buildTasteVector, FilmSignal } from './taste';

const sig = (o: Partial<FilmSignal>): FilmSignal => ({
  id: 0, colorHue: 200, colorSat: 50, colorLit: 50, genre_ids: [18], weight: 1, ...o,
});

describe('buildTasteVector', () => {
  it('reports sample size', () => {
    const v = buildTasteVector([sig({ id: 1 }), sig({ id: 2 })]);
    expect(v.sampleSize).toBe(2);
  });
  it('centroid tracks the dominant colour', () => {
    const v = buildTasteVector([
      sig({ id: 1, colorHue: 210 }), sig({ id: 2, colorHue: 210 }), sig({ id: 3, colorHue: 30 }),
    ]);
    expect(hueDistance(v.hue, 210)).toBeLessThan(hueDistance(v.hue, 30));
  });
  it('normalizes genre affinity to <= 1', () => {
    const v = buildTasteVector([sig({ genre_ids: [18, 80] }), sig({ genre_ids: [18] })]);
    expect(v.genreAffinity[18]).toBeGreaterThan(v.genreAffinity[80]);
    expect(Math.max(...Object.values(v.genreAffinity))).toBeLessThanOrEqual(1);
  });
  it('skips films without colour', () => {
    const v = buildTasteVector([sig({ id: 1 }), sig({ id: 2, colorHue: undefined })]);
    expect(v.sampleSize).toBe(1);
  });
});
```

**Step 2: Run red** → FAIL.

**Step 3: Implement — append to `src/lib/taste.ts`:**
```ts
export interface FilmSignal {
  id: number;
  colorHue?: number;
  colorSat?: number;
  colorLit?: number;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  vote_count?: number;
  weight: number;
}

export interface TasteVector {
  hue: number;
  sat: number;
  lit: number;
  genreAffinity: Record<number, number>;
  eraSkew: Record<string, number>;
  sampleSize: number;
}

function decadeOf(s?: string): string | null {
  const y = parseInt((s || '').slice(0, 4));
  if (!y) return null;
  return `${Math.floor(y / 10) * 10}s`;
}

export function buildTasteVector(signals: FilmSignal[]): TasteVector {
  const films = signals.filter(f => f.colorHue !== undefined);
  const hues = films.map(f => f.colorHue!);
  const weights = films.map(f => f.weight);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;

  const hue = circularMeanHue(hues, weights);
  const sat = films.reduce((a, f) => a + (f.colorSat ?? 50) * f.weight, 0) / wSum;
  const lit = films.reduce((a, f) => a + (f.colorLit ?? 50) * f.weight, 0) / wSum;

  const genreRaw: Record<number, number> = {};
  const eraRaw: Record<string, number> = {};
  for (const f of films) {
    for (const g of f.genre_ids || []) genreRaw[g] = (genreRaw[g] || 0) + f.weight;
    const dec = decadeOf(f.release_date || f.first_air_date);
    if (dec) eraRaw[dec] = (eraRaw[dec] || 0) + f.weight;
  }
  const gMax = Math.max(1, ...Object.values(genreRaw));
  const genreAffinity: Record<number, number> = {};
  for (const [k, v] of Object.entries(genreRaw)) genreAffinity[+k] = v / gMax;

  const eMax = Math.max(1, ...Object.values(eraRaw));
  const eraSkew: Record<string, number> = {};
  for (const [k, v] of Object.entries(eraRaw)) eraSkew[k] = v / eMax;

  return { hue, sat, lit, genreAffinity, eraSkew, sampleSize: films.length };
}
```

**Step 4: Run green** → PASS.

**Step 5: Commit**
```bash
git add src/lib/taste.ts src/lib/taste.test.ts
git commit -m "feat(taste): buildTasteVector (colour centroid, genre affinity, era skew)"
```

---

### Task 3: `scoreCandidate` + `mmrRerank` (the push-not-pull logic)

**Files:**
- Modify: `src/lib/taste.ts`
- Modify: `src/lib/taste.test.ts`

**Step 1: Append failing tests:**
```ts
import { scoreCandidate, mmrRerank, CandidateFilm } from './taste';

const taste = buildTasteVector([
  sig({ id: 1, colorHue: 210, genre_ids: [18] }),
  sig({ id: 2, colorHue: 210, genre_ids: [18] }),
  sig({ id: 3, colorHue: 200, genre_ids: [18, 80] }),
]);

const cand = (o: Partial<CandidateFilm>): CandidateFilm => ({
  id: 0, colorHue: 210, colorSat: 50, colorLit: 50, genre_ids: [18], vote_count: 500, ...o,
});

describe('scoreCandidate', () => {
  it('scores colour-and-genre-aligned films higher', () => {
    const aligned = scoreCandidate(cand({ id: 10, colorHue: 210, genre_ids: [18] }), taste);
    const off = scoreCandidate(cand({ id: 11, colorHue: 40, genre_ids: [35] }), taste);
    expect(aligned).toBeGreaterThan(off);
  });
  it('novelty dampens mega-popular films (push not pull)', () => {
    const niche = scoreCandidate(cand({ id: 12, vote_count: 300 }), taste);
    const blockbuster = scoreCandidate(cand({ id: 13, vote_count: 30000 }), taste);
    expect(niche).toBeGreaterThan(blockbuster);
  });
});

describe('mmrRerank', () => {
  it('returns at most k and avoids near-duplicates up front', () => {
    const items = [
      { film: cand({ id: 1, colorHue: 210 }), score: 0.9 },
      { film: cand({ id: 2, colorHue: 211 }), score: 0.89 }, // near-dup of 1
      { film: cand({ id: 3, colorHue: 40 }),  score: 0.7 },
    ];
    const out = mmrRerank(items, 0.7, 2);
    expect(out).toHaveLength(2);
    expect(out.map(f => f.id)).toContain(1);
    expect(out.map(f => f.id)).toContain(3); // diversity beats the near-dup #2
  });
});
```

**Step 2: Run red** → FAIL.

**Step 3: Implement — append to `src/lib/taste.ts`:**
```ts
export interface CandidateFilm {
  id: number;
  colorHue?: number;
  colorSat?: number;
  colorLit?: number;
  genre_ids?: number[];
  vote_count?: number;
}

export const TASTE_WEIGHTS = { colour: 0.45, genre: 0.35, novelty: 0.20 };
const POP_CAP = 12000; // vote_count above this is treated as fully "mainstream"

export function scoreCandidate(film: CandidateFilm, taste: TasteVector): number {
  const hsl = { h: film.colorHue ?? 0, s: film.colorSat ?? 50, l: film.colorLit ?? 50 };
  const colourFit = 1 - hslDistance(hsl, { h: taste.hue, s: taste.sat, l: taste.lit });

  const gids = film.genre_ids || [];
  const genreFit = gids.length
    ? gids.reduce((a, g) => a + (taste.genreAffinity[g] || 0), 0) / gids.length
    : 0;

  const novelty = 1 - Math.min(1, (film.vote_count ?? 0) / POP_CAP);

  return TASTE_WEIGHTS.colour * colourFit
       + TASTE_WEIGHTS.genre * genreFit
       + TASTE_WEIGHTS.novelty * novelty;
}

/** Maximal Marginal Relevance: balance score against diversity to avoid a feed of look-alikes. */
export function mmrRerank(
  items: { film: CandidateFilm; score: number }[],
  lambda = 0.7,
  k = 60,
): CandidateFilm[] {
  const pool = [...items].sort((a, b) => b.score - a.score);
  const selected: { film: CandidateFilm; score: number }[] = [];
  const simTo = (a: CandidateFilm, b: CandidateFilm) =>
    1 - hslDistance(
      { h: a.colorHue ?? 0, s: a.colorSat ?? 50, l: a.colorLit ?? 50 },
      { h: b.colorHue ?? 0, s: b.colorSat ?? 50, l: b.colorLit ?? 50 },
    );

  while (selected.length < k && pool.length) {
    let bestIdx = 0, bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const maxSim = selected.length
        ? Math.max(...selected.map(s => simTo(pool[i].film, s.film)))
        : 0;
      const val = lambda * pool[i].score - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected.map(s => s.film);
}
```

**Step 4: Run green** — `npm test` → all taste tests PASS.

**Step 5: Commit**
```bash
git add src/lib/taste.ts src/lib/taste.test.ts
git commit -m "feat(taste): scoreCandidate + MMR rerank (push-not-pull recommendation core)"
```

---

### Task 4: `useRecommendations` hook

**Files:**
- Create: `src/hooks/useRecommendations.ts`

No unit test (side-effectful React hook + Supabase). Verified via the UI task that follows.

**Step 1: Implement** — `src/hooks/useRecommendations.ts`:
```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Movie } from '@/lib/tmdb';
import {
  buildTasteVector, scoreCandidate, mmrRerank, FilmSignal, TasteVector,
} from '@/lib/taste';

export type RecStatus = 'idle' | 'loading' | 'cold' | 'ready';
const MIN_SIGNALS = 5;

export function useRecommendations(allMovies: Movie[], enabled: boolean) {
  const { user } = useAuth();
  const [recs, setRecs] = useState<Movie[]>([]);
  const [taste, setTaste] = useState<TasteVector | null>(null);
  const [status, setStatus] = useState<RecStatus>('idle');
  const lastKey = useRef('');

  useEffect(() => {
    if (!enabled || !user || allMovies.length === 0) { setStatus('idle'); return; }
    const key = `${user.id}:${allMovies.length}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    (async () => {
      setStatus('loading');
      const [{ data: watched }, { data: likes }, { data: ratings }] = await Promise.all([
        supabase.from('watched').select('tmdb_id').eq('user_id', user.id),
        supabase.from('likes').select('tmdb_id').eq('user_id', user.id),
        supabase.from('ratings').select('tmdb_id, rating').eq('user_id', user.id),
      ]);

      const watchedIds = new Set((watched || []).map((w: any) => w.tmdb_id));
      const likedIds = new Set((likes || []).map((l: any) => l.tmdb_id));
      const ratingMap = new Map<number, number>((ratings || []).map((r: any) => [r.tmdb_id, r.rating]));
      const signalIds = new Set<number>([...watchedIds, ...likedIds, ...ratingMap.keys()]);

      if (signalIds.size < MIN_SIGNALS) {
        // Cold start: colour-diverse sampler over mid-popular films (explore mode).
        const seed = allMovies.filter(m => m.colorHue !== undefined);
        const sampled = mmrRerank(
          seed.map(m => ({ film: m as any, score: 1 - Math.min(1, (m.vote_count ?? 0) / 12000) })),
          0.5, 60,
        ) as unknown as Movie[];
        setRecs(sampled); setTaste(null); setStatus('cold');
        return;
      }

      const movieMap = new Map(allMovies.map(m => [m.id, m]));
      const signals: FilmSignal[] = [];
      for (const id of signalIds) {
        const m = movieMap.get(id);
        if (!m || m.colorHue === undefined) continue; // phase-1 approximation: skip unresolved films
        const rating = ratingMap.get(id);
        const weight = (likedIds.has(id) ? 2 : 1) * (rating ? rating / 3 : 1);
        signals.push({
          id, colorHue: m.colorHue, colorSat: m.colorSat, colorLit: m.colorLit,
          genre_ids: m.genre_ids, release_date: m.release_date, first_air_date: m.first_air_date,
          vote_count: m.vote_count, weight,
        });
      }

      if (signals.length < MIN_SIGNALS) { setStatus('cold'); setRecs([]); return; }

      const tasteVec = buildTasteVector(signals);
      const scored = allMovies
        .filter(m => !watchedIds.has(m.id) && m.colorHue !== undefined)
        .map(m => ({ film: m as any, score: scoreCandidate(m as any, tasteVec) }));
      const ranked = mmrRerank(scored, 0.7, 80) as unknown as Movie[];

      setTaste(tasteVec); setRecs(ranked); setStatus('ready');
    })();
  }, [enabled, user?.id, allMovies.length]);

  return { recs, status, taste };
}
```

**Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 3: Commit**
```bash
git add src/hooks/useRecommendations.ts
git commit -m "feat(recs): useRecommendations hook — client-side taste scoring + cold start"
```

---

### Task 5: "For You" view in the browse UI

**Files:**
- Modify: `src/app/page.tsx`

**Step 1:** Add import near the other imports (top of file):
```ts
import { useRecommendations } from '@/hooks/useRecommendations';
```

**Step 2:** Widen the view mode type (line 65):
```ts
type ViewMode = 'grid' | 'cosmos' | 'foryou';
```

**Step 3:** Inside `Home()`, after the existing hooks (e.g. after the `useRecommendations`-independent state near line 112), add:
```ts
const { recs, status: recStatus } = useRecommendations(allMovies, viewMode === 'foryou');
```

**Step 4:** Add the toggle button. In the view switcher (lines 433-441), change the array to include `'foryou'` and give it a friendly label:
```tsx
<div className="flex items-center gap-1 border border-[#1e1e1e] rounded-sm overflow-hidden">
  {(['grid', 'cosmos', 'foryou'] as ViewMode[]).map(v => (
    <button key={v} onClick={() => setViewMode(v)}
      className="text-[10px] tracking-[0.15em] uppercase px-3 py-[5px] transition-all duration-200"
      style={{ background: viewMode === v ? '#1a1a1a' : 'transparent', color: viewMode === v ? '#e2d9c8' : '#444' }}>
      {v === 'foryou' ? 'for you' : v}
    </button>
  ))}
</div>
```

**Step 5:** Add the render branch. Replace the `viewMode === 'cosmos' ? (...) : (...)` block (lines 610-634) with a three-way branch:
```tsx
{viewMode === 'cosmos' ? (
  <CosmosView movies={allMovies} onSelect={setSelected} activeHue={cosmosHue} />
) : viewMode === 'foryou' ? (
  <div className="px-8 py-6">
    {!user ? (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div style={{ fontSize: '12px', color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase' }}>sign in to get recommendations</div>
        <button onClick={() => setShowAuth(true)}
          style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid #2a2a2a', color: '#e2d9c8', padding: '7px 18px', borderRadius: '3px', background: 'transparent', cursor: 'pointer' }}>sign in</button>
      </div>
    ) : recStatus === 'loading' ? (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="skeleton rounded-sm" style={{ aspectRatio: '2/3', animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    ) : (
      <>
        <div style={{ fontSize: '10px', color: '#1e1e1e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '24px' }}>
          {recStatus === 'cold'
            ? 'watch or rate a few films to sharpen this · exploring for now'
            : `${recs.length} films chosen for your palette`}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {recs.map((movie, i) => (
            <PosterCard key={movie.id} movie={movie} index={i} onClick={setSelected} />
          ))}
        </div>
      </>
    )}
  </div>
) : (
  <div className="px-8 py-6">
    {/* ...existing grid branch unchanged... */}
  </div>
)}
```
(Keep the existing grid branch body exactly as-is inside the final `else`.)

**Step 6: Manual verification** (`godmode:completion-gate`)

Run: `npx tsc --noEmit` → no errors.
Then start preview (`preview_start` with the dev config; create `.claude/launch.json` with `npm run dev` on port 3000 if absent). In the preview:
- Sign in, mark ≥5 films watched/liked, switch to **for you** → a grid renders; console has no errors (`preview_console_logs`).
- New/anon account on **for you** → "sign in" or cold-start explore copy shows.
Capture a screenshot (`preview_screenshot`).

**Step 7: Commit**
```bash
git add src/app/page.tsx
git commit -m "feat(recs): 'for you' view — personalized grid with cold-start + signed-out states"
```

---

# PHASE 2 — Colour fingerprint (Claude layer)

### Task 6: `taste_profiles` table + SDK install

**Files:**
- Create: `docs/migrations/2026-07-13-taste-profiles.sql`
- Modify: `package.json`

**Step 1: Install SDK**

Run: `npm i @anthropic-ai/sdk`

**Step 2: Migration file** — `docs/migrations/2026-07-13-taste-profiles.sql`:
```sql
create table if not exists public.taste_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  palette jsonb default '[]'::jsonb,
  prose text,
  film_count_at_gen int default 0,
  generated_at timestamptz default now()
);
alter table public.taste_profiles enable row level security;
create policy "taste public read"  on public.taste_profiles for select using (true);
create policy "own taste insert"    on public.taste_profiles for insert with check (auth.uid() = user_id);
create policy "own taste update"    on public.taste_profiles for update using (auth.uid() = user_id);
```

**Step 3: USER ACTION** — print this instruction in the task-runner output (do not attempt to run it):
> Run `docs/migrations/2026-07-13-taste-profiles.sql` in Supabase → SQL Editor, and add `ANTHROPIC_API_KEY` to `.env.local` and Vercel env.

**Step 4: Commit**
```bash
git add docs/migrations/2026-07-13-taste-profiles.sql package.json package-lock.json
git commit -m "feat(fingerprint): taste_profiles migration + anthropic sdk"
```

---

### Task 7: `/api/fingerprint` route

**Files:**
- Create: `src/app/api/fingerprint/route.ts`

The client sends a **pre-aggregated, non-PII taste summary** (built from the same `taste.ts` data it already computes for recs). The route calls Claude and persists.

**Step 1: Implement** — `src/app/api/fingerprint/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 30;

interface Summary {
  userId: string;
  filmCount: number;
  topGenres: string[];      // e.g. ['Drama', 'Thriller']
  colourClusters: string[]; // named colours e.g. ['deep teal', 'burnt amber']
  eras: string[];           // e.g. ['1970s', '2010s']
  notableTitles: string[];
}

export async function POST(req: NextRequest) {
  const s = (await req.json()) as Summary;
  if (!s?.userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  // Serve cache unless the library grew by >= 10 films since last generation.
  const { data: existing } = await supabaseAdmin
    .from('taste_profiles').select('*').eq('user_id', s.userId).maybeSingle();
  if (existing?.prose && s.filmCount - (existing.film_count_at_gen ?? 0) < 10) {
    return NextResponse.json({ prose: existing.prose, palette: existing.palette, cached: true });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'no api key' }, { status: 503 });

  const prompt = `You are describing a film lover's aesthetic taste for their profile on a colour-first cinema app.
Write 2-3 sentences, second person ("You gravitate to..."), evocative but grounded — no clichés, no lists.
Data:
- Films logged: ${s.filmCount}
- Dominant palette: ${s.colourClusters.join(', ')}
- Top genres: ${s.topGenres.join(', ')}
- Era skew: ${s.eras.join(', ')}
- Notable films: ${s.notableTitles.join(', ')}`;

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 220,
    messages: [{ role: 'user', content: prompt }],
  });
  const prose = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();

  await supabaseAdmin.from('taste_profiles').upsert({
    user_id: s.userId,
    palette: s.colourClusters,
    prose,
    film_count_at_gen: s.filmCount,
    generated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return NextResponse.json({ prose, palette: s.colourClusters, cached: false });
}
```

**Step 2: Typecheck** — `npx tsc --noEmit` → no errors.

**Step 3: Commit**
```bash
git add src/app/api/fingerprint/route.ts
git commit -m "feat(fingerprint): /api/fingerprint route — Claude prose, cached in taste_profiles"
```

---

### Task 8: Colour-naming helper + summary builder

**Files:**
- Modify: `src/lib/taste.ts`
- Modify: `src/lib/taste.test.ts`

**Step 1: Failing tests:**
```ts
import { nameHue, GENRE_NAMES } from './taste';
describe('nameHue', () => {
  it('names by hue band', () => {
    expect(nameHue(0, 70, 50)).toContain('red');
    expect(nameHue(210, 70, 40)).toMatch(/blue|teal/);
  });
  it('greys low saturation', () => { expect(nameHue(210, 5, 50)).toContain('grey'); });
});
```

**Step 2: Run red** → FAIL.

**Step 3: Implement — append to `src/lib/taste.ts`:**
```ts
export const GENRE_NAMES: Record<number, string> = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',18:'Drama',
  14:'Fantasy',27:'Horror',9648:'Mystery',10749:'Romance',878:'Sci-Fi',53:'Thriller',
  37:'Western',10752:'War',36:'History',99:'Documentary',10402:'Music',10751:'Family',
};

export function nameHue(h: number, s: number, l: number): string {
  if (s < 12) return l > 66 ? 'pale grey' : l < 25 ? 'near-black' : 'muted grey';
  const tone = l < 32 ? 'deep ' : l > 68 ? 'pale ' : '';
  const bands: [number, string][] = [
    [15,'red'],[40,'amber'],[65,'gold'],[160,'green'],[195,'teal'],
    [255,'blue'],[290,'indigo'],[330,'violet'],[360,'red'],
  ];
  const base = bands.find(([max]) => h < max)?.[1] ?? 'red';
  return `${tone}${base}`.trim();
}

/** Build the non-PII summary the fingerprint route consumes. */
export function tasteSummary(
  taste: TasteVector,
  topClusterHsls: { h: number; s: number; l: number }[],
  notableTitles: string[],
): { topGenres: string[]; colourClusters: string[]; eras: string[]; notableTitles: string[]; filmCount: number } {
  const topGenres = Object.entries(taste.genreAffinity)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([g]) => GENRE_NAMES[+g] || `genre ${g}`);
  const eras = Object.entries(taste.eraSkew).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([e]) => e);
  const colourClusters = topClusterHsls.length
    ? topClusterHsls.map(c => nameHue(c.h, c.s, c.l))
    : [nameHue(taste.hue, taste.sat, taste.lit)];
  return { topGenres, colourClusters, eras, notableTitles: notableTitles.slice(0, 4), filmCount: taste.sampleSize };
}
```

**Step 4: Run green** — `npm test` → PASS.

**Step 5: Commit**
```bash
git add src/lib/taste.ts src/lib/taste.test.ts
git commit -m "feat(fingerprint): hue naming + non-PII taste summary builder"
```

---

### Task 9: Fingerprint UI on the profile pages

**Files:**
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/profile/[username]/page.tsx`
- Create: `src/components/FingerprintCard.tsx`

**Step 1: Component** — `src/components/FingerprintCard.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { nameHue } from '@/lib/taste';

// Renders a stored fingerprint (palette band + prose). Read-only; generation is triggered
// from the owner's own profile by page-level code that has the taste vector.
export default function FingerprintCard({ userId }: { userId: string }) {
  const [row, setRow] = useState<{ palette: string[]; prose: string } | null>(null);
  useEffect(() => {
    supabase.from('taste_profiles').select('palette, prose').eq('user_id', userId).maybeSingle()
      .then(({ data }) => data?.prose && setRow(data as any));
  }, [userId]);
  if (!row) return null;
  return (
    <div style={{ border: '1px solid #1a1a1a', borderRadius: '4px', padding: '18px', margin: '8px 0 20px' }}>
      <div style={{ fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#555', marginBottom: '12px' }}>colour fingerprint</div>
      <div style={{ display: 'flex', height: '10px', borderRadius: '2px', overflow: 'hidden', marginBottom: '14px' }}>
        {(row.palette || []).map((c, i) => (
          <div key={i} style={{ flex: 1, background: paletteColour(c) }} />
        ))}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '15px', lineHeight: 1.6, color: '#cfc6b4' }}>{row.prose}</div>
    </div>
  );
}

// Map a colour name back to a representative swatch for the band.
function paletteColour(name: string): string {
  const map: Record<string, string> = {
    red:'#b23b3b',amber:'#c07a2c',gold:'#c9a227',green:'#3f8f5a',teal:'#2f8f8f',
    blue:'#3a5fb0',indigo:'#4b3f9e',violet:'#7a4b9e','pale grey':'#b8b3a6','muted grey':'#6b6b63','near-black':'#1c1c1c',
  };
  const key = Object.keys(map).find(k => name.includes(k));
  return key ? map[key] : '#555';
}
```

**Step 2:** In `src/app/profile/[username]/page.tsx`, render `<FingerprintCard userId={profile.id} />` under the profile header/stats (public, read-only). Import at top.

**Step 3:** In `src/app/profile/page.tsx` (own profile), also render `<FingerprintCard userId={user.id} />`, plus a generate/refresh control shown only when the owner has ≥50 films: it builds the taste vector from their signals (reuse `useRecommendations`'s `taste`, or compute inline), calls `tasteSummary(...)`, POSTs to `/api/fingerprint`, then re-reads the row. Wire the button to `POST /api/fingerprint` with `{ userId: user.id, ...summary }`.

**Step 4: Manual verification**
- Owner with ≥50 films: click generate → prose appears within a few seconds; refresh page → persists (`preview_snapshot`, `preview_network` shows the POST).
- Public profile of that user shows the same card. Screenshot.

**Step 5: Commit**
```bash
git add src/components/FingerprintCard.tsx "src/app/profile/[username]/page.tsx" src/app/profile/page.tsx
git commit -m "feat(fingerprint): palette+prose card on own and public profiles"
```

---

# PHASE 3 — Rich-media reviews

### Task 10: Media schema + storage bucket

**Files:**
- Create: `docs/migrations/2026-07-13-review-media.sql`
- Modify: `src/lib/supabase.ts`

**Step 1: Migration** — `docs/migrations/2026-07-13-review-media.sql`:
```sql
alter table public.reviews add column if not exists media jsonb default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('review-media', 'review-media', true)
on conflict (id) do nothing;

create policy "review media public read"
  on storage.objects for select using (bucket_id = 'review-media');
create policy "review media authed write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'review-media' and owner = auth.uid());
```

**Step 2:** Extend the `Review` type in `src/lib/supabase.ts`:
```ts
export type ReviewMedia = { url: string; type: 'image' | 'video' | 'gif'; w?: number; h?: number };
// add to Review:
  media?: ReviewMedia[];
```

**Step 3: USER ACTION** — output: run `docs/migrations/2026-07-13-review-media.sql` in Supabase SQL Editor.

**Step 4: Commit**
```bash
git add docs/migrations/2026-07-13-review-media.sql src/lib/supabase.ts
git commit -m "feat(reviews): media jsonb column + review-media storage bucket migration"
```

---

### Task 11: Upload UI in the review form

**Files:**
- Modify: `src/components/FilmActions.tsx`

**Step 1:** Add state near the other review state (line ~55):
```ts
const [media, setMedia] = useState<{ url: string; type: 'image' | 'video' | 'gif' }[]>([]);
const [uploading, setUploading] = useState(false);
```

**Step 2:** Add an uploader handler (validates type/size, uploads to storage):
```ts
const MAX = { image: 5 * 1024 * 1024, gif: 8 * 1024 * 1024, video: 25 * 1024 * 1024 };
const handleFiles = async (files: FileList | null) => {
  if (!files || !user) return;
  setUploading(true);
  for (const file of Array.from(files)) {
    const type: 'image' | 'video' | 'gif' =
      file.type === 'image/gif' ? 'gif' : file.type.startsWith('video') ? 'video' : 'image';
    if (file.size > MAX[type]) { alert(`${type} too large (max ${MAX[type] / 1024 / 1024}MB)`); continue; }
    const path = `${user.id}/${tmdbId}-${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from('review-media').upload(path, file, { upsert: false });
    if (error) { alert('upload failed'); continue; }
    const { data } = supabase.storage.from('review-media').getPublicUrl(path);
    setMedia(prev => [...prev, { url: data.publicUrl, type }]);
  }
  setUploading(false);
};
```

**Step 3:** Include `media` in the review insert (modify `submitReview`, line 108):
```ts
await supabase.from('reviews').insert({
  user_id: user.id, tmdb_id: tmdbId, media_type: mediaType,
  title: reviewTitle || null, body: reviewBody, contains_spoilers: spoiler,
  media, created_at: new Date().toISOString(),
});
```
Also reset `setMedia([])` in the post-submit resets.

**Step 4:** Add the file input + thumbnail previews inside the review panel (after the textarea, before the spoiler/save row):
```tsx
<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0' }}>
  {media.map((m, i) => (
    <div key={i} style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '3px', overflow: 'hidden', border: '1px solid #222' }}>
      {m.type === 'video'
        ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <img src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      <button onClick={() => setMedia(prev => prev.filter((_, j) => j !== i))}
        style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', fontSize: '10px', cursor: 'pointer', width: '16px', height: '16px', lineHeight: 1 }}>×</button>
    </div>
  ))}
  <label style={{ width: '56px', height: '56px', border: '1px dashed #2a2a2a', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#555', fontSize: '20px' }}>
    {uploading ? '…' : '+'}
    <input type="file" accept="image/*,video/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
  </label>
</div>
```

**Step 5: Manual verification**
- Open a film, review panel, add an image + a short clip → thumbnails render, remove works, save succeeds (`preview_network` shows storage upload + review insert with `media`).

**Step 6: Commit**
```bash
git add src/components/FilmActions.tsx
git commit -m "feat(reviews): image/video/gif upload in review composer"
```

---

### Task 12: Render media in review cards

**Files:**
- Modify: `src/components/MovieModal.tsx`
- Modify: `src/app/profile/[username]/page.tsx` (ReviewCard)

**Step 1:** In the `ReviewCard` of `MovieModal.tsx`, after the review body, render attachments:
```tsx
{review.media?.length > 0 && (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '6px', marginTop: '10px' }}>
    {review.media.map((m: any, i: number) => (
      m.type === 'video'
        ? <video key={i} src={m.url} controls style={{ width: '100%', borderRadius: '3px' }} />
        : <img key={i} src={m.url} alt="" style={{ width: '100%', borderRadius: '3px', objectFit: 'cover' }} />
    ))}
  </div>
)}
```
Ensure the review query selects `media` (it uses `select('*')`, so it already does).

**Step 2:** Mirror the same block in the public-profile `ReviewCard` (`src/app/profile/[username]/page.tsx`), and add `media` to the `ReviewEntry` interface.

**Step 3: Manual verification** — open the reviewed film's modal + the reviewer's public profile: media renders inline, video plays. Screenshot both.

**Step 4: Commit**
```bash
git add src/components/MovieModal.tsx "src/app/profile/[username]/page.tsx"
git commit -m "feat(reviews): render image/video/gif attachments in review cards"
```

---

# Closeout

### Task 13: Full verification pass

- Run: `npm test` → all green.
- Run: `npx tsc --noEmit` → no errors.
- Run: `npm run build` → succeeds.
- Confirm the three USER ACTION migrations are recorded in `docs/migrations/` and the two env vars (`ANTHROPIC_API_KEY`) are documented.
- `godmode:merge-protocol` to land the branch.

**Env/setup summary to surface to the user:**
1. `ANTHROPIC_API_KEY` → `.env.local` + Vercel.
2. Run all three SQL files in `docs/migrations/` (taste_profiles, review-media; taste_profiles needs the RLS policies).
3. First fingerprint requires ≥50 logged films for that user.
