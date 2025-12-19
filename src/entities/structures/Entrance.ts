import { PloppableBase } from '../Ploppable';

export class Entrance extends PloppableBase {
  constructor(x: number, y: number) {
    super('entrance', x, y, 500); // Example cost
  }

  canPlace(): boolean {
    // Validation logic for placing entrance
    return true;
  }

  onPlace(): void {
    // Called when entrance is placed
  }
}

