'use client';

export interface ColorPalette {
  dominant: string;
  palette: string[];
  hue: number;
  saturation: number;
  lightness: number;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
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

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function kMeans(pixels: number[][], k: number, iterations = 8): number[][] {
  let centroids = pixels.filter((_, i) => i % Math.floor(pixels.length / k) === 0).slice(0, k);
  for (let iter = 0; iter < iterations; iter++) {
    const clusters: number[][][] = Array.from({ length: k }, () => []);
    for (const px of pixels) {
      let minDist = Infinity, closest = 0;
      centroids.forEach((c, i) => {
        const d = Math.sqrt((px[0]-c[0])**2 + (px[1]-c[1])**2 + (px[2]-c[2])**2);
        if (d < minDist) { minDist = d; closest = i; }
      });
      clusters[closest].push(px);
    }
    centroids = clusters.map(cluster => {
      if (!cluster.length) return centroids[0];
      const avg = [0, 0, 0];
      cluster.forEach(px => { avg[0] += px[0]; avg[1] += px[1]; avg[2] += px[2]; });
      return avg.map(v => Math.round(v / cluster.length));
    });
  }
  return centroids;
}

export async function extractColors(imageUrl: string): Promise<ColorPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 80;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const pixels: number[][] = [];
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if (a < 128) continue;
          const [, s, l] = rgbToHsl(r, g, b);
          if (l < 5 || l > 95 || s < 5) continue;
          pixels.push([r, g, b]);
        }
        if (pixels.length < 10) { resolve(null); return; }
        const sample = pixels.filter((_, i) => i % 3 === 0);
        const centroids = kMeans(sample, 5);
        const sorted = centroids.sort((a, b) => {
          const [,sa,la] = rgbToHsl(a[0],a[1],a[2]);
          const [,sb,lb] = rgbToHsl(b[0],b[1],b[2]);
          return (sb * (1 - Math.abs(lb/100 - 0.5))) - (sa * (1 - Math.abs(la/100 - 0.5)));
        });
        const dominant = sorted[0];
        const [h, s, l] = rgbToHsl(dominant[0], dominant[1], dominant[2]);
        resolve({
          dominant: rgbToHex(dominant[0], dominant[1], dominant[2]),
          palette: sorted.map(c => rgbToHex(c[0], c[1], c[2])),
          hue: h,
          saturation: s,
          lightness: l,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export const HUE_RANGES = [
  { label: 'crimson',  min: 345, max: 15,  color: '#8B2020', display: 'hsl(0,65%,35%)' },
  { label: 'ember',    min: 15,  max: 35,  color: '#8B4A20', display: 'hsl(22,65%,35%)' },
  { label: 'amber',    min: 35,  max: 55,  color: '#8B6A20', display: 'hsl(45,65%,35%)' },
  { label: 'gold',     min: 55,  max: 75,  color: '#7A8020', display: 'hsl(58,65%,35%)' },
  { label: 'sage',     min: 75,  max: 110, color: '#3D7A20', display: 'hsl(95,55%,30%)' },
  { label: 'forest',   min: 110, max: 145, color: '#207A3D', display: 'hsl(135,55%,28%)' },
  { label: 'teal',     min: 145, max: 185, color: '#207A6A', display: 'hsl(168,55%,28%)' },
  { label: 'azure',    min: 185, max: 215, color: '#204E8B', display: 'hsl(205,65%,34%)' },
  { label: 'indigo',   min: 215, max: 245, color: '#20208B', display: 'hsl(230,65%,34%)' },
  { label: 'violet',   min: 245, max: 275, color: '#4A208B', display: 'hsl(258,65%,34%)' },
  { label: 'fuchsia',  min: 275, max: 310, color: '#7A208B', display: 'hsl(285,65%,34%)' },
  { label: 'rose',     min: 310, max: 345, color: '#8B2060', display: 'hsl(325,65%,34%)' },
];

export function hueToRange(hue: number): number {
  for (let i = 0; i < HUE_RANGES.length; i++) {
    const r = HUE_RANGES[i];
    if (r.min > r.max) {
      if (hue >= r.min || hue < r.max) return i;
    } else {
      if (hue >= r.min && hue < r.max) return i;
    }
  }
  return 0;
}
