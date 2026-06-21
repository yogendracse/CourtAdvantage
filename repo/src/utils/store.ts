import { Park } from '@/types';

class Store {
  private static instance: Store;
  private lastScrapedData: Park[] | null = null;
  private lastUpdateTime: Date | null = null;

  private constructor() {}

  static getInstance(): Store {
    if (!Store.instance) {
      Store.instance = new Store();
    }
    return Store.instance;
  }

  setScrapedData(data: Park[]): void {
    this.lastScrapedData = data;
    this.lastUpdateTime = new Date();
  }

  getScrapedData(): { data: Park[] | null; lastUpdate: Date | null } {
    return {
      data: this.lastScrapedData,
      lastUpdate: this.lastUpdateTime
    };
  }
}

export const store = Store.getInstance(); 