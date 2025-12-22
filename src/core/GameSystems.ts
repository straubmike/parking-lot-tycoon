import { TimeSystem } from '@/systems/TimeSystem';
import { RatingSystem } from '@/systems/RatingSystem';
import { EconomySystem } from '@/systems/EconomySystem';

/**
 * GameSystems - Central access point for all game systems
 * 
 * Provides static accessors to singleton system instances.
 * All scenes (DevModeScene, ChallengeScenes, etc.) access systems through this facade.
 */
export class GameSystems {
  /**
   * Access the TimeSystem singleton
   */
  static get time(): TimeSystem {
    return TimeSystem.getInstance();
  }
  
  /**
   * Access the RatingSystem singleton
   */
  static get rating(): RatingSystem {
    return RatingSystem.getInstance();
  }
  
  /**
   * Access the EconomySystem singleton
   */
  static get economy(): EconomySystem {
    return EconomySystem.getInstance();
  }
  
  /**
   * Reset all systems for a new challenge
   * Call this when starting a new challenge or entering dev mode
   * 
   * @param initialBudget - Starting money for the challenge
   */
  static resetForChallenge(initialBudget: number): void {
    this.time.reset();
    this.rating.reset();
    this.economy.reset(initialBudget);
  }
  
  /**
   * Update time-based systems
   * Call this from scene update loop with the delta time
   * 
   * Handles:
   * - Advancing game time
   * - Triggering rating finalization at 11:59 PM
   * - Triggering daily reset at midnight
   * 
   * @param delta - Time elapsed since last frame in milliseconds
   */
  static update(delta: number): void {
    this.time.update(delta);
    
    // Check for 11:59 PM rating finalization
    if (this.time.consumeRatingFinalized()) {
      this.rating.finalizeDay();
    }
    
    // Check for midnight day change
    if (this.time.consumeDayChange()) {
      this.rating.resetDailyScores();
    }
  }
}

