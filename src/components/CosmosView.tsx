'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Movie, posterUrl, getTitle } from '@/lib/tmdb';

interface Props {
  movies: Movie[];
  onSelect: (movie: Movie) => void;
  activeHue: number | null;
}

interface PlacedMovie {
  movie: Movie;
  x: number;
  y: number;
  size: number;
}

export default function CosmosView({ movies, onSelect, activeHue }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<PlacedMovie[]>([]);
  const [tooltip, setTooltip] = useState<{ movie: Movie; x: number; y: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 700 });

  useEffect(() => {
    const update = () => {
      if (canvasRef.current) {
        setDimensions({
          width: canvasRef.current.offsetWidth,
          height: canvasRef.current.offsetHeight,
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const colorized = movies.filter(m => m.colorHue !== undefined);
    if (!colorized.length) return;

    const { width, height } = dimensions;
    const PAD = 40;
    const W = width - PAD * 2;
    const H = height - PAD * 2;

    const newPlaced: PlacedMovie[] = colorized.map(movie => {
      const hueNorm = (movie.colorHue! / 360);
      const satNorm = (movie.colorSat ?? 50) / 100;
      const litNorm = (movie.colorLit ?? 50) / 100;

      // X = hue (wrap around), Y = inverted lightness (darker = lower)
      // Add slight saturation jitter on Y so similar hues don't stack
      const x = PAD + hueNorm * W;
      const y = PAD + (1 - (satNorm * 0.6 + litNorm * 0.4)) * H;

      return { movie, x, y, size: 44 };
    });

    // Spread overlapping posters slightly
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < newPlaced.length; i++) {
        for (let j = i + 1; j < newPlaced.length; j++) {
          const a = newPlaced[i], b = newPlaced[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = (a.size + b.size) / 2 + 4;
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            newPlaced[i].x -= nx * push * 0.5;
            newPlaced[i].y -= ny * push * 0.5;
            newPlaced[j].x += nx * push * 0.5;
            newPlaced[j].y += ny * push * 0.5;
          }
        }
      }
    }

    setPlaced(newPlaced);
  }, [movies, dimensions]);

  const hueDist = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, 360 - d);
  };

  return (
    <div
      ref={canvasRef}
      className="relative w-full overflow-hidden"
      style={{ height: '72vh', background: '#070707' }}
    >
      {/* Hue axis labels */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-between px-10 pointer-events-none">
        {['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'violet', 'red'].map((l, i) => (
          <span key={i} className="text-[8px] tracking-widest text-neutral-800 uppercase">{l}</span>
        ))}
      </div>

      {/* Posters */}
      {placed.map(({ movie, x, y, size }) => {
        const isActive = activeHue === null || hueDist(movie.colorHue ?? 0, activeHue) < 25;
        const dot = movie.dominantColor || '#555';

        return (
          <div
            key={movie.id}
            className="absolute transition-all duration-500"
            style={{
              left: x,
              top: y,
              width: size,
              height: size * 1.5,
              transform: 'translate(-50%, -50%)',
              opacity: isActive ? 1 : 0.08,
              zIndex: isActive ? 2 : 1,
            }}
            onMouseEnter={(e) => setTooltip({ movie, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTooltip(null)}
            onMouseMove={(e) => setTooltip({ movie, x: e.clientX, y: e.clientY })}
            onClick={() => onSelect(movie)}
          >
            <div
              className="w-full h-full rounded-sm overflow-hidden cursor-pointer"
              style={{
                backgroundImage: movie.poster_path ? `url(${posterUrl(movie.poster_path, 'w185')})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: `1px solid ${dot}44`,
                boxShadow: isActive ? `0 0 8px 0px ${dot}55` : 'none',
                transition: 'box-shadow 0.3s, opacity 0.5s',
              }}
            />
          </div>
        );
      })}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-2 rounded-sm"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 40,
            background: '#111',
            border: '1px solid #222',
          }}
        >
          <div
            className="text-[12px] font-light text-[#e2d9c8]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {getTitle(tooltip.movie)}
          </div>
          {tooltip.movie.dominantColor && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full" style={{ background: tooltip.movie.dominantColor }} />
              <span className="text-[9px] text-neutral-600 tracking-widest">{tooltip.movie.dominantColor}</span>
            </div>
          )}
        </div>
      )}

      {placed.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[10px] tracking-[0.3em] text-neutral-800 uppercase">
            extracting colours — cosmos populating...
          </div>
        </div>
      )}
    </div>
  );
}