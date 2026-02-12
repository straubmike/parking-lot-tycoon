/**
 * Runtime parking rate config - populated by ChallengeScene, read by VehicleSystem and ParkingTimerSystem.
 * Used for refusal-to-park thresholds and penalty/refusal messages.
 */
export interface ParkingRateConfigValues {
  meterThreshold: number;
  boothThreshold: number;
  meterPenalty: number;
  boothPenalty: number;
  meterRefusalThreshold: number;
  boothRefusalThreshold: number;
  penaltyMessage: string;
  refusalMessage: string;
  meterRefusalMessage: string | null;
  boothRefusalMessage: string | null;
  meterAndBoothRefusalMessage: string;
}

const DEFAULT_CONFIG: ParkingRateConfigValues = {
  meterThreshold: 5,
  boothThreshold: 5,
  meterPenalty: 10,
  boothPenalty: 10,
  meterRefusalThreshold: 10,
  boothRefusalThreshold: 10,
  penaltyMessage: "I can't believe they're charging this much to park! 😤",
  refusalMessage: "There's no way I'm paying that much to park. 😤",
  meterRefusalMessage: null,
  boothRefusalMessage: null,
  meterAndBoothRefusalMessage: "Metered spots AND a parking booth? No thanks!",
};

let currentConfig: ParkingRateConfigValues = { ...DEFAULT_CONFIG };

export function setParkingRateConfig(overrides: Partial<ParkingRateConfigValues>): void {
  currentConfig = { ...currentConfig, ...overrides };
}

export function getParkingRateConfig(): Readonly<ParkingRateConfigValues> {
  return currentConfig;
}

export function resetParkingRateConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}
