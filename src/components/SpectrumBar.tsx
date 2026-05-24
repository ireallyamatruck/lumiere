'use client';

import { HUE_RANGES } from '@/lib/colors';

interface Props {
  activeIndex: number;
  onSelect: (i: number) => void;
}

export default function SpectrumBar({ activeIndex, onSelect }: Props) {
  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(pct * (HUE_RANGES.length - 1));
    onSelect(Math.max(0, Math.min(HUE_RANGES.length - 1, idx)));
  };

  const needleLeft = (activeIndex / (HUE_RANGES.length - 1)) * 100;

  return (
    <div className="px-8 pt-6 pb-0">
      <div className="text-[9px] tracking-[0.3em] text-neutral-600 uppercase mb-3">
        hue spectrum
      </div>

      <div
        className="spectrum-gradient h-[5px] rounded-full cursor-pointer relative mb-4"
        onClick={handleBarClick}
      >
        <div
          className="absolute top-[-6px] w-[2px] h-[17px] bg-[#e2d9c8] rounded-sm pointer-events-none transition-all duration-200"
          style={{ left: `${needleLeft}%`, transform: 'translateX(-50%)' }}
        />
      </div>

    </div>
  );
}
