'use client';

import { useTheme } from '@/hooks/use-theme';

export function VizzorLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const src = isLight ? '/vizzor_logodarkicon.png' : '/vizzor_logoicon.png';

  return <img src={src} alt="vizzor" width={size} height={size} className={className} />;
}
