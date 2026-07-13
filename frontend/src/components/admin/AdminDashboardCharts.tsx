import React, { useMemo } from 'react';

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export function DonutChart({
  segments,
  size = 168,
  stroke = 22,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((segment) => {
    const fraction = total > 0 ? segment.value / total : 0;
    const dash = fraction * circumference;
    const arc = { ...segment, dash, gap: circumference - dash, offset: -offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(226 232 240)"
            strokeWidth={stroke}
          />
          {arcs.map((arc) =>
            arc.value > 0 ? (
              <circle
                key={arc.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={stroke}
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            ) : null,
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
          <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{centerValue ?? total}</span>
          {centerLabel ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-1">{centerLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="flex-1 w-full space-y-2.5 min-w-0">
        {segments.map((segment) => {
          const pct = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <div key={segment.key} className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
              <span className="text-[13px] font-medium text-slate-700 truncate flex-1">{segment.label}</span>
              <span className="text-[13px] font-bold text-slate-900 tabular-nums shrink-0">{segment.value}</span>
              <span className="text-[11px] text-slate-400 tabular-nums w-8 text-right shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type BarChartItem = {
  key: string;
  label: string;
  value: number;
  sublabel?: string;
  color?: string;
};

export function HorizontalBarChart({
  items,
  maxItems = 8,
  barColor = '#4f46e5',
}: {
  items: BarChartItem[];
  maxItems?: number;
  barColor?: string;
}) {
  const rows = useMemo(
    () => [...items].sort((a, b) => b.value - a.value).slice(0, maxItems),
    [items, maxItems],
  );
  const maxValue = Math.max(1, ...rows.map((r) => r.value));

  if (rows.length === 0) {
    return <p className="text-[13px] text-slate-400 py-6 text-center">—</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const widthPct = Math.max(4, (row.value / maxValue) * 100);
        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-300 tabular-nums w-4 shrink-0">{idx + 1}</span>
                <span className="text-[13px] font-semibold text-slate-800 truncate">{row.label}</span>
              </div>
              <span className="text-[12px] font-bold text-slate-600 tabular-nums shrink-0">{row.value}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden ml-6">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${widthPct}%`, backgroundColor: row.color ?? barColor, opacity: 1 - idx * 0.06 }}
              />
            </div>
            {row.sublabel ? <p className="text-[10px] text-slate-400 ml-6 truncate">{row.sublabel}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function TrendBars({
  items,
}: {
  items: { key: string; label: string; value: number; color: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="flex items-end justify-between gap-3 h-36 pt-2">
      {items.map((item) => {
        const heightPct = Math.max(item.value > 0 ? 8 : 2, (item.value / max) * 100);
        return (
          <div key={item.key} className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <span className="text-[12px] font-bold text-slate-800 tabular-nums">{item.value}</span>
            <div className="w-full flex items-end justify-center h-24">
              <div
                className="w-full max-w-[52px] rounded-t-xl transition-all duration-700 ease-out shadow-sm"
                style={{ height: `${heightPct}%`, backgroundColor: item.color }}
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-500 text-center leading-tight">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  gradient,
  delay = 0,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  gradient: string;
  delay?: number;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/60 p-4 shadow-sm ${gradient}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute -right-3 -top-3 w-20 h-20 rounded-full bg-white/20 blur-2xl pointer-events-none" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-75 leading-tight">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1 leading-none">{value}</p>
          {hint ? <p className="text-[11px] opacity-70 mt-1.5 font-medium">{hint}</p> : null}
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0 backdrop-blur-sm">
          <Icon size={20} className="opacity-90" />
        </div>
      </div>
    </div>
  );
}
