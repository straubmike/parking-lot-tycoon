import { PloppableBase } from '../Ploppable';

export class Exit extends PloppableBase {
  constructor(x: number, y: number) {
    super('exit', x, y, 500); // Example cost
  }

  canPlace(): boolean {
    // Validation logic for placing exit
    return true;
  }

  onPlace(): void {
    // Called when exit is placed
  }
}

