import { Challenge } from '@/types';
import { CHALLENGE_ORDER } from '@/managers/ProgressManager';

/** Respawn durations (pedestrianRespawnMinMs/MaxMs and bands) are in real-time milliseconds. 1 game minute = 1 real second; 8 game hours = 480_000 ms. */
const DEFAULT_SPAWN_INTERVAL_MS = 3000;

/**
 * Resolve current spawn interval (ms) from time-of-day schedule.
 * Game minutes 0-1439 (midnight to 23:59). Outside all windows returns fallbackMs.
 */
export function getSpawnIntervalMsForSchedule(
  totalGameMinutes: number,
  schedule: Challenge['vehicleSpawnSchedule'],
  fallbackMs: number = DEFAULT_SPAWN_INTERVAL_MS
): number {
  if (!schedule?.length) return fallbackMs;
  for (const window of schedule) {
    if (totalGameMinutes >= window.startGameMinutes && totalGameMinutes <= window.endGameMinutes) {
      return window.spawnIntervalMs;
    }
  }
  return fallbackMs;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'dev-mode',
    name: 'Dev Mode',
    description: 'Full sandbox with all tools for testing and building.',
    lotSize: { width: 10, height: 10 },
    budget: 10000,
    winConditions: [],
    vehicleSpawnIntervalMs: 3000,
    pedestrianRespawnMinMs: 5000,
    pedestrianRespawnMaxMs: 15000,
  },
  {
    id: 'learning-lot',
    name: 'Learning Lot',
    description: 'Build your first parking lot and learn the basics.',
    descriptionSubline: 'Playable grid: 10×10',
    winConditionsHeading: 'Win conditions by day 3:',
    lotSize: { width: 10, height: 12 },
    budget: 5000,
    initialGridPath: '/learninglot.json',
    winConditions: [
      { type: 'min_rating', value: 50, description: 'Reach a lot rating of 50' },
      { type: 'min_parking_spots', value: 3, description: 'Place at least 3 parking spots' },
    ],
    vehicleSpawnIntervalMs: 4000,
    pedestrianRespawnMinMs: 5000,
    pedestrianRespawnMaxMs: 15000,
  },
  {
    id: 'pizza-parking-problem',
    name: 'Pizza Parking Problem',
    description: 'Keep hungry customers happy with quick in-and-out parking.',
    lotSize: { width: 12, height: 12 },
    budget: 8000,
    winConditions: [
      { type: 'min_rating', value: 60, description: 'Reach a lot rating of 60' },
      { type: 'profit', value: 500, description: 'Earn $500 profit' },
    ],
    vehicleSpawnIntervalMs: 3500,
    vehicleSpawnSchedule: [
      { startGameMinutes: 660, endGameMinutes: 840, spawnIntervalMs: 2000 },   // 11:00–14:00 lunch
      { startGameMinutes: 1020, endGameMinutes: 1260, spawnIntervalMs: 2200 }, // 17:00–21:00 dinner
    ],
    pedestrianRespawnMinMs: 4000,
    pedestrianRespawnMaxMs: 12000,
    needGenerationProbability: 0.6,
    needTypeDistribution: { trash: 0.6, thirst: 0, toilet: 0.4 },
  },
  {
    id: 'rush-hour-roundabout',
    name: 'Rush Hour Roundabout',
    description: 'Handle the morning rush with efficient flow and safety.',
    lotSize: { width: 14, height: 14 },
    budget: 12000,
    winConditions: [
      { type: 'min_rating', value: 70, description: 'Reach a lot rating of 70' },
      { type: 'min_parking_spots', value: 8, description: 'Place at least 8 parking spots' },
    ],
    vehicleSpawnIntervalMs: 2500,
    pedestrianRespawnMinMs: 6000,
    pedestrianRespawnMaxMs: 18000,
  },
  {
    id: 'drive-in-disaster',
    name: 'Drive-In Disaster',
    description: 'Save the drive-in by making the lot a destination.',
    lotSize: { width: 16, height: 12 },
    budget: 15000,
    winConditions: [
      { type: 'min_rating', value: 75, description: 'Reach a lot rating of 75' },
      { type: 'required_ploppables', value: 1, description: 'Place at least 1 Vending Machine', ploppableType: 'Vending Machine', ploppableCount: 1 },
    ],
    vehicleSpawnIntervalMs: 3000,
    vehicleSpawnSchedule: [
      { startGameMinutes: 1080, endGameMinutes: 1260, spawnIntervalMs: 2000 }, // 18:00–21:00 evening
    ],
    pedestrianRespawnMinMs: 5000,
    pedestrianRespawnMaxMs: 15000,
    needGenerationProbability: 0.7,
    needTypeDistribution: { trash: 0.1, thirst: 0.2, toilet: 0.7 },
    driverExitsVehicleProbability: 0.2,
  },
  {
    id: 'airport-arrivals',
    name: 'Airport Arrivals',
    description: 'Manage long-term parkers and high volume at the airport lot.',
    lotSize: { width: 18, height: 14 },
    budget: 25000,
    winConditions: [
      { type: 'min_rating', value: 80, description: 'Reach a lot rating of 80' },
      { type: 'min_parking_spots', value: 15, description: 'Place at least 15 parking spots' },
      { type: 'profit', value: 2000, description: 'Earn $2000 profit' },
    ],
    vehicleSpawnIntervalMs: 2000,
    pedestrianRespawnMinMs: 8000,
    pedestrianRespawnMaxMs: 25000,
  },
];

/** Get challenge by id (from CHALLENGE_ORDER or config). */
export function getChallengeById(id: string): Challenge | undefined {
  return CHALLENGES.find(c => c.id === id);
}

/** Get challenge config in menu order (excluding dev-mode if not in config). */
export function getChallengesInOrder(): Challenge[] {
  const byId = new Map(CHALLENGES.map(c => [c.id, c]));
  return CHALLENGE_ORDER.map(id => byId.get(id)).filter((c): c is Challenge => c != null);
}
