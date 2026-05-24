'use client';

import { useState, useRef } from 'react';
import { HUE_RANGES } from '@/lib/colors';

interface Props {
  activeIndex: number;
  onSelect: (i: number) => void;
  onGo: (i: number) => void;
}

export default function SpectrumBar({ activeIndex, onSelect, onGo }: Props) {
  const [hovering, setHovering] = useState(false);
  const [cursorX, setCursorX] = useState(0);
  const [cursorY, setCursorY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const posToIndex = (clientX: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(pct * (HUE_RANGES.length - 1));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setCursorX(e.clientX);
    setCursorY(e.clientY);
    if (dragging) {
      const idx = posToIndex(e.clientX);
      onSelect(idx);
      setPendingIndex(idx);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    const idx = posToIndex(e.clientX);
    onSelect(idx);
    setPendingIndex(idx);
  };

  const handleMouseUp = () => setDragging(false);

  const handleClick = (e: React.MouseEvent) => {
    const idx = posToIndex(e.clientX);
    onSelect(idx);
    setPendingIndex(idx);
  };

  const needleLeft = (activeIndex / (HUE_RANGES.length - 1)) * 100;
  const activeRange = HUE_RANGES[activeIndex];
  const hasPending = pendingIndex !== null;

  return (
    <>
      {/* custom cursor */}
      {hovering && (
        <div
          className="fixed pointer-events-none z-50 transition-transform duration-100"
          style={{
            left: cursorX,
            top: cursorY,
            transform: `translate(-50%, -50%) scaleY(${dragging ? 2.2 : 1.4})`,
          }}
        >
          <div
            className="rounded-full transition-all duration-150"
            style={{
              width: dragging ? 28 : 20,
              height: dragging ? 28 : 20,
              background: activeRange.display,
              opacity: 0.85,
              boxShadow: `0 0 12px 2px ${activeRange.display}88`,
            }}
          />
        </div>
      )}

      <div className="px-8 pt-6 pb-0">
        <div className="text-[9px] tracking-[0.3em] text-neutral-600 uppercase mb-3">
          hue spectrum
        </div>

        <div className="flex items-center gap-4">
          <div
            ref={barRef}
            className="spectrum-gradient flex-1 h-[5px] rounded-full relative"
            style={{ cursor: 'none' }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => { setHovering(false); setDragging(false); }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
          >
            <div
              className="absolute top-[-6px] w-[2px] h-[17px] rounded-sm pointer-events-none transition-all duration-150"
              style={{
                left: `${needleLeft}%`,
                transform: 'translateX(-50%)',
                background: '#e2d9c8',
                boxShadow: dragging ? `0 0 6px 1px ${activeRange.display}` : 'none',
              }}
            />
          </div>

          <button
            onClick={() => hasPending && onGo(activeIndex)}
            className="text-[9px] tracking-[0.2em] uppercase px-4 py-1 rounded-sm border transition-all duration-300"
            style={{
              borderColor: hasPending ? activeRange.display : '#1e1e1e',
              color: hasPending ? '#e2d9c8' : '#333',
              background: hasPending ? activeRange.display + '18' : 'transparent',
              cursor: hasPending ? 'pointer' : 'default',
            }}
          >
            go
          </button>
        </div>

        {hasPending && (
          <div
            className="text-[9px] tracking-[0.15em] uppercase mt-2 transition-all duration-200"
            style={{ color: activeRange.display }}
          >
            {activeRange.label}
          </div>
        )}
      </div>
    </>
  );
}