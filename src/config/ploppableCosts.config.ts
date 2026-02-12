/**
 * Cost in dollars for each ploppable type. Used when placing to deduct from budget.
 * Priced relative to dirt ($1/tile) baseline — material cost only, no labor/installation.
 * Unknown types default to 0 (e.g. dev-only structures, tools like Pedestrian Spawner).
 */
export const PLOPPABLE_COSTS: Record<string, number> = {
  'Flower Patch': 25,
  'Shrub': 40,
  'Trash Can': 50,
  'Bench': 60,
  'Parking Meter': 50,
  'Security Camera': 75,
  'Tree': 80,
  'Portable Toilet': 100,
  'Speed Bump': 90,
  'Crosswalk': 110,
  'Street Light': 120,
  'Vending Machine': 150,
  'Parking Spot': 5,  // Stall marking paint (~3 edges worth, like lane lines)
  'Dumpster': 200,
  'Parking Booth': 300,
  'Pedestrian Spawner': 0,
};

/** Refund fraction (0-1) when demolishing a ploppable. 0 = no refund. */
export const DEMOLISH_REFUND_FRACTION = 0;

export function getPloppableCost(ploppableType: string): number {
  return PLOPPABLE_COSTS[ploppableType] ?? 0;
}
