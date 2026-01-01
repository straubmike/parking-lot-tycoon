import { Vehicle } from '@/types';
import { TimeSystem } from './TimeSystem';
import { EconomySystem } from './EconomySystem';
import { RatingSystem } from './RatingSystem';

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
  
  // Global parking rate (per 15 game minutes = 15 real-time seconds)
  // This rate applies to all parking meters and booths
  private parkingRate: number = 1; // Default $1 per 15 minutes
  
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
   * Set the global parking rate (affects all meters and booths)
   * @param rate - Rate per 15 game minutes (must be >= 1, in $1 increments)
   */
  setParkingRate(rate: number): void {
    // Ensure rate is at least $1 and in $1 increments
    this.parkingRate = Math.max(1, Math.floor(rate));
  }
  
  /**
   * Get the current parking rate
   */
  getParkingRate(): number {
    return this.parkingRate;
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
   * Calculate and collect parking fee when vehicle leaves a metered spot
   * Returns the fee amount collected
   * @param vehicleId - Vehicle ID
   * @returns Fee amount collected (in dollars)
   */
  collectMeterFee(vehicleId: string): number {
    const parkingTimeSeconds = this.parkingStartTimes.get(vehicleId) || 0;
    this.parkingStartTimes.delete(vehicleId);
    
    // Calculate fee: rate per 15 game minutes (15 real-time seconds)
    // Round up to nearest 15-second interval
    const intervals = Math.ceil(parkingTimeSeconds / 15);
    const fee = intervals * this.parkingRate;
    
    // Add money to economy
    EconomySystem.getInstance().earn(fee);
    
    // Apply negative rating if rate is too high (over $5 per 15 minutes)
    if (this.parkingRate > 5) {
      const ratingPenalty = (this.parkingRate - 5) * 2; // -2 rating per dollar over $5
      const vehicleScore = RatingSystem.getInstance().getParkerScore(vehicleId);
      if (vehicleScore !== undefined) {
        RatingSystem.getInstance().updateParkerScore(vehicleId, -ratingPenalty);
      }
    }
    
    return fee;
  }
  
  /**
   * Calculate and collect parking fee when vehicle enters booth collection tile
   * Returns the fee amount collected (0 if timer was already collected/canceled)
   * @param vehicleId - Vehicle ID
   * @returns Fee amount collected (in dollars), or 0 if timer not active
   */
  collectBoothFee(vehicleId: string): number {
    // Only collect if timer is still active (vehicle hasn't paid at meter)
    if (!this.parkingStartTimes.has(vehicleId)) {
      return 0; // Already paid at meter or timer was canceled
    }
    // Same logic as meter fee
    return this.collectMeterFee(vehicleId);
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
    this.parkingRate = 1;
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

