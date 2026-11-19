'use client';

// Wrapper για τον Pascal Editor Viewer (React Three Fiber + WebGPU).
// Δέχεται τη δική μας PlanDataV2 και τη μετατρέπει σε Pascal scene graph.
import * as React from 'react';
import type { PlanDataV2 } from '@/lib/floorplan/saved';

type Props = {
  data: PlanDataV2;
  className?: string;
};

export function PascalViewer({ data, className }: Props) {
  const [Viewer, setViewer] = React.useState<React.ComponentType<any> | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { loadPlugin } = await import('@pascal-app/core');
        const { builtinPlugin } = await import('@pascal-app/nodes');
        await loadPlugin(builtinPlugin);
        const mod = await import('@pascal-app/viewer');
        if (alive) setViewer(() => mod.Viewer);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load Pascal viewer');
      }
    })();
    return () => { alive = false; };
  }, []);

  if (error) return <div className={className}>Σφάλμα φόρτωσης Pascal: {error}</div>;
  if (!Viewer) return <div className={className}>Φόρτωση Pascal viewer…</div>;

  // TODO: μετατροπή PlanDataV2 → Pascal scene
  return <Viewer className={className} />;
}
