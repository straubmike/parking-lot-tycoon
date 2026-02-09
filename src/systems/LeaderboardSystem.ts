export interface LeaderboardEntry {
  playerName: string;
  challengeId: string;
  score: number;
  metrics: {
    profit: number;
    rating: number;
    time: number;
  };
}

export class LeaderboardSystem {
  private static instance: LeaderboardSystem;
  private entries: LeaderboardEntry[] = [];

  static getInstance(): LeaderboardSystem {
    if (!LeaderboardSystem.instance) {
      LeaderboardSystem.instance = new LeaderboardSystem();
    }
    return LeaderboardSystem.instance;
  }

  private constructor() {}

  addEntry(entry: LeaderboardEntry): void {
    this.entries.push(entry);
    // Sort by score
    this.entries.sort((a, b) => b.score - a.score);
    // Keep top entries (e.g., top 100)
    this.entries = this.entries.slice(0, 100);
    
    // Save to localStorage
    this.saveToLocalStorage();
  }

  getEntries(challengeId?: string): LeaderboardEntry[] {
    if (challengeId) {
      return this.entries.filter((e) => e.challengeId === challengeId);
    }
    return this.entries;
  }

  private saveToLocalStorage(): void {
    localStorage.setItem('parking-lot-leaderboard', JSON.stringify(this.entries));
  }

  loadFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem('parking-lot-leaderboard');
      if (saved) {
        this.entries = JSON.parse(saved);
      }
    } catch {
      this.entries = [];
    }
  }
}

