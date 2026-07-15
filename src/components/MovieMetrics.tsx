'use client';

const LABELS: Record<string, string> = {
  love_and_romance: 'romance',
  scifi_elements: 'sci-fi',
  intellectual_appeal: 'intellectual',
  costume_or_wardrobe_detail: 'costume',
  debauchery: 'debauchery',
  horror: 'horror',
  child_suitability: 'family-friendly',
  water_and_scenery_focus: 'scenery',
  documentary_style: 'documentary',
  us_minority_representation: 'representation',
  cult_following: 'cult',
  asian_influence: 'asian influence',
};

interface Props {
  characteristics: Record<string, number>;
  accentColor?: string;
}

export default function MovieMetrics({ characteristics, accentColor }: Props) {
  const entries = Object.entries(characteristics)
    .filter(([, v]) => Math.abs(v) > 0.1)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

  if (entries.length === 0) return null;

  const accent = accentColor || '#a89070';

  return (
    <div className="px-6 pb-2">
      <div style={{ fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#555', marginBottom: '12px' }}>
        film metrics
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {entries.map(([key, value]) => {
          const label = LABELS[key] || key.replace(/_/g, ' ');
          const pct = Math.abs(value) / 4; // 0–1
          const isPos = value >= 0;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '90px', fontSize: '10px', letterSpacing: '0.08em', color: '#666', textAlign: 'right', flexShrink: 0, textTransform: 'uppercase' }}>
                {label}
              </div>
              {/* bar track */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', height: '6px', position: 'relative' }}>
                {/* center line */}
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: '#222' }} />
                {/* bar */}
                <div style={{
                  position: 'absolute',
                  height: '4px',
                  borderRadius: '2px',
                  background: isPos ? accent : '#555',
                  opacity: 0.75 + pct * 0.25,
                  left: isPos ? '50%' : `${50 - pct * 50}%`,
                  width: `${pct * 50}%`,
                }} />
              </div>
              <div style={{ width: '28px', fontSize: '10px', color: '#555', textAlign: 'right', flexShrink: 0 }}>
                {value > 0 ? '+' : ''}{value.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
