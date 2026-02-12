import type { SurfaceType } from '@/types';

/**
 * Cost in dollars per tile for each surface material.
 * Dirt = $1 baseline (material cost only, no labor/installation).
 */
export const SURFACE_COSTS: Record<SurfaceType, number> = {
  dirt: 1,
  grass: 2,
  gravel: 5,
  asphalt: 15,
  concrete: 25,
};

export function getSurfaceCost(surfaceType: SurfaceType): number {
  return SURFACE_COSTS[surfaceType] ?? 0;
}
