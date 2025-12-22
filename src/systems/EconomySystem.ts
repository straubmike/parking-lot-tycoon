/**
 * EconomySystem - Singleton that manages game budget/money
 * 
 * Tracks player's money:
 * - Decrements when ploppables are placed
 * - Increments when parking fees are collected (future)
 */
export class EconomySystem {
  private static instance: EconomySystem;
  private money: number = 0;
  
  private constructor() {}
  
  static getInstance(): EconomySystem {
    if (!EconomySystem.instance) {
      EconomySystem.instance = new EconomySystem();
    }
    return EconomySystem.instance;
  }
  
  /**
   * Get current money amount
   */
  getMoney(): number {
    return this.money;
  }
  
  /**
   * Check if player can afford a purchase
   * 
   * @param amount - Amount to check
   * @returns true if money >= amount
   */
  canAfford(amount: number): boolean {
    return this.money >= amount;
  }
  
  /**
   * Spend money on a purchase
   * 
   * @param amount - Amount to spend
   * @returns true if successful, false if insufficient funds
   */
  spend(amount: number): boolean {
    if (this.canAfford(amount)) {
      this.money -= amount;
      return true;
    }
    return false;
  }
  
  /**
   * Earn money (from parking fees, etc.)
   * 
   * @param amount - Amount to add
   */
  earn(amount: number): void {
    this.money += amount;
  }
  
  /**
   * Reset economy to initial budget for a new challenge
   * 
   * @param initialBudget - Starting money amount
   */
  reset(initialBudget: number): void {
    this.money = initialBudget;
  }
}
