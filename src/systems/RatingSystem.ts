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
  // Key: vehicleId, Value: running score
  private activeParkers: Map<string, number> = new Map();
  
  // Finalized scores for today (parkers who have left)
  private dailyFinalizedScores: number[] = [];
  
  // Current day's running average rating
  private currentRating: number = 0;
  
  // Previous day's finalized rating (displayed after midnight)
  private previousDayRating: number = 0;
  
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
    this.activeParkers.set(vehicleId, initialScore);
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
    const currentScore = this.activeParkers.get(vehicleId);
    if (currentScore !== undefined) {
      this.activeParkers.set(vehicleId, currentScore + scoreDelta);
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
    return this.activeParkers.get(vehicleId);
  }
  
  /**
   * Finalize a parker's score when they despawn
   * Moves their score from active to finalized
   * 
   * @param vehicleId - Vehicle ID of the parker leaving
   */
  finalizeParker(vehicleId: string): void {
    const finalScore = this.activeParkers.get(vehicleId);
    if (finalScore !== undefined) {
      this.dailyFinalizedScores.push(finalScore);
      this.activeParkers.delete(vehicleId);
      this.recalculateCurrentRating();
    }
  }
  
  /**
   * Recalculate current rating based on all active and finalized scores
   */
  private recalculateCurrentRating(): void {
    // Combine active parker scores + finalized scores
    const activeScores = Array.from(this.activeParkers.values());
    const allScores = [...activeScores, ...this.dailyFinalizedScores];
    
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
   */
  finalizeDay(): void {
    this.previousDayRating = this.currentRating;
  }
  
  /**
   * Called at midnight - reset for new day
   * Note: Active parkers carry over (they're still in the lot)
   */
  resetDailyScores(): void {
    this.dailyFinalizedScores = [];
    // Active parkers remain - they contribute to the new day
    this.recalculateCurrentRating();
  }
  
  /**
   * Get current day's running average rating
   */
  getCurrentRating(): number {
    return this.currentRating;
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
  }
}
