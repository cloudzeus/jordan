'use client';

// Wrapper για τον Pascal Editor Viewer (React Three Fiber + WebGPU).
// Δέχεται τη δική μας PlanDataV2 και τη μετατρέπει σε Pascal scene graph.
import * as React from 'react';
import type { PlanDataV2 } from '@/lib/floorplan/saved';
import { planDataV2ToPascal } from '@/lib/floorplan/pascal-adapter';

type Props = {
  data: PlanDataV2;
  wallTypes?: { id: string; thicknessM: number }[];
  className?: string;
};

export function PascalViewer({ data, wallTypes = [], className }: Props) {
  const [Viewer, setViewer] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null);
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

  // Γέμισμα του scene store με τα δικά μας nodes.
  React.useEffect(() => {
    if (!Viewer) return;
    let alive = true;
    (async () => {
      const { useScene } = await import('@pascal-app/core');
      if (!alive) return;
      const graph = planDataV2ToPascal(data, wallTypes);
      console.log('[PascalViewer] scene nodes:', Object.keys(graph.nodes).length, 'walls:', data.walls.length, 'openings:', data.openings.length, 'columns:', data.columns.length);
      if (Object.keys(graph.nodes).length <= 1) {
        setError('Δεν υπάρχουν τοίχοι για 3D — σχεδίασε ή ανίχνευσε πρώτα.');
        return;
      }
      useScene.getState().setScene(graph.nodes as never, graph.rootNodeIds as never);
    })().catch((e) => {
      console.error('[PascalViewer] setScene failed', e);
      setError(e instanceof Error ? e.message : 'Failed to set scene');
    });
    return () => { alive = false; };
  }, [Viewer, data, wallTypes]);

  if (error) return <div className={className}>Σφάλμα φόρτωσης Pascal: {error}</div>;
  if (!Viewer) return <div className={className}>Φόρτωση Pascal viewer…</div>;

  return <Viewer className={className} />;
}
