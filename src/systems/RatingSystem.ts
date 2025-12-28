import { TimeSystem } from './TimeSystem';
import { GridManager } from '@/core/GridManager';
import { AppealSystem } from './AppealSystem';
import { SecuritySystem } from './SecuritySystem';

/**
 * RatingSystem - Singleton that manages lot ratings based on parker satisfaction
 * 
 * Tracks parker scores throughout their lifecycle:
 * 1. registerParker() - Called when potential parker spawns
 * 2. updateParkerScore() - Called as events unfold (pedestrian activities, etc.)
 * 3. finalizeParker() - Called when parker leaves, locks score into daily totals
 * 
 * Rating is calculated at 11:59 PM and displayed at midnight
 */
export class RatingSystem {
  private static instance: RatingSystem;
  
  // Active parkers: score accumulates during their lifecycle
  // Key: vehicleId, Value: { score: number, dayRegistered: number }
  private activeParkers: Map<string, { score: number; dayRegistered: number }> = new Map();
  
  // Finalized scores for today (parkers who have left)
  private dailyFinalizedScores: number[] = [];
  
  // Current day's running average rating
  private currentRating: number = 0;
  
  // Previous day's finalized rating (displayed after midnight)
  private previousDayRating: number = 0;
  
  // Track the current day to filter parkers by day
  private currentDay: number = 0;
  
  private constructor() {}
  
  static getInstance(): RatingSystem {
    if (!RatingSystem.instance) {
      RatingSystem.instance = new RatingSystem();
    }
    return RatingSystem.instance;
  }
  
  /**
   * Register a new parker with initial score
   * Called when potential parker spawns
   * 
   * @param vehicleId - Unique vehicle ID (used to link pedestrian later)
   * @param initialScore - Starting score (100 if found spot, 0 if not)
   */
  registerParker(vehicleId: string, initialScore: number): void {
    // Get current day from TimeSystem to ensure accuracy
    const dayRegistered = TimeSystem.getInstance().getCurrentDay();
    this.activeParkers.set(vehicleId, { 
      score: initialScore, 
      dayRegistered: dayRegistered
    });
    // Update currentDay to match (in case it's out of sync)
    this.currentDay = dayRegistered;
    this.recalculateCurrentRating();
  }
  
  /**
   * Update a parker's score by adding/subtracting a delta
   * Called as events unfold during parker's lifecycle
   * 
   * @param vehicleId - Vehicle ID of the parker
   * @param scoreDelta - Amount to add (positive) or subtract (negative)
   */
  updateParkerScore(vehicleId: string, scoreDelta: number): void {
    const parkerData = this.activeParkers.get(vehicleId);
    if (parkerData !== undefined) {
      parkerData.score += scoreDelta;
      this.activeParkers.set(vehicleId, parkerData);
      this.recalculateCurrentRating();
    }
  }
  
  /**
   * Get a parker's current score
   * 
   * @param vehicleId - Vehicle ID of the parker
   * @returns Current score or undefined if not found
   */
  getParkerScore(vehicleId: string): number | undefined {
    return this.activeParkers.get(vehicleId)?.score;
  }
  
  /**
   * Finalize a parker's score when they despawn
   * Moves their score from active to finalized
   * Only finalizes parkers from the current day
   * 
   * @param vehicleId - Vehicle ID of the parker leaving
   */
  finalizeParker(vehicleId: string): void {
    const parkerData = this.activeParkers.get(vehicleId);
    if (parkerData !== undefined) {
      // Get current day from TimeSystem to ensure accuracy
      const currentDay = TimeSystem.getInstance().getCurrentDay();
      // Only finalize parkers from the current day
      if (parkerData.dayRegistered === currentDay) {
        this.dailyFinalizedScores.push(parkerData.score);
      }
      this.activeParkers.delete(vehicleId);
      this.recalculateCurrentRating();
    }
  }
  
