import { Ploppable } from '@/types';

/**
 * PassabilitySystem - Manages passability rules for ploppables
 * 
 * Determines which ploppable types block movement for vehicles and pedestrians.
 * Some ploppables are passable (entities can move through them), while others
 * are impassable (entities cannot move into cells containing them).
 */
export class PassabilitySystem {
  /**
   * Default passability configuration for ploppable types
   * true = passable (entities can move through)
   * false = impassable (entities cannot move into the cell)
   * 'pedestrian-only' = passable by pedestrians only, vehicles cannot pass
   */
  private static readonly DEFAULT_PASSABILITY: Record<string, boolean | 'pedestrian-only'> = {
    'Parking Spot': true, // Parking spots are passable (vehicles park in them)
    'Trash Can': 'pedestrian-only', // Trash cans are passable by pedestrians only (vehicles cannot pass)
    'Vending Machine': false, // Vending machines are impassable (block movement)
    'Dumpster': false, // Dumpsters are impassable (block movement)
    'Tree': false, // Trees are impassable (block movement)
    'Shrub': false, // Shrubs are impassable (block movement)
    'Flower Patch': true, // Flower patches are passable (decorations)
    'Street Light': true, // Street lights are passable
    'Security Camera': true, // Security cameras are passable
    'Portable Toilet': false, // Portable toilets are impassable (block movement)
    'Bench': 'pedestrian-only', // Benches are passable by pedestrians only
    'Speed Bump': true, // Speed bumps are passable by both
    'Crosswalk': true, // Crosswalks are passable by both
    'entrance': true, // Entrances are passable
    'exit': true, // Exits are passable
    'Pedestrian Spawner': true, // Spawners are passable
  };

  /**
   * Check if a ploppable type is passable by default
   * @param ploppableType - The type of ploppable
   * @returns true if passable, false if impassable, 'pedestrian-only' if only pedestrians can pass
   */
  static isPloppableTypePassable(ploppableType: string): boolean | 'pedestrian-only' {
    // Check if there's a specific rule for this type
    if (ploppableType in this.DEFAULT_PASSABILITY) {
      return this.DEFAULT_PASSABILITY[ploppableType];
    }
    
    // Default to passable for unknown types (can be changed if needed)
    return true;
  }

  /**
   * Check if a ploppable is passable
   * Uses the ploppable's passable property if set, otherwise falls back to type-based rules
   * @param ploppable - The ploppable to check
   * @returns true if passable, false if impassable, 'pedestrian-only' if only pedestrians can pass
   */
  static isPloppablePassable(ploppable: Ploppable): boolean | 'pedestrian-only' {
    // If passable property is explicitly set, use it
    // However, if the property conflicts with the type rule, trust the type rule
    // (This handles cases where old saves have incorrect passable values)
    if (ploppable.passable !== undefined) {
      const typeRuleValue = this.isPloppableTypePassable(ploppable.type);
      // If the explicit value matches the type rule, use it
      // Otherwise, prefer the type rule (it's the source of truth)
      // Note: passable property is boolean, so if type rule is 'pedestrian-only', 
      // we need to convert: true -> 'pedestrian-only' (if type is pedestrian-only), false -> false
      if (typeRuleValue === 'pedestrian-only') {
        // Type is pedestrian-only, passable boolean is ambiguous, use type rule
        return typeRuleValue;
      }
      if (ploppable.passable === typeRuleValue) {
        return ploppable.passable;
      }
      // Property conflicts with type rule - use type rule
      return typeRuleValue;
    }
    
    // Otherwise, use type-based default
    return this.isPloppableTypePassable(ploppable.type);
  }

  /**
   * Check if a ploppable blocks movement for a specific entity type
   * Supports different rules per entity type (e.g., pedestrian-only passable ploppables)
   * @param ploppable - The ploppable to check
   * @param entityType - The type of entity ('vehicle' | 'pedestrian')
   * @returns true if the ploppable blocks this entity type
   */
  static doesPloppableBlockEntity(
    ploppable: Ploppable,
    entityType: 'vehicle' | 'pedestrian'
  ): boolean {
    const passability = this.isPloppablePassable(ploppable);
    
    // Handle pedestrian-only passable ploppables
    if (passability === 'pedestrian-only') {
      return entityType === 'vehicle'; // Blocks vehicles, not pedestrians
    }
    
    // For boolean passability, both entity types follow the same rule
    return !passability;
  }

  /**
   * Get the passable property value for a ploppable type
   * Used when creating/placing ploppables to set the passable property
   * Converts 'pedestrian-only' to true (since passable property is boolean)
   * The actual blocking logic is handled by doesPloppableBlockEntity
   * @param ploppableType - The type of ploppable
   * @returns The passable value (true or false)
   */
  static getPassableValueForType(ploppableType: string): boolean {
    const passability = this.isPloppableTypePassable(ploppableType);
    // Convert 'pedestrian-only' to true (we'll use doesPloppableBlockEntity for entity-specific checks)
    return passability !== false;
  }
}

