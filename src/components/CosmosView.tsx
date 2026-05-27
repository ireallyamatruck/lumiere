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
  const outerRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<PlacedMovie[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 700 });
  const [zoom, setZoom] = useState(1);
  const layoutTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const update = () => {
      if (outerRef.current) {
        setDimensions({
          width: outerRef.current.offsetWidth,
          height: outerRef.current.offsetHeight,
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    // Debounce: skip intermediate renders while movies are still streaming in
    clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(() => {
      const colorized = movies.filter(m => m.colorHue !== undefined);
      if (!colorized.length) return;

      const { width, height } = dimensions;
      const PAD = 40;
      const W = width - PAD * 2;
      const H = height - PAD * 2;

      // O(n) layout — no quadratic spread for large datasets
      const newPlaced: PlacedMovie[] = colorized.map(movie => {
        const hueNorm = movie.colorHue! / 360;
        const satNorm = (movie.colorSat ?? 50) / 100;
        const litNorm = (movie.colorLit ?? 50) / 100;

        // Add tiny deterministic jitter so same-hue movies don't stack exactly
        const jitter = ((movie.id * 2654435761) >>> 0) / 0xffffffff;
        const x = (PAD + hueNorm * W + (jitter - 0.5) * 8) * zoom;
        const y = (PAD + (1 - (satNorm * 0.6 + litNorm * 0.4)) * H + (jitter - 0.5) * 8) * zoom;

        return { movie, x, y, size: 44 * zoom };
      });

      setPlaced(newPlaced);
    }, 80);

    return () => clearTimeout(layoutTimer.current);
  }, [movies, dimensions, zoom]);

  const hueDist = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, 360 - d);
  };

  const virtualW = dimensions.width * zoom;
  const virtualH = dimensions.height * zoom;

  return (
    <div
      ref={outerRef}
      className="relative w-full overflow-auto"
      style={{ height: '72vh', background: '#070707' }}
    >
      {/* Scrollable inner canvas */}
      <div
        style={{
          position: 'relative',
          width: Math.max(virtualW, dimensions.width),
          height: Math.max(virtualH, dimensions.height),
        }}
      >
        {/* Hue axis labels — fixed to bottom of inner */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-between px-10 pointer-events-none">
          {['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'violet', 'red'].map((l, i) => (
            <span key={i} className="text-[8px] tracking-widest text-neutral-800 uppercase">{l}</span>
          ))}
        </div>

        {/* Posters */}
        {placed.map(({ movie, x, y, size }) => {
          const isActive = activeHue === null || hueDist(movie.colorHue ?? 0, activeHue) < 25;
          const dot = movie.dominantColor || '#555';
          const isHovered = hoveredId === movie.id;

          return (
            <div
              key={movie.id}
              className="absolute"
              style={{
                left: x,
                top: y,
                width: size,
                height: size * 1.5,
                transform: 'translate(-50%, -50%)',
                opacity: isActive ? 1 : 0.08,
                zIndex: isHovered ? 10 : isActive ? 2 : 1,
                transition: 'opacity 0.5s',
              }}
              onMouseEnter={() => setHoveredId(movie.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(movie)}
            >
              <div
                className="w-full h-full rounded-sm overflow-hidden cursor-pointer relative"
                style={{
                  backgroundImage: movie.poster_path ? `url(${posterUrl(movie.poster_path, 'w185')})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  border: `1px solid ${isHovered ? dot + 'cc' : dot + '44'}`,
                  boxShadow: isHovered ? `0 0 14px 2px ${dot}88` : isActive ? `0 0 8px 0px ${dot}55` : 'none',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                }}
              >
                {/* Title overlay on hover */}
                {isHovered && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    padding: '5px 4px 4px',
                  }}>
                    <div style={{
                      fontSize: Math.max(8, 9 * zoom) + 'px',
                      color: '#f0ebe0',
                      lineHeight: 1.2,
                      wordBreak: 'break-word',
                    }}>
                      {getTitle(movie)}
                    </div>
                    {(movie.release_date || movie.first_air_date) && (
                      <div style={{ fontSize: Math.max(7, 8 * zoom) + 'px', color: '#666', marginTop: '1px' }}>
                        {(movie.release_date || movie.first_air_date || '').slice(0, 4)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {placed.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[10px] tracking-[0.3em] text-neutral-800 uppercase">
              extracting colours — cosmos populating...
            </div>
          </div>
        )}
      </div>

      {/* Zoom controls — fixed to bottom-right of outer */}
      <div style={{
        position: 'sticky',
        bottom: 12,
        marginLeft: 'auto',
        width: 'fit-content',
        marginRight: 16,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        zIndex: 20,
        background: 'rgba(7,7,7,0.85)',
        border: '1px solid #1e1e1e',
        borderRadius: '3px',
        padding: '4px 8px',
      }}>
        <button
          onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
          style={{ fontSize: '16px', color: zoom <= 0.5 ? '#2a2a2a' : '#666', background: 'none', border: 'none', cursor: zoom <= 0.5 ? 'default' : 'pointer', lineHeight: 1, padding: '0 2px', transition: 'color 0.15s' }}
          onMouseEnter={e => { if (zoom > 0.5) e.currentTarget.style.color = '#e2d9c8'; }}
          onMouseLeave={e => { e.currentTarget.style.color = zoom <= 0.5 ? '#2a2a2a' : '#666'; }}
        >−</button>
        <span style={{ fontSize: '10px', color: '#444', letterSpacing: '0.1em', minWidth: '32px', textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
          style={{ fontSize: '16px', color: zoom >= 3 ? '#2a2a2a' : '#666', background: 'none', border: 'none', cursor: zoom >= 3 ? 'default' : 'pointer', lineHeight: 1, padding: '0 2px', transition: 'color 0.15s' }}
          onMouseEnter={e => { if (zoom < 3) e.currentTarget.style.color = '#e2d9c8'; }}
          onMouseLeave={e => { e.currentTarget.style.color = zoom >= 3 ? '#2a2a2a' : '#666'; }}
        >+</button>
      </div>
    </div>
  );
}
