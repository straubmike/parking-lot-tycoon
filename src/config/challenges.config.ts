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

/**
 * Resolve current potential-parker chance from time-of-day schedule.
 * Returns fallback when outside all windows.
 */
export function getPotentialParkerChanceForSchedule(
  totalGameMinutes: number,
  schedule: Challenge['potentialParkerSchedule'],
  fallbackChance: number = 0.5
): number {
  if (!schedule?.length) return fallbackChance;
  for (const window of schedule) {
    if (totalGameMinutes >= window.startGameMinutes && totalGameMinutes <= window.endGameMinutes) {
      return window.chance;
    }
  }
  return fallbackChance;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'dev-mode',
    name: 'Dev Mode',
    description: 'Full sandbox with all tools for testing and building.',
    lotSize: { width: 10, height: 10 },
    budget: 10000,
    startTimeMinutes: 420,
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
    maxDay: 3,
    lotSize: { width: 10, height: 12 },
    budget: 5000,
    startTimeMinutes: 420,
    initialGridPath: '/learninglot.json',
    winConditions: [
      { type: 'min_rating', value: 50, description: 'Reach a lot rating of 50' },
      { type: 'min_parking_spots', value: 3, description: 'Place at least 3 parking spots' },
    ],
    vehicleSpawnIntervalMs: 4000,
    pedestrianRespawnMinMs: 5000,
    pedestrianRespawnMaxMs: 15000,
    meterHighParkingRateThreshold: 5,
    boothHighParkingRateThreshold: 5,
    meterHighParkingRatePenaltyPerDollar: 10,
    boothHighParkingRatePenaltyPerDollar: 10,
    meterRefusalToParkThreshold: 10,
    boothRefusalToParkThreshold: 10,
    highParkingRatePenaltyMessage: "I can't believe they're charging this much to park! 😤",
    refusalToParkMessage: "There's no way I'm paying that much to park. 😤",
  },
  {
    id: 'pizza-parking-problem',
    name: 'Pizza Parking Problem',
    description: 'Hungry customers need quick free parking. Keep the lot clean or face the wrath of angry diners.',
    descriptionSubline: 'Playable grid: 5×13',
    maxDay: 5,
    lotSize: { width: 5, height: 15 },
    startTimeMinutes: 420,
    initialGridPath: '/pizzaproblem.json',
    budget: 8000,
    winConditions: [
      { type: 'min_rating', value: 60, description: 'Reach a lot rating of 60' },
      { type: 'required_ploppables', value: 1, description: 'Place at least 1 Dumpster', ploppableType: 'Dumpster', ploppableCount: 1 },
    ],
    vehicleSpawnIntervalMs: 32000, // base pass-through (quarter of original for ~24-spot lots)
    vehicleSpawnSchedule: [
      { startGameMinutes: 0,    endGameMinutes: 359,  spawnIntervalMs: 48000 }, // 12:00–5:59 AM  sparse night traffic
      { startGameMinutes: 360,  endGameMinutes: 599,  spawnIntervalMs: 20000 },  // 6:00–9:59 AM   morning commuters pass by
      { startGameMinutes: 600,  endGameMinutes: 659,  spawnIntervalMs: 16000 },  // 10:00–10:59 AM shop opens, light lunch seekers
      { startGameMinutes: 660,  endGameMinutes: 719,  spawnIntervalMs: 10000 },  // 11:00–11:59 AM sharp lunch ramp
      { startGameMinutes: 720,  endGameMinutes: 839,  spawnIntervalMs: 6000 },  // 12:00–1:59 PM  lunch peak
      { startGameMinutes: 840,  endGameMinutes: 899,  spawnIntervalMs: 12000 },  // 2:00–2:59 PM   sharp falloff
      { startGameMinutes: 900,  endGameMinutes: 959,  spawnIntervalMs: 20000 },  // 3:00–3:59 PM   lull between rushes
      { startGameMinutes: 960,  endGameMinutes: 1139, spawnIntervalMs: 6000 },  // 4:00–6:59 PM   dinner peak
      { startGameMinutes: 1140, endGameMinutes: 1199, spawnIntervalMs: 10000 },  // 7:00–7:59 PM   gradual falloff
      { startGameMinutes: 1200, endGameMinutes: 1259, spawnIntervalMs: 16000 },  // 8:00–8:59 PM   trailing off
      { startGameMinutes: 1260, endGameMinutes: 1319, spawnIntervalMs: 24000 }, // 9:00–9:59 PM   last stragglers
      { startGameMinutes: 1320, endGameMinutes: 1439, spawnIntervalMs: 32000 },  // 10:00–11:59 PM closing traffic
    ],
    potentialParkerChance: 0, // fallback: pass-through only (shop closed hours)
    potentialParkerSchedule: [
      { startGameMinutes: 600,  endGameMinutes: 659,  chance: 0.4 },  // 10:00–10:59 AM
      { startGameMinutes: 660,  endGameMinutes: 719,  chance: 0.6 },  // 11:00–11:59 AM
      { startGameMinutes: 720,  endGameMinutes: 839,  chance: 0.8 },  // 12:00–1:59 PM  lunch peak
      { startGameMinutes: 840,  endGameMinutes: 899,  chance: 0.5 },  // 2:00–2:59 PM
      { startGameMinutes: 900,  endGameMinutes: 959,  chance: 0.3 },  // 3:00–3:59 PM
      { startGameMinutes: 960,  endGameMinutes: 1139, chance: 0.8 },  // 4:00–6:59 PM   dinner peak
      { startGameMinutes: 1140, endGameMinutes: 1199, chance: 0.6 },  // 7:00–7:59 PM
      { startGameMinutes: 1200, endGameMinutes: 1259, chance: 0.4 },  // 8:00–8:59 PM
      { startGameMinutes: 1260, endGameMinutes: 1319, chance: 0.2 },  // 9:00–9:59 PM
    ],
    pedestrianRespawnMinMs: 5000,   // 5 game min (quick pickup)
    pedestrianRespawnMaxMs: 45000, // 45 game min (dine-in)
    needGenerationProbability: 0.55,
    needTypeDistribution: { trash: 0.9, thirst: 0, toilet: 0.1 },
    meterHighParkingRateThreshold: 1,
    boothHighParkingRateThreshold: 1,
    meterHighParkingRatePenaltyPerDollar: 10,
    boothHighParkingRatePenaltyPerDollar: 10,
    meterRefusalToParkThreshold: 2,
    boothRefusalToParkThreshold: 1,
    highParkingRatePenaltyMessage: "I gotta pay to park here? 😤",
    refusalToParkMessage: "I'll eat somewhere else if I gotta pay to park. 😤",
  },
  {
    id: 'rush-hour-roundabout',
    name: 'Rush Hour Roundabout',
    description: 'Commuters flood the lot every morning and park all day. Capitalize on long stays with smart pricing.',
    descriptionSubline: 'Playable grid: 12×12',
    maxDay: 5,
    lotSize: { width: 14, height: 14 },
    startTimeMinutes: 420,
    budget: 12000,
    winConditions: [
      { type: 'min_rating', value: 70, description: 'Reach a lot rating of 70' },
      { type: 'min_parking_spots', value: 8, description: 'Place at least 8 parking spots' },
      { type: 'profit', value: 800, description: 'Earn $800 profit' },
    ],
    vehicleSpawnIntervalMs: 2500,
    pedestrianRespawnMinMs: 6000,
    pedestrianRespawnMaxMs: 18000,
    meterHighParkingRateThreshold: 3,
    boothHighParkingRateThreshold: 3,
    meterHighParkingRatePenaltyPerDollar: 10,
    boothHighParkingRatePenaltyPerDollar: 10,
    meterRefusalToParkThreshold: 6,
    boothRefusalToParkThreshold: 6,
    highParkingRatePenaltyMessage: "Woah, expensive parking! 😤",
    refusalToParkMessage: "I'd rather be late than pay that much to park. 😤",
  },
  {
    id: 'drive-in-disaster',
    name: 'Drive-In Disaster',
    description: 'Movie night brings a rush of parkers on a strict schedule. Design the perfect lot or lose the crowd.',
    descriptionSubline: 'Playable grid: 14×10',
    maxDay: 5,
    lotSize: { width: 16, height: 12 },
    startTimeMinutes: 420,
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
    meterHighParkingRateThreshold: 0, // any meter rate = penalty (effectively)
    meterHighParkingRatePenaltyPerDollar: 10,
    boothHighParkingRateThreshold: 4,
    boothHighParkingRatePenaltyPerDollar: 10,
    meterRefusalToParkThreshold: 1, // any meter rate = instant refusal
    boothRefusalToParkThreshold: 6,
    highParkingRatePenaltyMessage: "This was more expensive than a normal movie. 😤",
    refusalToParkMessage: "This movie is too expensive. Let's go somewhere else. 😤",
  },
  {
    id: 'airport-arrivals',
    name: 'Airport Arrivals',
    description: 'Travelers need long-term parking at high volume. Meters won\'t cut it here -- think big.',
    descriptionSubline: 'Playable grid: 16×12',
    maxDay: 7,
    lotSize: { width: 18, height: 14 },
    startTimeMinutes: 420,
    budget: 25000,
    winConditions: [
      { type: 'min_rating', value: 80, description: 'Reach a lot rating of 80' },
      { type: 'min_parking_spots', value: 15, description: 'Place at least 15 parking spots' },
      { type: 'profit', value: 2000, description: 'Earn $2000 profit' },
    ],
    vehicleSpawnIntervalMs: 2000,
    pedestrianRespawnMinMs: 8000,
    pedestrianRespawnMaxMs: 25000,
    meterHighParkingRateThreshold: 0, // any meter = penalty
    boothHighParkingRateThreshold: 1,
    meterHighParkingRatePenaltyPerDollar: 10,
    boothHighParkingRatePenaltyPerDollar: 10,
    meterRefusalToParkThreshold: 1, // any meter = instant refusal
    boothRefusalToParkThreshold: 5,
    highParkingRatePenaltyMessage: "Airport parking really robs you. . . 😤",
    meterRefusalToParkMessage: "A meter? At an airport? I can't do that! 😤",
    boothRefusalToParkMessage: "I need to park for a long time. This rate is unacceptable. 😤",
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
