/**
 * Global game state (optional legacy/overlay).
 * Challenge progress and unlocks are persisted via ProgressManager (localStorage).
 * Money and rating are held by EconomySystem and RatingSystem.
 */
export class GameState {
  private static currentChallenge: string | null = null;
  private static money: number = 0;
  private static rating: number = 0;

  static setCurrentChallenge(challengeId: string | null): void {
    this.currentChallenge = challengeId;
  }

  static getCurrentChallenge(): string | null {
    return this.currentChallenge;
  }

  static setMoney(amount: number): void {
    this.money = amount;
  }

  static getMoney(): number {
    return this.money;
  }

  static setRating(value: number): void {
    this.rating = value;
  }

  static getRating(): number {
    return this.rating;
  }
}

