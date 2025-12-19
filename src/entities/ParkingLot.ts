import { ParkingLot, Ploppable } from '@/types';

export class ParkingLotEntity {
  private lot: ParkingLot;

  constructor(width: number, height: number) {
    this.lot = {
      width,
      height,
      spaces: [],
    };
  }

  addPloppable(ploppable: Ploppable): void {
    this.lot.spaces.push(ploppable);
  }

  removePloppable(id: string): void {
    this.lot.spaces = this.lot.spaces.filter((p) => p.id !== id);
  }

  getLot(): ParkingLot {
    return this.lot;
  }
}

