import { TimeSystem } from '@/systems/TimeSystem';
import { RatingSystem } from '@/systems/RatingSystem';
import { EconomySystem } from '@/systems/EconomySystem';
import { AppealSystem } from '@/systems/AppealSystem';
import { SafetySystem } from '@/systems/SafetySystem';
import { ParkingTimerSystem } from '@/systems/ParkingTimerSystem';
import { MessageSystem } from '@/systems/MessageSystem';
import { GridManager } from './GridManager';
import { resetParkingRateConfig } from '@/config/parkingRateConfig';

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
   * Access the AppealSystem singleton
   */
  static get appeal(): AppealSystem {
    return AppealSystem.getInstance();
  }
  
  /**
   * Access the SafetySystem singleton
   */
  static get safety(): SafetySystem {
    return SafetySystem.getInstance();
  }
  
  /**
   * Access the ParkingTimerSystem singleton
   */
  static get parkingTimer(): ParkingTimerSystem {
    return ParkingTimerSystem.getInstance();
  }
  
  /**
   * Access the MessageSystem singleton
   */
  static get messages(): MessageSystem {
    return MessageSystem.getInstance();
  }
  
  /**
   * Reset all systems for a new challenge
   * Call this when starting a new challenge or entering dev mode
   * 
   * @param initialBudget - Starting money for the challenge
   * @param gridManager - Grid manager instance (optional, for resetting appeal/safety)
   * @param gridWidth - Grid width (optional)
   * @param gridHeight - Grid height (optional)
   */
  static resetForChallenge(initialBudget: number, gridManager?: GridManager, gridWidth?: number, gridHeight?: number): void {
    this.time.reset();
    this.rating.reset();
    this.economy.reset(initialBudget);
    this.parkingTimer.reset();
    resetParkingRateConfig();
    this.messages.reset();
    if (gridManager && gridWidth !== undefined && gridHeight !== undefined) {
      this.appeal.reset(gridManager, gridWidth, gridHeight);
      this.safety.reset(gridManager, gridWidth, gridHeight);
    }
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
   * @param gridManager - Grid manager instance (optional, for composite rating calculation)
   * @param gridWidth - Grid width (optional)
   * @param gridHeight - Grid height (optional)
   */
  static update(delta: number, gridManager?: GridManager, gridWidth?: number, gridHeight?: number): void {
    this.time.update(delta);
    this.parkingTimer.update(delta);
    
    // Check for 11:59 PM rating finalization
    if (this.time.consumeRatingFinalized()) {
      this.rating.finalizeDay(gridManager, gridWidth, gridHeight);
    }
    
    // Check for midnight day change
    if (this.time.consumeDayChange()) {
      this.rating.resetDailyScores(this.time.getCurrentDay());
    }
  }
}

