import { Challenge, WinCondition } from '@/types';

/**
 * Validate if challenge conditions have been met
 */
export function validateChallengeConditions(
  challenge: Challenge,
  currentMetrics: {
    profit?: number;
    rating?: number;
    time?: number;
  }
): boolean {
  return challenge.winConditions.every((condition) => {
    switch (condition.type) {
      case 'profit':
        return (currentMetrics.profit || 0) >= condition.value;
      case 'rating':
        return (currentMetrics.rating || 0) >= condition.value;
      case 'time':
        return (currentMetrics.time || 0) <= condition.value;
      default:
        return false;
    }
  });
}

