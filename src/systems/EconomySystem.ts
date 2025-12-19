export class EconomySystem {
  private money: number = 0;

  constructor(initialBudget: number) {
    this.money = initialBudget;
  }

  getMoney(): number {
    return this.money;
  }

  spend(amount: number): boolean {
    if (this.money >= amount) {
      this.money -= amount;
      return true;
    }
    return false;
  }

  earn(amount: number): void {
    this.money += amount;
  }
}

