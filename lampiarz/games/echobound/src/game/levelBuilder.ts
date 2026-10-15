import { mulberry32 } from './rng';

/**
 * Carving-based level builder. The grid starts fully solid ('#') and rooms are
 * carved out with clear(); objects are then placed with put().
 */
export class GridBuilder {
  g: string[][];

  constructor(public w: number, public h: number) {
    this.g = Array.from({ length: h }, () => Array<string>(w).fill('#'));
  }

  fill(x1: number, y1: number, x2: number, y2: number, ch = '#') {
    for (let y = Math.max(0, y1); y <= Math.min(this.h - 1, y2); y++) {
      for (let x = Math.max(0, x1); x <= Math.min(this.w - 1, x2); x++) {
        this.g[y][x] = ch;
      }
    }
  }

  clear(x1: number, y1: number, x2: number, y2: number) {
    this.fill(x1, y1, x2, y2, '.');
  }

  put(x: number, y: number, ch: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = ch;
  }

  hrow(x1: number, x2: number, y: number, ch: string) {
    this.fill(x1, y, x2, y, ch);
  }

  vcol(x: number, y1: number, y2: number, ch: string) {
    this.fill(x, y1, x, y2, ch);
  }

  crystals(points: Array<[number, number]>) {
    for (const [x, y] of points) this.put(x, y, 'C');
  }

  at(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '#';
    return this.g[y][x];
  }

  /** Smooths sharp rectangular room corners into natural cavern arches and adds organic stalactite formations. */
  decorate(seed: number) {
    const rnd = mulberry32(seed);

    // 1. Natural ceiling arches: bevel sharp 90° upper corners in tall chambers
    for (let x = 2; x < this.w - 2; x++) {
      for (let y = 2; y < this.h - 2; y++) {
        if (this.g[y][x] !== '.') continue;
        // Upper-left corner: solid above and to the left
        const isUpperLeftCorner = this.g[y - 1][x] === '#' && this.g[y][x - 1] === '#' && this.g[y - 1][x - 1] === '#';
        // Upper-right corner: solid above and to the right
        const isUpperRightCorner = this.g[y - 1][x] === '#' && this.g[y][x + 1] === '#' && this.g[y - 1][x + 1] === '#';

        if (isUpperLeftCorner || isUpperRightCorner) {
          // Verify ample vertical headroom below so we never block paths
          let air = 0;
          while (y + air < this.h && this.g[y + air][x] === '.') air++;
          if (air >= 6 && rnd() < 0.75) {
            this.g[y][x] = '#';
          }
        }
      }
    }

    // 2. Organic stalactites and natural ceiling variations
    for (let x = 1; x < this.w - 1; x++) {
      for (let y = 1; y < this.h - 1; y++) {
        if (this.g[y][x] !== '.' || this.g[y - 1][x] !== '#') continue;
        // measure air column below
        let air = 0;
        while (y + air < this.h && this.g[y + air][x] === '.') air++;
        if (air < 6) continue;
        const r = rnd();
        if (r < 0.18) {
          this.g[y][x] = '#';
          if (air >= 8 && r < 0.06 && this.g[y + 1][x] === '.') this.g[y + 1][x] = '#';
        }
      }
    }
  }

  build(): string[] {
    return this.g.map((row) => row.join(''));
  }
}
