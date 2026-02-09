/**
 * Cost in dollars for each ploppable type. Used when placing to deduct from budget.
 * Unknown types default to 0 (e.g. dev-only structures).
 */
export const PLOPPABLE_COSTS: Record<string, number> = {
  'Parking Spot': 200,
  'Trash Can': 50,
  'Vending Machine': 150,
  'Dumpster': 200,
  'Tree': 80,
  'Shrub': 40,
  'Flower Patch': 30,
  'Street Light': 120,
  'Security Camera': 75,
  'Portable Toilet': 100,
  'Bench': 60,
  'Speed Bump': 90,
  'Crosswalk': 110,
  'Parking Meter': 50,
  'Parking Booth': 300,
  'Pedestrian Spawner': 0,
};

/** Refund fraction (0-1) when demolishing a ploppable. 0 = no refund. */
export const DEMOLISH_REFUND_FRACTION = 0;

export function getPloppableCost(ploppableType: string): number {
  return PLOPPABLE_COSTS[ploppableType] ?? 0;
}
