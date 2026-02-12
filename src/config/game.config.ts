import { GameConfig } from '@/types';

export const GAME_CONFIG: GameConfig = {
  width: 2000,
  height: 1600,
  backgroundColor: '#2a2a2a',
};

// Isometric tile settings
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

/** When true, log a warning to console when a vehicle path contains lane-line crossings (for debugging pathing). */
export const DEBUG_PATH_LANE_CHECK = false;

/** When true, log each vehicle path (before park) with turns and lane line positions to debug pathing (e.g. early left turns). */
export const DEBUG_LOG_VEHICLE_PATHS_AND_LANES = false;