  /**
   * Recalculate current rating based on all active and finalized scores
   * Only includes parkers from the current day
   */
  private recalculateCurrentRating(): void {
    // Get current day from TimeSystem to ensure accuracy
    const currentDay = TimeSystem.getInstance().getCurrentDay();
    this.currentDay = currentDay;
    
    // Only include active parkers registered on the current day
    const currentDayActiveScores = Array.from(this.activeParkers.values())
      .filter(parker => parker.dayRegistered === currentDay)
      .map(parker => parker.score);
    
    // Combine current day's active parker scores + finalized scores
    const allScores = [...currentDayActiveScores, ...this.dailyFinalizedScores];
    
    if (allScores.length === 0) {
      this.currentRating = 0;
      return;
    }
    
    const sum = allScores.reduce((a, b) => a + b, 0);
    this.currentRating = sum / allScores.length;
  }
  
  /**
   * Called at 11:59 PM - finalize the day's rating
   * Stores current rating as previous day rating
   * 
   * @param gridManager - Grid manager instance (optional, for composite rating)
   * @param gridWidth - Grid width (optional)
   * @param gridHeight - Grid height (optional)
   */
  finalizeDay(gridManager?: GridManager, gridWidth?: number, gridHeight?: number): void {
    if (gridManager && gridWidth !== undefined && gridHeight !== undefined) {
      // Store composite rating if grid info provided
      this.previousDayRating = this.getCompositeRating(gridManager, gridWidth, gridHeight);
    } else {
      // Store parker-only rating for backward compatibility
      this.previousDayRating = this.currentRating;
    }
  }
  
  /**
   * Called at midnight - reset for new day
   * Clears finalized scores and updates current day
   * Active parkers from previous days remain but won't be included in new day's rating
   * 
   * @param newDay - The new day number from TimeSystem
   */
  resetDailyScores(newDay: number): void {
    this.dailyFinalizedScores = [];
    this.currentDay = newDay;
    // Recalculate rating (will only include parkers from the new current day)
    this.recalculateCurrentRating();
  }
  
  /**
   * Get current day's running average rating (parker satisfaction component only, 0-100)
   */
  getCurrentRating(): number {
    return this.currentRating;
  }
  
  /**
   * Get composite rating including appeal and security components
   * Formula: 70% parker satisfaction + 15% appeal + 15% security
   * 
   * @param gridManager - Grid manager instance
   * @param gridWidth - Grid width
   * @param gridHeight - Grid height
   * @returns Composite rating (0-100)
   */
  getCompositeRating(gridManager: GridManager, gridWidth: number, gridHeight: number): number {
    const parkerRating = this.currentRating; // 0-100
    const appealContribution = AppealSystem.getInstance().getAppealContribution(gridManager, gridWidth, gridHeight);
    const securityContribution = SecuritySystem.getInstance().getSecurityContribution(gridManager, gridWidth, gridHeight);
    
    return (parkerRating * 0.70) + appealContribution + securityContribution;
  }
  
  /**
   * Get component breakdown for UI display
   * 
   * @param gridManager - Grid manager instance
   * @param gridWidth - Grid width
   * @param gridHeight - Grid height
   * @returns Object with parker, appeal, security, and total ratings
   */
  getComponentRatings(gridManager: GridManager, gridWidth: number, gridHeight: number): {
    parker: number;
    appeal: number;
    security: number;
    total: number;
  } {
    const parker = this.currentRating;
    const appeal = AppealSystem.getInstance().getAppealContribution(gridManager, gridWidth, gridHeight);
    const security = SecuritySystem.getInstance().getSecurityContribution(gridManager, gridWidth, gridHeight);
    const total = (parker * 0.70) + appeal + security;
    
    return { parker, appeal, security, total };
  }
  
  /**
   * Get previous day's finalized rating
   */
  getPreviousDayRating(): number {
    return this.previousDayRating;
  }
  
  /**
   * Get count of active parkers currently in the lot
   */
  getActiveParkerCount(): number {
    return this.activeParkers.size;
  }
  
  /**
   * Get count of finalized parkers today
   */
  getFinalizedParkerCount(): number {
    return this.dailyFinalizedScores.length;
  }
  
  /**
   * Reset rating system to initial state
   */
  reset(): void {
    this.activeParkers.clear();
    this.dailyFinalizedScores = [];
    this.currentRating = 0;
    this.previousDayRating = 0;
    this.currentDay = 0;
  }
}
