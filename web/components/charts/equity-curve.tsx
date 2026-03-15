'use client';

import { useEffect, useRef } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

interface EquityCurveProps {
  data: { time: number; equity: number }[];
}

export function EquityCurve({ data }: EquityCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    import('lightweight-charts').then(({ createChart }) => {
      if (!containerRef.current) return;

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 300,
        layout: {
          background: { color: '#0f1520' },
          textColor: '#64748b',
          fontFamily: "'JetBrains Mono', monospace",
        },
        grid: {
          vertLines: { color: '#1e293b' },
          horzLines: { color: '#1e293b' },
        },
        rightPriceScale: { borderColor: '#1e293b' },
        timeScale: { borderColor: '#1e293b' },
      });

      chartRef.current = chart;

      const series = chart.addAreaSeries({
        lineColor: '#06b6d4',
        topColor: 'rgba(6, 182, 212, 0.3)',
        bottomColor: 'rgba(6, 182, 212, 0)',
        lineWidth: 2,
      });

      series.setData(
        data.map((d) => ({
          time: (d.time / 1000) as UTCTimestamp,
          value: d.equity,
        })),
      );

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      observer.observe(containerRef.current);

      return () => observer.disconnect();
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  return <div ref={containerRef} className="w-full" />;
}
