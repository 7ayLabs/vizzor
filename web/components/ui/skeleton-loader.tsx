'use client';

export function SkeletonLine({
  width = '100%',
  height = '16px',
}: {
  width?: string;
  height?: string;
}) {
  return <div className="rounded bg-white/[0.06] animate-shimmer" style={{ width, height }} />;
}

export function SkeletonCard() {
  return (
    <div className="glass-card p-4 space-y-3">
      <SkeletonLine width="60%" height="20px" />
      <SkeletonLine width="100%" />
      <SkeletonLine width="80%" />
      <div className="flex gap-2 pt-2">
        <SkeletonLine width="80px" height="28px" />
        <SkeletonLine width="80px" height="28px" />
      </div>
    </div>
  );
}

export function SkeletonPrice() {
  return (
    <div className="flex items-center gap-2">
      <SkeletonLine width="24px" height="24px" />
      <SkeletonLine width="100px" height="20px" />
      <SkeletonLine width="60px" height="16px" />
    </div>
  );
}

export function SkeletonChart({ height = '200px' }: { height?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.06] animate-shimmer" style={{ height, width: '100%' }} />
  );
}
