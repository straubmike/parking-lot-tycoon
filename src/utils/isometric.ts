import { TILE_WIDTH, TILE_HEIGHT } from '@/config/game.config';

// Utility functions for isometric coordinate conversion

/**
 * Convert isometric grid coordinates to screen coordinates
 */
export function isoToScreen(isoX: number, isoY: number): { x: number; y: number } {
  // Standard isometric projection formula
  // Center of tile in screen space
  const x = (isoX - isoY) * (TILE_WIDTH / 2);
  const y = (isoX + isoY) * (TILE_HEIGHT / 2);
  return { x, y };
}

/**
 * Convert screen coordinates to isometric grid coordinates
 */
export function screenToIso(screenX: number, screenY: number): { x: number; y: number } {
  const isoX = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2;
  const isoY = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2;
  return { x: isoX, y: isoY };
}

/**
 * Draw an isometric tile at the given grid coordinates
 * Returns the points for the diamond shape
 */
export function getIsometricTilePoints(isoX: number, isoY: number): { x: number; y: number }[] {
  const center = isoToScreen(isoX, isoY);
  
  // Diamond shape points (top, right, bottom, left)
  return [
    { x: center.x, y: center.y - TILE_HEIGHT / 2 },           // Top
    { x: center.x + TILE_WIDTH / 2, y: center.y },            // Right
    { x: center.x, y: center.y + TILE_HEIGHT / 2 },           // Bottom
    { x: center.x - TILE_WIDTH / 2, y: center.y },            // Left
  ];
}

