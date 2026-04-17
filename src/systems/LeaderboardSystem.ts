import {
  fetchLeaderboardEntries,
  submitLeaderboardEntry,
  isLeaderboardRemoteConfigured,
} from '@/systems/leaderboardApi';

/**
 * A single leaderboard row. `completionDay` is the 1-based in-game day on which
 * the 11:59 PM rating-finalization check confirmed all win conditions.
 */
export interface LeaderboardEntry {
  playerName: string;
  challengeId: string;
  profit: number;
  rating: number;
  completionDay: number;
  /** ISO timestamp; present for entries that round-tripped through Supabase. */
  createdAt?: string;
}

export interface NewLeaderboardEntry {
  playerName: string;
  challengeId: string;
  profit: number;
  rating: number;
  completionDay: number;
}

const STORAGE_KEY = 'parking-lot-leaderboard';
const MAX_LOCAL_ENTRIES = 200;

/**
 * Canonical leaderboard sort: higher profit first, then higher rating,
 * then fewer in-game days to complete.
 */
function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.profit !== a.profit) return b.profit - a.profit;
  if (b.rating !== a.rating) return b.rating - a.rating;
  return a.completionDay - b.completionDay;
}

function isValidEntry(e: unknown): e is LeaderboardEntry {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.playerName === 'string' &&
    typeof r.challengeId === 'string' &&
    typeof r.profit === 'number' &&
    typeof r.rating === 'number' &&
    typeof r.completionDay === 'number' &&
    Number.isFinite(r.profit) &&
    Number.isFinite(r.rating) &&
    Number.isFinite(r.completionDay)
  );
}

/**
 * Best-effort migration from the pre-launch entry shape
 * ({ score, metrics: { profit, rating, time } }, where `time` was the 0-based
 * day index) to the new shape. Invalid rows are dropped.
 */
function migrateEntry(raw: unknown): LeaderboardEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (isValidEntry(r)) {
    return {
      playerName: r.playerName,
      challengeId: r.challengeId,
      profit: r.profit,
      rating: r.rating,
      completionDay: r.completionDay,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
    };
  }
  const legacyMetrics = r.metrics;
  if (legacyMetrics && typeof legacyMetrics === 'object') {
    const m = legacyMetrics as Record<string, unknown>;
    const profit = typeof m.profit === 'number' ? m.profit : 0;
    const rating = typeof m.rating === 'number' ? m.rating : (typeof r.score === 'number' ? r.score : 0);
    const rawTime = typeof m.time === 'number' ? m.time : 0;
    return {
      playerName: typeof r.playerName === 'string' ? r.playerName : 'Player',
      challengeId: typeof r.challengeId === 'string' ? r.challengeId : '',
      profit,
      rating,
      completionDay: Math.max(1, Math.floor(rawTime) + 1),
    };
  }
  return null;
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

  /** Whether a shared (Supabase) leaderboard is configured for this build. */
  isRemoteEnabled(): boolean {
    return isLeaderboardRemoteConfigured();
  }

  /** Return currently cached entries, sorted and optionally filtered. */
  getEntries(challengeId?: string): LeaderboardEntry[] {
    const filtered = challengeId
      ? this.entries.filter((e) => e.challengeId === challengeId)
      : this.entries;
    return [...filtered].sort(compareEntries);
  }

  /**
   * Submit a new result. Writes locally first so the Leaderboard screen has
   * something to show immediately, then pushes to Supabase when configured.
   * Returns whether the remote write succeeded (false = local-only).
   */
  async submit(entry: NewLeaderboardEntry): Promise<boolean> {
    const withTimestamp: LeaderboardEntry = {
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.upsertLocal(withTimestamp);
    if (!this.isRemoteEnabled()) return false;
    try {
      return await submitLeaderboardEntry(entry);
    } catch {
      return false;
    }
  }

  /**
   * Fetch the top entries from Supabase and replace the in-memory cache with
   * them. If no remote is configured (or the fetch fails), the local cache is
   * left untouched. Returns the (now-cached) entries for convenience.
   */
  async refreshFromRemote(): Promise<LeaderboardEntry[]> {
    if (!this.isRemoteEnabled()) return this.getEntries();
    try {
      const remote = await fetchLeaderboardEntries();
      this.entries = remote;
      this.saveToLocalStorage();
    } catch {
      // keep local cache on failure
    }
    return this.getEntries();
  }

  loadFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        this.entries = [];
        return;
      }
      const parsed = JSON.parse(saved) as unknown;
      const raw = Array.isArray(parsed) ? parsed : [];
      this.entries = raw
        .map(migrateEntry)
        .filter((e): e is LeaderboardEntry => e != null);
    } catch {
      this.entries = [];
    }
  }

  private upsertLocal(entry: LeaderboardEntry): void {
    this.entries.push(entry);
    this.entries.sort(compareEntries);
    if (this.entries.length > MAX_LOCAL_ENTRIES) {
      this.entries.length = MAX_LOCAL_ENTRIES;
    }
    this.saveToLocalStorage();
  }

  private saveToLocalStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // ignore quota or serialization errors
    }
  }
}
