import { PloppableBase } from '../Ploppable';

export class ParkingSpace extends PloppableBase {
  constructor(x: number, y: number) {
    super('parking-space', x, y, 100); // Example cost
  }

  canPlace(): boolean {
    // Validation logic for placing parking spaces
    return true;
  }

  onPlace(): void {
    // Called when parking space is placed
  }
}

