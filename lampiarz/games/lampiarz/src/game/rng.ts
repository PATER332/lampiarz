// Deterministic PRNG (mulberry32). The whole run state stores a single 32-bit
// integer, so saves reproduce exactly the same future as an uninterrupted game.

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, e) => s + Math.max(0, e[1]), 0);
    let r = this.next() * total;
    for (const [v, w] of entries) {
      r -= Math.max(0, w);
      if (r <= 0) return v;
    }
    return entries[entries.length - 1][0];
  }
}

/** Human-friendly seed code, e.g. "MGLA-4F2K". */
export function seedToCode(seed: number): string {
  const alphabet = 'ABCDEFGHJKLMNPRSTUWXYZ23456789';
  let n = seed >>> 0;
  let s = '';
  for (let i = 0; i < 7; i++) {
    s += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return s.slice(0, 3) + '-' + s.slice(3);
}

export function codeToSeed(input: string): number {
  const clean = input.trim().toUpperCase();
  const alphabet = 'ABCDEFGHJKLMNPRSTUWXYZ23456789';
  const m = /^([A-Z0-9]{3})-([A-Z0-9]{4})$/.exec(clean);
  if (m) {
    const s = m[1] + m[2];
    if ([...s].every((c) => alphabet.includes(c))) {
      let n = 0;
      for (let i = s.length - 1; i >= 0; i--) n = n * alphabet.length + alphabet.indexOf(s[i]);
      return n >>> 0;
    }
  }
  return hashString(clean);
}
