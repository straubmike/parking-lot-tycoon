import { CellData } from '@/types';

/**
 * GridManager - Manages cell data and border segments for the isometric grid
 * 
 * Handles:
 * - Cell data storage and retrieval
 * - Border segment storage (for curbs, fences, lane lines)
 * - Border segment key generation and lookup (handling shared edges)
 * - Grid serialization/deserialization
 * - Migration from older grid formats
 */
export class GridManager {
  private cellData: Map<string, CellData> = new Map();
  private borderSegments: Map<string, number> = new Map();
  private gridWidth: number;
  private gridHeight: number;

  constructor(gridWidth: number, gridHeight: number) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
  }

  getGridWidth(): number {
    return this.gridWidth;
  }

  getGridHeight(): number {
    return this.gridHeight;
  }

  /**
   * Get a simple key for a cell: `${gridX},${gridY}`
   */
  getCellKey(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  /**
   * Get a simple key for a border segment: cell coordinates and edge index
   * Format: `${cellX},${cellY},${edge}` where edge is 0=top, 1=right, 2=bottom, 3=left
   */
  getBorderSegmentKey(cellX: number, cellY: number, edge: number): string {
    return `${cellX},${cellY},${edge}`;
  }

  /**
   * Get all possible keys for a border segment, since edges are shared between adjacent cells
   * Returns an array of all possible keys (from current cell and adjacent cell if applicable)
   */
  getAllPossibleBorderSegmentKeys(cellX: number, cellY: number, edge: number): string[] {
    const allKeys: string[] = [];
    
    // Get the current cell's edge key
    const currentKey = this.getBorderSegmentKey(cellX, cellY, edge);
    allKeys.push(currentKey);
    
    // Check for adjacent cell that shares this edge
    // Edge relationships in isometric grid (based on actual cell positions):
    // - Left edge (3) of (x,y) = Right edge (1) of (x-1, y) [horizontal neighbor]
    // - Right edge (1) of (x,y) = Left edge (3) of (x+1, y) [horizontal neighbor]
    // - Top edge (0) of (x,y) = Bottom edge (2) of (x, y-1) [vertical neighbor]
    // - Bottom edge (2) of (x,y) = Top edge (0) of (x, y+1) [vertical neighbor]
    
    let neighborX: number | undefined, neighborY: number | undefined, neighborEdge: number | undefined;
    if (edge === 0) { // top - shared with bottom of (x, y-1)
      neighborX = cellX;
      neighborY = cellY - 1;
      neighborEdge = 2;
      if (neighborY >= 0) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 2)); // bottom
      }
    } else if (edge === 1) { // right - shared with left of (x+1, y) [fixed: horizontal, not diagonal]
      neighborX = cellX + 1;
      neighborY = cellY;
      neighborEdge = 3;
      if (neighborX < this.gridWidth && neighborY >= 0 && neighborY < this.gridHeight) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 3)); // left
      }
    } else if (edge === 2) { // bottom - shared with top of (x, y+1)
      neighborX = cellX;
      neighborY = cellY + 1;
      neighborEdge = 0;
      if (neighborY < this.gridHeight) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 0)); // top
      }
    } else if (edge === 3) { // left - shared with right of (x-1, y) [fixed: horizontal, not diagonal]
      neighborX = cellX - 1;
      neighborY = cellY;
      neighborEdge = 1;
      if (neighborX >= 0 && neighborY >= 0 && neighborY < this.gridHeight) {
        allKeys.push(this.getBorderSegmentKey(neighborX, neighborY, 1)); // right
      }
    }
    
    return allKeys;
  }

  /**
   * Find the existing border segment key for a given edge, checking all possible keys
   * Returns the key if found, or null if not found
   */
  findExistingBorderSegmentKey(cellX: number, cellY: number, edge: number): string | null {
    const allKeys = this.getAllPossibleBorderSegmentKeys(cellX, cellY, edge);
    
    for (const key of allKeys) {
      if (this.borderSegments.has(key)) {
        return key;
      }
    }
    
    return null;
  }

  /**
   * Get cell data for a given grid coordinate
   */
  getCellData(gridX: number, gridY: number): CellData | undefined {
    const cellKey = this.getCellKey(gridX, gridY);
    return this.cellData.get(cellKey);
  }

  /**
   * Set cell data for a given grid coordinate
   * Merges with existing data if present
   * Properties set to undefined are deleted from the cell data
   */
  setCellData(gridX: number, gridY: number, data: CellData): void {
    const cellKey = this.getCellKey(gridX, gridY);
    const existingData = this.cellData.get(cellKey) || {};
    const merged = { ...existingData, ...data };
    
    // Delete properties that are explicitly set to undefined
    Object.keys(merged).forEach(key => {
      if ((merged as any)[key] === undefined) {
        delete (merged as any)[key];
      }
    });
    
    this.cellData.set(cellKey, merged);
  }

  /**
   * Get border segment color for a given key
   */
  getBorderSegment(key: string): number | undefined {
    return this.borderSegments.get(key);
  }

  /**
   * Set border segment color for a given key
   */
  setBorderSegment(key: string, color: number): void {
    this.borderSegments.set(key, color);
  }

  /**
   * Delete border segment for a given key
   */
  deleteBorderSegment(key: string): void {
    this.borderSegments.delete(key);
  }

  /**
   * Check if a border segment exists
   */
  hasBorderSegment(key: string): boolean {
    return this.borderSegments.has(key);
  }

  /**
   * Get all border segments (for iteration)
   */
  getAllBorderSegments(): Map<string, number> {
    return this.borderSegments;
  }

  /**
   * Clear all cell data and border segments
   */
  clear(): void {
    this.cellData.clear();
    this.borderSegments.clear();
  }

  /**
   * Serialize grid data to JSON string
   */
  serializeGrid(): string {
    // Convert Map to object for JSON serialization
    const gridData: Record<string, CellData> = {};
    this.cellData.forEach((value, key) => {
      // Don't serialize edges in cellData since we now use borderSegments
      const { edges, ...cellDataWithoutEdges } = value;
      if (Object.keys(cellDataWithoutEdges).length > 0) {
        gridData[key] = cellDataWithoutEdges;
      }
    });
    
    const borderSegmentsData: Record<string, number> = {};
    this.borderSegments.forEach((value, key) => {
      borderSegmentsData[key] = value;
    });
    
    return JSON.stringify({
      gridWidth: this.gridWidth,
      gridHeight: this.gridHeight,
      // Keep gridSize for backward compatibility
      gridSize: Math.max(this.gridWidth, this.gridHeight),
      cellData: gridData,
      borderSegments: borderSegmentsData,
      version: '4.0' // Updated to support rectangular grids
    });
  }

  /**
   * Deserialize grid data from JSON string
   */
  deserializeGrid(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      
      // Clear existing data
      this.cellData.clear();
      this.borderSegments.clear();
      
      // Load cell data (only cells that fit in current grid dimensions)
      if (data.cellData && typeof data.cellData === 'object') {
        Object.entries(data.cellData).forEach(([key, value]) => {
          const [x, y] = key.split(',').map(Number);
          // Only load cells that fit in the current grid
          if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
            this.cellData.set(key, value as CellData);
          }
        });
      }
      
      // Load border segments (only segments that fit in current grid dimensions)
      if (data.borderSegments && typeof data.borderSegments === 'object') {
        Object.entries(data.borderSegments).forEach(([key, value]) => {
          const parts = key.split(',');
          if (parts.length === 3) {
            const x = parseInt(parts[0], 10);
            const y = parseInt(parts[1], 10);
            // Only load segments that fit in the current grid
            if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
              this.borderSegments.set(key, value as number);
            }
          }
        });
      } else if (data.edgeLines && typeof data.edgeLines === 'object') {
        // Migrate from old edgeLines format (version 2.0)
        Object.entries(data.edgeLines).forEach(([key, value]) => {
          const parts = key.split(',');
          if (parts.length === 3) {
            const x = parseInt(parts[0], 10);
            const y = parseInt(parts[1], 10);
            if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
              this.borderSegments.set(key, value as number);
            }
          }
        });
      } else if (data.version === '1.0' || (!data.borderSegments && !data.edgeLines)) {
        // Migrate from old format (cell-based edges) to new format
        this.migrateOldEdgeFormat(data.cellData);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to load grid:', error);
      return false;
    }
  }

  /**
   * Migrate edges from old cell-based format to new border segment format
   */
  private migrateOldEdgeFormat(cellData: Record<string, CellData> | undefined): void {
    // Migrate edges from old cell-based format to new border segment format
    if (!cellData) return;
    
    Object.entries(cellData).forEach(([cellKey, cell]) => {
      if (cell.edges) {
        const [x, y] = cellKey.split(',').map(Number);
        const edgeNames = ['top', 'right', 'bottom', 'left'];
        
        edgeNames.forEach((edgeName, edgeIdx) => {
          const edgeColor = cell.edges?.[edgeName as keyof typeof cell.edges];
          if (edgeColor !== undefined) {
            const segmentKey = this.getBorderSegmentKey(x, y, edgeIdx);
            this.borderSegments.set(segmentKey, edgeColor);
          }
        });
      }
    });
  }
}

