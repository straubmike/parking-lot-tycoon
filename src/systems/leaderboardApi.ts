/**
 * Thin Supabase PostgREST client for the leaderboard.
 *
 * Intentionally uses `fetch` rather than `@supabase/supabase-js` to avoid a
 * runtime dependency — we only need two queries. Table schema and row-level
 * security policies live in `supabase/schema.sql`.
 *
 * When `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing, both
 * exports no-op so local dev builds still work with localStorage only.
 */

import type { LeaderboardEntry, NewLeaderboardEntry } from '@/systems/LeaderboardSystem';

const TABLE = 'scores';
const DEFAULT_LIMIT = 100;

interface RemoteRow {
  player_name: string;
  challenge_id: string;
  profit: number;
  rating: number;
  completion_day: number;
  created_at: string;
}

function getConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ''), anonKey };
}

export function isLeaderboardRemoteConfigured(): boolean {
  return getConfig() != null;
}

function defaultHeaders(anonKey: string): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
}

function rowToEntry(row: RemoteRow): LeaderboardEntry {
  return {
    playerName: row.player_name,
    challengeId: row.challenge_id,
    profit: row.profit,
    rating: row.rating,
    completionDay: row.completion_day,
    createdAt: row.created_at,
  };
}

/**
 * Fetch the top entries from Supabase, ordered server-side by
 * profit desc, rating desc, completion_day asc.
 * Returns `[]` if no remote is configured or the request fails.
 */
export async function fetchLeaderboardEntries(
  challengeId?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<LeaderboardEntry[]> {
  const cfg = getConfig();
  if (!cfg) return [];
  const params = new URLSearchParams();
  params.set('select', 'player_name,challenge_id,profit,rating,completion_day,created_at');
  params.set('order', 'profit.desc,rating.desc,completion_day.asc');
  params.set('limit', String(limit));
  if (challengeId) params.set('challenge_id', `eq.${challengeId}`);
  const res = await fetch(`${cfg.url}/rest/v1/${TABLE}?${params.toString()}`, {
    headers: defaultHeaders(cfg.anonKey),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as RemoteRow[];
  return rows.map(rowToEntry);
}

/** Insert a new score. Returns true on HTTP success. */
export async function submitLeaderboardEntry(entry: NewLeaderboardEntry): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg) return false;
  const body = {
    player_name: entry.playerName.slice(0, 24),
    challenge_id: entry.challengeId,
    profit: Math.round(entry.profit),
    rating: Math.round(entry.rating),
    completion_day: Math.round(entry.completionDay),
  };
  const res = await fetch(`${cfg.url}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      ...defaultHeaders(cfg.anonKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}
