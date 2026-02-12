import { EconomySystem } from './EconomySystem';
import { RatingSystem } from './RatingSystem';
import { MessageSystem } from './MessageSystem';
import { getParkingRateConfig } from '@/config/parkingRateConfig';

/**
 * ParkingTimerSystem - Singleton that tracks parking time and collects fees
 * 
 * Tracks when vehicles park and calculates parking fees when they leave.
 * Supports both parking meters (charge when leaving spot) and parking booths (charge when entering collection tile).
 */
export class ParkingTimerSystem {
  private static instance: ParkingTimerSystem;
  
  // Track parking start time for each vehicle
  // Key: vehicleId, Value: parking start time (real-time seconds)
  private parkingStartTimes: Map<string, number> = new Map();
  
  // Separate rates for meters (pay-at-spot) vs booths (pay-at-exit)
  private meterParkingRate: number = 1;
  private boothParkingRate: number = 1;
  
  // High-rate penalty: when parkingRate exceeds threshold, parkers lose rating
  // Separate for meters (pay-at-spot) vs booths (pay-at-exit)
  private meterHighParkingRateThreshold: number = 5;
  private meterHighParkingRatePenaltyPerDollar: number = 2;
  private boothHighParkingRateThreshold: number = 5;
  private boothHighParkingRatePenaltyPerDollar: number = 2;
  
  // Track total real-time elapsed for fee calculation
  private realTimeElapsed: number = 0;
  
  private constructor() {}
  
  static getInstance(): ParkingTimerSystem {
    if (!ParkingTimerSystem.instance) {
      ParkingTimerSystem.instance = new ParkingTimerSystem();
    }
    return ParkingTimerSystem.instance;
  }
  
  /**
   * Set the meter parking rate (pay-at-spot).
   * @param rate - Rate per 15 game minutes (must be >= 1, in $1 increments)
   */
  setMeterParkingRate(rate: number): void {
    this.meterParkingRate = Math.max(1, Math.floor(rate));
  }

  /**
   * Set the booth parking rate (pay-at-exit).
   * @param rate - Rate per 15 game minutes (must be >= 1, in $1 increments)
   */
  setBoothParkingRate(rate: number): void {
    this.boothParkingRate = Math.max(1, Math.floor(rate));
  }

  /**
   * Get the meter parking rate
   */
  getMeterParkingRate(): number {
    return this.meterParkingRate;
  }

  /**
   * Get the booth parking rate
   */
  getBoothParkingRate(): number {
    return this.boothParkingRate;
  }

  /** @deprecated Use setMeterParkingRate/setBoothParkingRate. Sets both to the same value. */
  setParkingRate(rate: number): void {
    const r = Math.max(1, Math.floor(rate));
    this.meterParkingRate = r;
    this.boothParkingRate = r;
  }

  /** @deprecated Use getMeterParkingRate/getBoothParkingRate. Returns meter rate. */
  getParkingRate(): number {
    return this.meterParkingRate;
  }

  /**
   * Set high-rate penalty for METER payments (pay-at-spot).
   * @param threshold - Dollar per 15 min above which penalty applies
   * @param penaltyPerDollar - Rating points to subtract per $ over threshold (0 = no penalty)
   */
  setMeterHighRatePenalty(threshold: number, penaltyPerDollar: number): void {
    this.meterHighParkingRateThreshold = Math.max(0, threshold);
    this.meterHighParkingRatePenaltyPerDollar = Math.max(0, penaltyPerDollar);
  }

  /**
   * Set high-rate penalty for BOOTH payments (pay-at-exit).
   * @param threshold - Dollar per 15 min above which penalty applies
   * @param penaltyPerDollar - Rating points to subtract per $ over threshold (0 = no penalty)
   */
  setBoothHighRatePenalty(threshold: number, penaltyPerDollar: number): void {
    this.boothHighParkingRateThreshold = Math.max(0, threshold);
    this.boothHighParkingRatePenaltyPerDollar = Math.max(0, penaltyPerDollar);
  }

  /** @deprecated Use setMeterHighRatePenalty/setBoothHighRatePenalty. Sets both to the same value. */
  setHighParkingRateThreshold(threshold: number): void {
    this.meterHighParkingRateThreshold = this.boothHighParkingRateThreshold = Math.max(0, threshold);
  }

  /** @deprecated Use setMeterHighRatePenalty/setBoothHighRatePenalty. Sets both to the same value. */
  setHighParkingRatePenaltyPerDollar(penalty: number): void {
    this.meterHighParkingRatePenaltyPerDollar = this.boothHighParkingRatePenaltyPerDollar = Math.max(0, penalty);
  }
  
