export function formatUsd(value: number): string {
  if (value == null || isNaN(value)) return '---';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatPct(value: number): string {
  if (value == null || isNaN(value)) return '---';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatCompact(n: number): string {
  if (n == null || isNaN(n)) return '---';
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function riskLevelColor(level: string): string {
  switch (level) {
    case 'low':
    case 'safe':
    case 'clean':
      return 'var(--success)';
    case 'medium':
    case 'warning':
    case 'suspicious':
      return 'var(--warning)';
    case 'high':
    case 'danger':
    case 'flagged':
      return 'var(--danger)';
    case 'critical':
      return 'var(--danger)';
    default:
      return 'var(--muted)';
  }
}

export function sentimentColor(sentiment: string): string {
  switch (sentiment) {
    case 'bullish':
    case 'positive':
      return 'var(--success)';
    case 'bearish':
    case 'negative':
      return 'var(--danger)';
    default:
      return 'var(--muted)';
  }
}
