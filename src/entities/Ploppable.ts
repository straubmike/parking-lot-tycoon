import { Ploppable } from '@/types';

export abstract class PloppableBase implements Ploppable {
  id: string;
  type: string;
  x: number;
  y: number;
  cost: number;

  constructor(type: string, x: number, y: number, cost: number) {
    this.id = `${type}-${Date.now()}-${Math.random()}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.cost = cost;
  }

  abstract canPlace(): boolean;
  abstract onPlace(): void;
}