  /**
   * Start tracking parking time for a vehicle
   * Called when a vehicle parks
   * @param vehicleId - Vehicle ID
   */
  startParkingTimer(vehicleId: string): void {
    this.parkingStartTimes.set(vehicleId, 0); // Start at 0, will be incremented
  }
  
  /**
   * Update parking timers
   * Called from game update loop
   * @param delta - Real time elapsed in milliseconds
   */
  update(delta: number): void {
    this.realTimeElapsed += delta / 1000; // Convert to seconds
    
    // Increment all active parking timers by delta (in seconds)
    for (const [vehicleId] of this.parkingStartTimes) {
      const currentTime = this.parkingStartTimes.get(vehicleId) || 0;
      this.parkingStartTimes.set(vehicleId, currentTime + (delta / 1000));
    }
  }
  
  /**
   * Calculate and collect parking fee when vehicle leaves a metered spot.
   */
  collectMeterFee(vehicleId: string, parkerName?: string): number {
    const { fee, vehicleId: vid } = this.calculateAndCollectFee(vehicleId, 'meter');
    this.applyHighRatePenalty(
      vid,
      this.meterParkingRate,
      this.meterHighParkingRateThreshold,
      this.meterHighParkingRatePenaltyPerDollar,
      parkerName
    );
    return fee;
  }

  /**
   * Calculate and collect parking fee when vehicle enters booth collection tile.
   * Applies booth-specific high-rate penalty if applicable. Returns 0 if timer was already collected.
   */
  collectBoothFee(vehicleId: string, parkerName?: string): number {
    if (!this.parkingStartTimes.has(vehicleId)) return 0;
    const { fee, vehicleId: vid } = this.calculateAndCollectFee(vehicleId, 'booth');
    this.applyHighRatePenalty(
      vid,
      this.boothParkingRate,
      this.boothHighParkingRateThreshold,
      this.boothHighParkingRatePenaltyPerDollar,
      parkerName
    );
    return fee;
  }

  private calculateAndCollectFee(
    vehicleId: string,
    paymentType: 'meter' | 'booth'
  ): { fee: number; vehicleId: string } {
    const parkingTimeSeconds = this.parkingStartTimes.get(vehicleId) || 0;
    this.parkingStartTimes.delete(vehicleId);
    const intervals = Math.ceil(parkingTimeSeconds / 15);
    const rate = paymentType === 'meter' ? this.meterParkingRate : this.boothParkingRate;
    const fee = intervals * rate;
    EconomySystem.getInstance().earn(fee);
    return { fee, vehicleId };
  }

  private applyHighRatePenalty(
    vehicleId: string,
    parkingRate: number,
    threshold: number,
    penaltyPerDollar: number,
    parkerName?: string
  ): void {
    if (penaltyPerDollar <= 0 || parkingRate <= threshold) return;
    const ratingPenalty = (parkingRate - threshold) * penaltyPerDollar;
    const vehicleScore = RatingSystem.getInstance().getParkerScore(vehicleId);
    if (vehicleScore !== undefined) {
      RatingSystem.getInstance().updateParkerScore(vehicleId, -ratingPenalty);
      if (parkerName) {
        const msg = getParkingRateConfig().penaltyMessage;
        MessageSystem.getInstance().addParkerReaction(parkerName, msg, '');
      }
    }
  }
  
  /**
   * Cancel parking timer (vehicle left without paying, or other reason)
   * @param vehicleId - Vehicle ID
   */
  cancelParkingTimer(vehicleId: string): void {
    this.parkingStartTimes.delete(vehicleId);
  }
  
  /**
   * Reset the system
   */
  reset(): void {
    this.parkingStartTimes.clear();
    this.meterParkingRate = 1;
    this.boothParkingRate = 1;
    this.meterHighParkingRateThreshold = 5;
    this.meterHighParkingRatePenaltyPerDollar = 2;
    this.boothHighParkingRateThreshold = 5;
    this.boothHighParkingRatePenaltyPerDollar = 2;
    this.realTimeElapsed = 0;
  }
  
  /**
   * Get parking time for a vehicle (in seconds)
   * @param vehicleId - Vehicle ID
   * @returns Parking time in seconds, or 0 if not found
   */
  getParkingTime(vehicleId: string): number {
    return this.parkingStartTimes.get(vehicleId) || 0;
  }
}

