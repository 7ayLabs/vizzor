'use client';

import { useApi } from '@/hooks/use-api';
import type { FearGreedData } from '@/lib/types';

const ZONES = [
  { label: 'Extreme Fear', color: '#ef4444', max: 20 },
  { label: 'Fear', color: '#a1a1a1', max: 40 },
  { label: 'Neutral', color: '#6b6b6b', max: 60 },
  { label: 'Greed', color: '#a1a1a1', max: 80 },
  { label: 'Extreme Greed', color: '#22c55e', max: 100 },
];

function getClassification(value: number): { label: string; color: string } {
  for (const zone of ZONES) {
    if (value <= zone.max) return { label: zone.label, color: zone.color };
  }
  return { label: 'Unknown', color: '#6b6b6b' };
}

export function FearGreedGauge() {
  const { data } = useApi<FearGreedData>('/v1/market/fear-greed');

  const value = data?.current?.value ?? 50;
  const classification = data?.current?.classification;
  const { label, color } = classification
    ? { label: classification, color: getClassification(value).color }
    : getClassification(value);

  // SVG gauge: semicircle from -180 to 0 degrees
  const angle = -180 + (value / 100) * 180;
  const needleX = 50 + 35 * Math.cos((angle * Math.PI) / 180);
  const needleY = 55 + 35 * Math.sin((angle * Math.PI) / 180);

  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
      <h3 className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">
        Fear & Greed
      </h3>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 100 60" className="w-full max-w-[180px]">
          {/* Background arc zones */}
          {ZONES.map((zone, i) => {
            const startAngle = -180 + i * 36;
            const endAngle = startAngle + 36;
            const r = 38;
            const x1 = 50 + r * Math.cos((startAngle * Math.PI) / 180);
            const y1 = 55 + r * Math.sin((startAngle * Math.PI) / 180);
            const x2 = 50 + r * Math.cos((endAngle * Math.PI) / 180);
            const y2 = 55 + r * Math.sin((endAngle * Math.PI) / 180);
            return (
              <path
                key={zone.label}
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={zone.color}
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.3"
              />
            );
          })}
          {/* Needle */}
          <line
            x1="50"
            y1="55"
            x2={needleX}
            y2={needleY}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="50" cy="55" r="3" fill={color} />
          {/* Value */}
          <text
            x="50"
            y="48"
            textAnchor="middle"
            fill={color}
            fontSize="14"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {data ? value : '--'}
          </text>
        </svg>
        <span className="text-xs font-medium mt-1" style={{ color }}>
          {data ? label : 'Loading...'}
        </span>
        {data?.previous?.value !== undefined && (
          <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
            Prev: {data.previous.value}
          </span>
        )}
      </div>
    </div>
  );
}
