'use client';

import { usePathname } from 'next/navigation';
import { MiniPrice } from '@/components/dashboard/mini-price';
import { SystemStatus } from '@/components/dashboard/system-status';

const navItems = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    href: '/markets',
    label: 'Markets',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polyline points="1,12 4,7 7,9 10,4 15,6" />
        <line x1="1" y1="15" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    href: '/agents',
    label: 'Agents',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="5" r="3" />
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    href: '/portfolio',
    label: 'Portfolio',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M2 7h12" />
        <path d="M6 3V1" />
        <path d="M10 3V1" />
      </svg>
    ),
  },
  {
    href: '/onchain',
    label: 'On-Chain',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M5 6l3 2-3 2" />
        <line x1="8" y1="8" x2="12" y2="8" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 border-r border-[var(--border)] bg-[var(--background)] flex flex-col">
      {/* Brand */}
      <div className="px-4 py-4">
        <h1 className="text-lg font-bold text-[var(--primary)] glow-cyan">Vizzor</h1>
        <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Mission Control</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-r-md transition-colors ${
                isActive
                  ? 'text-[var(--primary)] bg-[var(--primary)]/10 border-l-2 border-[var(--primary)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)] border-l-2 border-transparent'
              }`}
            >
              {item.icon}
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Mini prices + status */}
      <div className="px-3 py-3 border-t border-[var(--border)] space-y-1">
        <MiniPrice symbol="BTC" />
        <MiniPrice symbol="ETH" />
        <MiniPrice symbol="SOL" />
        <div className="pt-2 border-t border-[var(--border)] mt-2">
          <SystemStatus />
        </div>
      </div>
    </aside>
  );
}
