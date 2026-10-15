// Weather inside the complex: the roof leaks, storms reach down the ventilation shafts, the
// core vents freezing coolant, the rift has storms of its own. Picked per room from the seed.

import { Rng } from '../core/rng';

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'fog' | 'snow' | 'ash' | 'voidstorm';

export const WEATHER_INFO: Record<WeatherKind, { name: string; desc: string }> = {
  clear: { name: 'Spokojnie', desc: 'Cisza. Tylko szum wentylacji.' },
  rain: { name: 'Deszcz', desc: 'Przez pęknięty strop leje się woda.' },
  storm: { name: 'Burza', desc: 'Szybami wentylacyjnymi wpada burza. Wiatr spycha w powietrzu.' },
  fog: { name: 'Mgła', desc: 'Gęsta mgła. Wrogowie widzą cię z bliższej odległości.' },
  snow: { name: 'Śnieg chłodziwa', desc: 'Chłodziwo zamarza w powietrzu. Podłoga jest śliska.' },
  ash: { name: 'Popiół i iskry', desc: 'Z przegrzanych przewodów sypią się iskry i popiół.' },
  voidstorm: { name: 'Burza Pustki', desc: 'Szczelina wyładowuje się fioletowymi błyskawicami.' },
};

const TABLE: [WeatherKind, number][][] = [
  [['clear', 0.3], ['rain', 0.35], ['fog', 0.2], ['storm', 0.15]],
  [['fog', 0.35], ['rain', 0.35], ['storm', 0.15], ['clear', 0.15]],
  [['rain', 0.4], ['storm', 0.3], ['fog', 0.15], ['clear', 0.15]],
  [['snow', 0.4], ['ash', 0.35], ['clear', 0.25]],
  [['voidstorm', 0.5], ['fog', 0.3], ['ash', 0.2]],
];

/** Deterministic weather for a room. Boss rooms always get their dramatic weather. */
export function pickWeather(seed: number, area: number, room: number, boss: string | null, tutorial = false): WeatherKind {
  if (tutorial) return 'rain';
  if (boss === 'matka') return 'storm';
  if (boss === 'straznik') return 'snow';
  if (boss === 'serce') return 'voidstorm';
  const rng = new Rng((seed ^ Math.imul(area + 1, 0x2f6b) ^ Math.imul(room + 7, 0x9e37)) >>> 0);
  const row = TABLE[area] ?? TABLE[0];
  let r = rng.next();
  for (const [k, w] of row) {
    if (r < w) return k;
    r -= w;
  }
  return row[0][0];
}
