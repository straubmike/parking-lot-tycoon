/**
 * ProgressManager - Persists player progress (completed challenges, unlock state)
 *
 * Saves to localStorage. Unlock rule: Dev Mode only in dev build;
 * Learning Lot always unlocked; completing challenge N unlocks N+1.
 */

const STORAGE_KEY = 'parking-lot-tycoon-progress';

/** Challenge id order: index 0 = Dev Mode, 1 = first player challenge, etc. */
export const CHALLENGE_ORDER: string[] = [
  'dev-mode',
  'learning-lot',
  'pizza-parking-problem',
  'rush-hour-roundabout',
  'drive-in-disaster',
  'airport-arrivals',
];

export function isDevBuild(): boolean {
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
}

export interface ProgressData {
  completedChallengeIds: string[];
}

function loadRaw(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProgressData;
      if (Array.isArray(parsed.completedChallengeIds)) {
        return { completedChallengeIds: parsed.completedChallengeIds };
      }
    }
  } catch {
    // ignore
  }
  return { completedChallengeIds: [] };
}

function save(data: ProgressData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Mark a challenge as completed and persist.
 */
export function completeChallenge(challengeId: string): void {
  const data = loadRaw();
  if (!data.completedChallengeIds.includes(challengeId)) {
    data.completedChallengeIds.push(challengeId);
    save(data);
  }
}

/**
 * Whether the challenge has been completed.
 */
export function isChallengeCompleted(challengeId: string): boolean {
  return loadRaw().completedChallengeIds.includes(challengeId);
}

/**
 * Whether the challenge is unlocked (player can select it).
 * Dev Mode: only in dev build. Learning Lot: always. Others: previous challenge completed.
 */
export function isChallengeUnlocked(challengeId: string): boolean {
  const data = loadRaw();
  const idx = CHALLENGE_ORDER.indexOf(challengeId);
  if (idx < 0) return false;
  if (challengeId === 'dev-mode') return isDevBuild();
  if (challengeId === 'learning-lot') return true;
  const previousId = CHALLENGE_ORDER[idx - 1];
  return data.completedChallengeIds.includes(previousId);
}

/**
 * Get all challenge ids that are unlocked.
 */
export function getUnlockedChallengeIds(): string[] {
  return CHALLENGE_ORDER.filter(id => isChallengeUnlocked(id));
}
