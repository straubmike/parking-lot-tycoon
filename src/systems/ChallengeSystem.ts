import { Challenge } from '@/types';

export interface ChallengeMetrics {
  profit?: number;
  rating?: number;
  currentDay?: number;
  parkingSpotCount?: number;
  ploppableCountByType?: Record<string, number>;
}

export class ChallengeSystem {
  private challenge: Challenge;
  private conditionsMet: boolean = false;

  constructor(challenge: Challenge) {
    this.challenge = challenge;
  }

  /**
   * Check if all win conditions are met.
   */
  checkWinConditions(metrics: ChallengeMetrics): boolean {
    const { winConditions } = this.challenge;
    if (!winConditions || winConditions.length === 0) {
      return false;
    }
    for (const wc of winConditions) {
      if (!this.evaluateCondition(wc, metrics)) {
        this.conditionsMet = false;
        return false;
      }
    }
    this.conditionsMet = true;
    return true;
  }

  private evaluateCondition(
    wc: { type: string; value: number; ploppableType?: string; ploppableCount?: number },
    metrics: ChallengeMetrics
  ): boolean {
    switch (wc.type) {
      case 'profit':
        return (metrics.profit ?? 0) >= wc.value;
      case 'rating':
      case 'min_rating':
        return (metrics.rating ?? 0) >= wc.value;
      case 'time':
        return (metrics.currentDay ?? 0) >= wc.value;
      case 'min_parking_spots':
        return (metrics.parkingSpotCount ?? 0) >= wc.value;
      case 'required_ploppables':
        if (wc.ploppableType == null || wc.ploppableCount == null) return true;
        const count = metrics.ploppableCountByType?.[wc.ploppableType] ?? 0;
        return count >= wc.ploppableCount;
      case 'custom':
      default:
        return false;
    }
  }

  getChallenge(): Challenge {
    return this.challenge;
  }

  isConditionsMet(): boolean {
    return this.conditionsMet;
  }
}
