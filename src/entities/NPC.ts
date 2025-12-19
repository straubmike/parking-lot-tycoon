import { NPC } from '@/types';

export class NPCEntity implements NPC {
  id: string;
  x: number;
  y: number;
  targetSpace?: string;
  state: 'entering' | 'parking' | 'leaving';

  constructor(x: number, y: number) {
    this.id = `npc-${Date.now()}-${Math.random()}`;
    this.x = x;
    this.y = y;
    this.state = 'entering';
  }

  update(): void {
    // NPC behavior logic will go here
  }
}

