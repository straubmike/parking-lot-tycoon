/**
 * Cost in dollars per edge segment for lines and borders.
 * Material cost only, no labor/installation.
 * - Lane Line: yellow paint, quite cheap
 * - Curb: thin concrete along tile border (less than full tile of concrete at $25)
 * - Fence: chain link ~8ft high
 */
export const LINE_COSTS: Record<string, number> = {
  'Lane Line': 1,
  'Curb': 6,
  'Fence': 15,
};

export function getLineCost(lineName: string): number {
  return LINE_COSTS[lineName] ?? 0;
}
