'use client';

import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: string; // Font Awesome class
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: 'Chat',
    items: [{ href: '/', label: 'AI Chat', icon: 'fa-solid fa-comment-dots' }],
  },
  {
    title: 'Control',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-grip' },
      { href: '/markets', label: 'Markets', icon: 'fa-solid fa-chart-line' },
      { href: '/onchain', label: 'On-Chain', icon: 'fa-solid fa-link' },
    ],
  },
  {
    title: 'Agent',
    items: [
      { href: '/agents', label: 'Agents', icon: 'fa-solid fa-robot' },
      { href: '/portfolio', label: 'Portfolio', icon: 'fa-solid fa-wallet' },
    ],
  },
  {
    title: 'Settings',
    items: [{ href: '/settings', label: 'Settings', icon: 'fa-solid fa-gear' }],
  },
  {
    title: 'Resources',
    items: [{ href: '/docs', label: 'Docs', icon: 'fa-solid fa-book' }],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  const nav = (
    <aside className="w-56 bg-[var(--background)] border-r border-[var(--border)] flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-4 hidden md:flex flex-col items-center">
        <h1 className="text-lg font-bold text-[var(--foreground)]">vizzor</h1>
        <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest">
          AI crypto chronovisor
        </p>
      </div>

      {/* Sections */}
      <nav className="flex-1 px-2 py-1 space-y-3 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-xs rounded-r-md transition-colors touch-target ${
                      isActive
                        ? 'text-[var(--primary)] bg-[var(--primary)]/10 border-l-2 border-[var(--primary)]'
                        : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)] active:bg-[var(--border)] border-l-2 border-transparent'
                    }`}
                  >
                    <i className={`${item.icon} w-4 text-center text-[11px]`} />
                    {item.label}
                  </a>
                );
              })}
            </div>
            {section.title !== 'Resources' && (
              <div className="mx-3 mt-2 border-b border-[var(--border)]" />
            )}
          </div>
        ))}
      </nav>
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex">{nav}</div>

      {/* Mobile: overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="relative z-50 animate-slide-in">{nav}</div>
        </div>
      )}
    </>
  );
}
