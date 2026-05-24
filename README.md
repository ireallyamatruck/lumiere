# Lumière

Browse cinema by the colour of its posters.

## Setup

1. Clone the repo and install dependencies:
```bash
npm install
```

2. Create your environment file:
```bash
cp .env.local.example .env.local
```

3. Add your TMDB API key to `.env.local`:
```
NEXT_PUBLIC_TMDB_API_KEY=your_key_here
```

Get a free key at https://www.themoviedb.org/settings/api (choose Developer tier).

4. Run locally:
```bash
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

1. Push to GitHub
2. Import the repo on vercel.com
3. Add `NEXT_PUBLIC_TMDB_API_KEY` as an environment variable in Vercel's project settings
4. Deploy

## How it works

- Fetches posters from TMDB
- Extracts dominant colors from each poster using canvas-based k-means clustering
- Filters the grid in real time as you select hues on the spectrum bar
