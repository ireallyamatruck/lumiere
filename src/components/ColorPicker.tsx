'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  hue: number;
  saturation: number;
  lightness: number;
  onChange: (h: number, s: number, l: number) => void;
  onGo: (h: number, s: number, l: number) => void;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return null;
  let r = parseInt(m[0], 16) / 255;
  let g = parseInt(m[1], 16) / 255;
  let b = parseInt(m[2], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export default function ColorPicker({ hue, saturation, lightness, onChange, onGo }: Props) {
  const squareRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);
  const [draggingSquare, setDraggingSquare] = useState(false);
  const [draggingHue, setDraggingHue] = useState(false);
  const [hexInput, setHexInput] = useState(hslToHex(hue, saturation, lightness));
  const [hexError, setHexError] = useState(false);

  // Keep hex in sync when color changes externally
  useEffect(() => {
    setHexInput(hslToHex(hue, saturation, lightness));
  }, [hue, saturation, lightness]);

  // Convert HSL picker coords:
  // Square X = saturation (0–100), Square Y = lightness inverted (100 top → 0 bottom)
  // But we blend with white at top-left and black at bottom, pure hue at top-right
  // This matches the standard SL picker (saturation x-axis, value/lightness y-axis)

  const getSquareCoords = () => {
    // In a standard HSV-style picker: X=saturation, Y=inverted value
    // We approximate with HSL: s and l are correlated
    // Treat x as saturation, y as (inverted) lightness but clamped to visible range
    const x = saturation / 100;
    const y = 1 - (lightness / 100);
    return { x, y };
  };

  const squareCoords = getSquareCoords();

  const handleSquareDrag = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!squareRef.current) return;
    const rect = squareRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newSat = Math.round(x * 100);
    const newLit = Math.round((1 - y) * 100);
    onChange(hue, newSat, newLit);
  }, [hue, onChange]);

  const handleHueDrag = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!hueBarRef.current) return;
    const rect = hueBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(Math.round(x * 360), saturation, lightness);
  }, [saturation, lightness, onChange]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingSquare) handleSquareDrag(e);
      if (draggingHue) handleHueDrag(e);
    };
    const handleMouseUp = () => { setDraggingSquare(false); setDraggingHue(false); };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingSquare, draggingHue, handleSquareDrag, handleHueDrag]);

  const handleHexInput = (val: string) => {
    setHexInput(val);
    const hex = val.startsWith('#') ? val : '#' + val;
    if (hex.length === 7) {
      const hsl = hexToHsl(hex);
      if (hsl) {
        setHexError(false);
        onChange(hsl[0], hsl[1], hsl[2]);
      } else {
        setHexError(true);
      }
    }
  };

  const currentHex = hslToHex(hue, saturation, lightness);
  const pureHueHex = hslToHex(hue, 100, 50);

  return (
    <div className="px-8 pt-6 pb-0">
      <div className="text-[9px] tracking-[0.3em] text-neutral-600 uppercase mb-3">
        colour
      </div>

      <div className="flex gap-3 items-start">
        {/* 2D SL square */}
        <div
          ref={squareRef}
          className="relative rounded-sm flex-shrink-0 cursor-crosshair select-none"
          style={{
            width: 200,
            height: 130,
            background: `hsl(${hue}, 100%, 50%)`,
          }}
          onMouseDown={(e) => { setDraggingSquare(true); handleSquareDrag(e); }}
        >
          {/* White gradient left→right (saturation) */}
          <div
            className="absolute inset-0 rounded-sm"
            style={{ background: 'linear-gradient(to right, #fff, transparent)' }}
          />
          {/* Black gradient bottom (lightness) */}
          <div
            className="absolute inset-0 rounded-sm"
            style={{ background: 'linear-gradient(to top, #000, transparent)' }}
          />
          {/* Cursor */}
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none"
            style={{
              left: `${squareCoords.x * 100}%`,
              top: `${squareCoords.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              background: currentHex,
            }}
          />
        </div>

        {/* Right column: hue bar + hex + go */}
        <div className="flex flex-col gap-3 flex-1">
          {/* Hue bar */}
          <div
            ref={hueBarRef}
            className="relative rounded-sm cursor-pointer select-none"
            style={{
              height: 18,
              background: 'linear-gradient(to right, hsl(0,100%,50%), hsl(30,100%,50%), hsl(60,100%,50%), hsl(90,100%,50%), hsl(120,100%,50%), hsl(150,100%,50%), hsl(180,100%,50%), hsl(210,100%,50%), hsl(240,100%,50%), hsl(270,100%,50%), hsl(300,100%,50%), hsl(330,100%,50%), hsl(360,100%,50%))',
            }}
            onMouseDown={(e) => { setDraggingHue(true); handleHueDrag(e); }}
          >
            <div
              className="absolute top-0 bottom-0 w-[3px] rounded-full pointer-events-none"
              style={{
                left: `${(hue / 360) * 100}%`,
                transform: 'translateX(-50%)',
                background: '#fff',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          {/* Hex input */}
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-sm flex-shrink-0 border border-[#333]"
              style={{ background: currentHex }}
            />
            <input
              value={hexInput}
              onChange={e => handleHexInput(e.target.value)}
              className="flex-1 bg-transparent border-b font-mono text-[10px] tracking-widest py-1 outline-none transition-colors"
              style={{
                borderColor: hexError ? '#8B2020' : '#222',
                color: hexError ? '#8B2020' : '#888',
              }}
              spellCheck={false}
              maxLength={7}
            />
          </div>

          {/* Go button */}
          <button
            onClick={() => onGo(hue, saturation, lightness)}
            className="text-[9px] tracking-[0.2em] uppercase px-3 py-2 rounded-sm border transition-all duration-300 text-center"
            style={{
              borderColor: pureHueHex + '88',
              color: '#e2d9c8',
              background: currentHex + '22',
            }}
          >
            search colour →
          </button>
        </div>
      </div>
    </div>
  );
}
