/**
 * TimeSystem - Singleton that manages game time
 * 
 * Time conversion: 1 real second = 1 game minute
 * A full game day is 24 game hours = 1440 game minutes = 24 real minutes
 */
export class TimeSystem {
  private static instance: TimeSystem;
  
  private gameMinutes: number = 0; // 0-1439 (24 hours * 60 minutes)
  private currentDay: number = 0;
  private realTimeAccumulator: number = 0;
  private dayJustChanged: boolean = false;
  private ratingJustFinalized: boolean = false;
  
  private constructor() {}
  
  static getInstance(): TimeSystem {
    if (!TimeSystem.instance) {
      TimeSystem.instance = new TimeSystem();
    }
    return TimeSystem.instance;
  }
  
  /**
   * Update game time based on real time delta
   * @param delta - Real time elapsed in milliseconds
   */
  update(delta: number): void {
    const previousMinutes = this.gameMinutes;
    this.realTimeAccumulator += delta;
    
    // 1000ms real time = 1 game minute
    while (this.realTimeAccumulator >= 1000) {
      this.realTimeAccumulator -= 1000;
      this.gameMinutes++;
      
      // Check for 11:59 PM (minute 1439) - trigger rating finalization
      if (this.gameMinutes === 1439 && previousMinutes !== 1439) {
        this.ratingJustFinalized = true;
      }
      
      // Check for midnight rollover
      if (this.gameMinutes >= 1440) {
        this.gameMinutes = 0;
        this.currentDay++;
        this.dayJustChanged = true;
      }
    }
  }
  
  /**
   * Get formatted time string in 12-hour AM/PM format
   * @returns Time string like "12:00 AM" or "3:45 PM"
   */
  getTimeString(): string {
    const totalMinutes = this.gameMinutes;
    const hour24 = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const hour12 = hour24 === 0 ? 12 : (hour24 > 12 ? hour24 - 12 : hour24);
    const ampm = hour24 < 12 ? 'AM' : 'PM';
    return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
  }
  
  /**
   * Get current hour in 12-hour format (1-12)
   */
  getHour(): number {
    const hour24 = Math.floor(this.gameMinutes / 60);
    return hour24 === 0 ? 12 : (hour24 > 12 ? hour24 - 12 : hour24);
  }
  
  /**
   * Get current minute (0-59)
   */
  getMinute(): number {
    return this.gameMinutes % 60;
  }
  
  /**
   * Check if it's currently AM (before noon)
   */
  isAM(): boolean {
    return Math.floor(this.gameMinutes / 60) < 12;
  }
  
  /**
   * Get current day number (starts at 0)
   */
  getCurrentDay(): number {
    return this.currentDay;
  }
  
  /**
   * Check if it's currently midnight (12:00 AM)
   */
  isMidnight(): boolean {
    return this.gameMinutes === 0;
  }
  
  /**
   * Check if it's currently 11:59 PM
   */
  isElevenFiftyNine(): boolean {
    return this.gameMinutes === 1439;
  }
  
  /**
   * Get total game minutes (0-1439)
   */
  getTotalMinutes(): number {
    return this.gameMinutes;
  }
  
  /**
   * Check and consume the day change flag
   * Returns true once when day changes, then false until next change
   */
  consumeDayChange(): boolean {
    if (this.dayJustChanged) {
      this.dayJustChanged = false;
      return true;
    }
    return false;
  }
  
  /**
   * Check and consume the rating finalized flag
   * Returns true once at 11:59 PM, then false until next day's 11:59 PM
   */
  consumeRatingFinalized(): boolean {
    if (this.ratingJustFinalized) {
      this.ratingJustFinalized = false;
      return true;
    }
    return false;
  }
  
  /**
   * Reset time system to initial state (Day 0, 12:00 AM)
   */
  reset(): void {
    this.gameMinutes = 0;
    this.currentDay = 0;
    this.realTimeAccumulator = 0;
    this.dayJustChanged = false;
    this.ratingJustFinalized = false;
  }
}

