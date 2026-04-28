import { Challenge } from '@/types';
import { CHALLENGE_ORDER, isDevChallengeEnabled } from '@/managers/ProgressManager';

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
    vehicleSpawnIntervalMs: 6000,
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
    vehicleSpawnIntervalMs: 8000,
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
    vehicleSpawnIntervalMs: 64000, // base pass-through (half of previous tuning for uniform lower traffic)
    vehicleSpawnSchedule: [
      { startGameMinutes: 0,    endGameMinutes: 359,  spawnIntervalMs: 96000 }, // 12:00–5:59 AM  sparse night traffic
      { startGameMinutes: 360,  endGameMinutes: 599,  spawnIntervalMs: 40000 },  // 6:00–9:59 AM   morning commuters pass by
      { startGameMinutes: 600,  endGameMinutes: 659,  spawnIntervalMs: 32000 },  // 10:00–10:59 AM shop opens, light lunch seekers
      { startGameMinutes: 660,  endGameMinutes: 719,  spawnIntervalMs: 20000 },  // 11:00–11:59 AM sharp lunch ramp
      { startGameMinutes: 720,  endGameMinutes: 839,  spawnIntervalMs: 12000 },  // 12:00–1:59 PM  lunch peak
      { startGameMinutes: 840,  endGameMinutes: 899,  spawnIntervalMs: 24000 },  // 2:00–2:59 PM   sharp falloff
      { startGameMinutes: 900,  endGameMinutes: 959,  spawnIntervalMs: 40000 },  // 3:00–3:59 PM   lull between rushes
      { startGameMinutes: 960,  endGameMinutes: 1139, spawnIntervalMs: 12000 },  // 4:00–6:59 PM   dinner peak
      { startGameMinutes: 1140, endGameMinutes: 1199, spawnIntervalMs: 20000 },  // 7:00–7:59 PM   gradual falloff
      { startGameMinutes: 1200, endGameMinutes: 1259, spawnIntervalMs: 32000 },  // 8:00–8:59 PM   trailing off
      { startGameMinutes: 1260, endGameMinutes: 1319, spawnIntervalMs: 48000 }, // 9:00–9:59 PM   last stragglers
      { startGameMinutes: 1320, endGameMinutes: 1439, spawnIntervalMs: 64000 },  // 10:00–11:59 PM closing traffic
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
    descriptionSubline: 'Playable grid: 13×13',
    maxDay: 5,
    lotSize: { width: 15, height: 15 },
    startTimeMinutes: 300, // 5:00 AM — player sees the full morning commute ramp
    initialGridPath: '/rushhour.json',
    budget: 12000,
    winConditions: [
      { type: 'min_rating', value: 70, description: 'Reach a lot rating of 70' },
      { type: 'min_parking_spots', value: 20, description: 'Place at least 20 parking spots' },
      { type: 'profit', value: 500, description: 'Earn $500 profit (budget $12,500)' },
    ],
    vehicleSpawnIntervalMs: 10000, // middling baseline; overridden by the commute schedule below
    vehicleSpawnSchedule: [
      { startGameMinutes: 0,    endGameMinutes: 359,  spawnIntervalMs: 60000 }, // 12:00–5:59 AM  sparse night traffic
      { startGameMinutes: 360,  endGameMinutes: 419,  spawnIntervalMs: 20000 }, // 6:00–6:59 AM   dawn, first movers
      { startGameMinutes: 420,  endGameMinutes: 479,  spawnIntervalMs: 8000 },  // 7:00–7:59 AM   commute ramp
      { startGameMinutes: 480,  endGameMinutes: 539,  spawnIntervalMs: 4000 },  // 8:00–8:59 AM   morning peak
      { startGameMinutes: 540,  endGameMinutes: 599,  spawnIntervalMs: 8000 },  // 9:00–9:59 AM   late arrivals tapering
      { startGameMinutes: 600,  endGameMinutes: 1199, spawnIntervalMs: 10000 }, // 10:00 AM–7:59 PM middling midday + evening
      { startGameMinutes: 1200, endGameMinutes: 1319, spawnIntervalMs: 20000 }, // 8:00–9:59 PM   evening winding down
      { startGameMinutes: 1320, endGameMinutes: 1439, spawnIntervalMs: 40000 }, // 10:00–11:59 PM quiet late traffic
    ],
    potentialParkerChance: 0.05, // fallback outside commute hours: almost nobody new parks here
    potentialParkerSchedule: [
      { startGameMinutes: 360, endGameMinutes: 419, chance: 0.2 },  // 6:00–6:59 AM   early-bird commuters
      { startGameMinutes: 420, endGameMinutes: 479, chance: 0.55 }, // 7:00–7:59 AM   commute ramp
      { startGameMinutes: 480, endGameMinutes: 539, chance: 0.85 }, // 8:00–8:59 AM   morning peak
      { startGameMinutes: 540, endGameMinutes: 599, chance: 0.35 }, // 9:00–9:59 AM   stragglers
    ],
    pedestrianRespawnMinMs: 450000, // 7.5 game hours — fallback if bands ignored
    pedestrianRespawnMaxMs: 540000, // 9 game hours
    pedestrianRespawnBands: [
      // Commuters: off-screen for a ~1.5-hour window centred on 8 game hours.
      // Someone who parks at 8 AM will return between 3:30 PM and 5:00 PM.
      { weight: 0.9, minMs: 450000, maxMs: 540000 },
      // Occasional short visitor (errand / meeting, not a full workday)
      { weight: 0.1, minMs: 120000, maxMs: 240000 },
    ],
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
    descriptionSubline: 'Playable grid: 18×12',
    maxDay: 5,
    lotSize: { width: 18, height: 14 },
    startTimeMinutes: 960, // 4:00 PM — player sees both showtime ramps
    initialGridPath: '/drivein.json',
    budget: 15000,
    winConditions: [
      { type: 'min_rating', value: 75, description: 'Reach a lot rating of 75' },
      { type: 'min_parking_spots', value: 30, description: 'Place at least 30 parking spots' },
      { type: 'required_ploppables', value: 2, description: 'Place at least 2 Lotty Potties', ploppableType: 'Portable Toilet', ploppableCount: 2 },
      { type: 'required_ploppables', value: 2, description: 'Place at least 2 Lot Pops', ploppableType: 'Vending Machine', ploppableCount: 2 },
      { type: 'required_ploppables', value: 2, description: 'Place at least 2 Dumpsters', ploppableType: 'Dumpster', ploppableCount: 2 },
    ],
    // All parked cars face the top-left so the (unrendered) movie screen sits in front of them.
    lockedParkingSpotOrientation: 3,
    // Movie-goers who can't find a toilet bail on the show — drive to the exit with rating = 0.
    unfulfilledToiletEndsStay: true,
    // Traffic: quiet during the day, rush windows before each show (dense parker arrivals), and a
    // thin passerby trickle while movies are playing. Parker chance is ~1 during rushes so nearly
    // every car in the ramp is a movie-goer.
    vehicleSpawnIntervalMs: 40000,
    vehicleSpawnSchedule: [
      { startGameMinutes: 0,    endGameMinutes: 1019, spawnIntervalMs: 40000 }, // 12:00 AM–4:59 PM quiet daytime
      { startGameMinutes: 1020, endGameMinutes: 1079, spawnIntervalMs: 2500 },  // 5:00–5:59 PM    pre-show 1 rush
      { startGameMinutes: 1080, endGameMinutes: 1199, spawnIntervalMs: 25000 }, // 6:00–7:59 PM    show 1 (thin passerby)
      { startGameMinutes: 1200, endGameMinutes: 1259, spawnIntervalMs: 2500 },  // 8:00–8:59 PM    pre-show 2 rush
      { startGameMinutes: 1260, endGameMinutes: 1379, spawnIntervalMs: 25000 }, // 9:00–10:59 PM   show 2 (thin passerby)
      { startGameMinutes: 1380, endGameMinutes: 1439, spawnIntervalMs: 40000 }, // 11:00–11:59 PM  back to quiet
    ],
    // Potential parkers: ZERO during downtime (fallback 0). During rush windows chance is near 1,
    // so the ratio of parkers to total traffic is ~1 — the ramp IS the rush. Latecomer shoulder
    // still loses a few to passerby so the lot doesn't feel artificially synchronous.
    potentialParkerChance: 0,
    potentialParkerSchedule: [
      { startGameMinutes: 1020, endGameMinutes: 1049, chance: 0.95 }, // 5:00–5:29 PM   early arrivals for 6 PM show
      { startGameMinutes: 1050, endGameMinutes: 1079, chance: 1.0 },  // 5:30–5:59 PM   peak arrivals
      { startGameMinutes: 1080, endGameMinutes: 1094, chance: 0.85 }, // 6:00–6:14 PM   latecomers
      { startGameMinutes: 1200, endGameMinutes: 1229, chance: 0.95 }, // 8:00–8:29 PM   early arrivals for 9 PM show
      { startGameMinutes: 1230, endGameMinutes: 1259, chance: 1.0 },  // 8:30–8:59 PM   peak arrivals
      { startGameMinutes: 1260, endGameMinutes: 1274, chance: 0.85 }, // 9:00–9:14 PM   latecomers
    ],
    // Movie-goer parking is ANCHORED to showtime ends rather than a flat per-parker timer. A parker
    // arriving at 5:00 PM for the 6–8 PM show stays until ~8 PM (3 hours). A parker arriving at
    // 5:55 PM stays ~2 hours. This guarantees most parkers see the full movie even if they arrive
    // during the pre-show ramp. parkingDurationMinMs/MaxMs are kept as a safe fallback (unused
    // when `showtimeEnds` is set).
    showtimeEnds: [1200, 1380], // 8:00 PM end of show 1; 11:00 PM end of show 2
    showtimeLeaveVarianceMs: 2000, // up to 2 game-min past the end so cars stagger out (1 game-min = 1 real-sec = 1000 ms)
    parkingDurationMinMs: 120000,
    parkingDurationMaxMs: 122000,
    // Drivers never leave their cars on a destination trip. Need trips are fired from the
    // movie-goer schedule below.
    driverExitsVehicleProbability: 0,
    movieGoerMode: true,
    // Per-vehicle need trip scheduling: VehicleSystem rolls 0/1/2 events per parker and fires them
    // at random points within the parking window. When an event fires, a ped is spawned with one
    // of these need types picked by weight (no secondary probability gate), walks to a ploppable,
    // and returns to the car.
    needGenerationProbability: 1,
    needTypeDistribution: { trash: 0.2, thirst: 0.3, toilet: 0.5 },
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
    description: 'The airport wants to repurpose a culvert and travelers need long-term parking at high volume. Meters won\'t cut it here -- think big.',
    descriptionSubline: 'Playable grid: 24×15',
    maxDay: 7,
    lotSize: { width: 24, height: 18 },
    startTimeMinutes: 420,
    initialGridPath: '/airport.json',
    budget: 30000,
    winConditions: [
      { type: 'min_rating', value: 80, description: 'Reach a lot rating of 80' },
      { type: 'min_parking_spots', value: 50, description: 'Place at least 50 parking spots' },
      { type: 'profit', value: 8000, description: 'Earn $8000 profit' },
    ],
    // Airport billing: charge per hour (instead of per 15 min) to better fit long-stay parking.
    meterBillingIntervalMinutes: 60,
    boothBillingIntervalMinutes: 60,
    // Traffic shape resembles RHR (night quiet, morning ramp, midday plateau, evening taper) but
    // elevated throughout — airports don't really sleep. Baseline is overridden by the schedule.
    vehicleSpawnIntervalMs: 4000,
    vehicleSpawnSchedule: [
      { startGameMinutes: 0,    endGameMinutes: 299,  spawnIntervalMs: 12000 }, // 12:00–4:59 AM   red-eye trickle
      { startGameMinutes: 300,  endGameMinutes: 419,  spawnIntervalMs: 8000 },  // 5:00–6:59 AM   pre-dawn ramp
      { startGameMinutes: 420,  endGameMinutes: 539,  spawnIntervalMs: 5000 },  // 7:00–8:59 AM   morning travel rush
      { startGameMinutes: 540,  endGameMinutes: 959,  spawnIntervalMs: 4000 },  // 9:00 AM–3:59 PM midday plateau (busy)
      { startGameMinutes: 960,  endGameMinutes: 1199, spawnIntervalMs: 3500 },  // 4:00–7:59 PM   evening peak
      { startGameMinutes: 1200, endGameMinutes: 1319, spawnIntervalMs: 5000 },  // 8:00–9:59 PM   evening winding down
      { startGameMinutes: 1320, endGameMinutes: 1439, spawnIntervalMs: 8000 },  // 10:00–11:59 PM late-night tail
    ],
    // Potential-parker ratio is fairly uniform day-to-day — travelers park around the clock. The
    // gentle curve peaks in the evening and dips a bit during the red-eye window.
    potentialParkerChance: 0.6, // fallback if no schedule window matches
    potentialParkerSchedule: [
      { startGameMinutes: 0,    endGameMinutes: 299,  chance: 0.35 }, // 12:00–4:59 AM  red-eye slow
      { startGameMinutes: 300,  endGameMinutes: 419,  chance: 0.5 },  // 5:00–6:59 AM   pre-dawn
      { startGameMinutes: 420,  endGameMinutes: 659,  chance: 0.7 },  // 7:00–10:59 AM  morning rush
      { startGameMinutes: 660,  endGameMinutes: 959,  chance: 0.65 }, // 11:00 AM–3:59 PM midday plateau
      { startGameMinutes: 960,  endGameMinutes: 1199, chance: 0.75 }, // 4:00–7:59 PM   evening peak
      { startGameMinutes: 1200, endGameMinutes: 1319, chance: 0.6 },  // 8:00–9:59 PM   late evening
      { startGameMinutes: 1320, endGameMinutes: 1439, chance: 0.4 },  // 10:00–11:59 PM night winding down
    ],
    // Travelers leave their cars behind for actual trips: 1 to 5 in-game days off-screen.
    // At 1 game-min = 1 real-sec, 1 day = 1,440,000 ms and 5 days = 7,200,000 ms.
    pedestrianRespawnMinMs: 1440000,
    pedestrianRespawnMaxMs: 7200000,
    // Lot fills up with long-stay travelers; overflow parkers silently divert to another lot
    // instead of tanking the rating and flooding the message panel.
    suppressNoSpotPenalty: true,
    meterHighParkingRateThreshold: 0, // any meter = penalty
    boothHighParkingRateThreshold: 2, // $2/hour tolerated; penalty begins at $3/hour
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

/**
 * Get challenge config in menu order. Dev Mode is excluded unless the
 * dev-challenge gate is enabled (see `isDevChallengeEnabled`).
 */
export function getChallengesInOrder(): Challenge[] {
  const byId = new Map(CHALLENGES.map(c => [c.id, c]));
  const devOn = isDevChallengeEnabled();
  return CHALLENGE_ORDER
    .filter(id => devOn || id !== 'dev-mode')
    .map(id => byId.get(id))
    .filter((c): c is Challenge => c != null);
}
