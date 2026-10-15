import { CHARACTERS, COYOTE, DASH_FRAMES, DASH_V, GRAVITY, INVULN_FRAMES, JUMP_BUFFER, MAX_FALL, MAX_VIEW_W, MIN_VIEW_W, PLAYER_H, PLAYER_W, STEP_MS, TILE, UPGRADES, VIEW_H, computeStats, type CharId, type Stats, type UpgradeId } from './constants';
import { AudioEngine } from './audio';
import { Input } from './input';
import { LEVEL_ORDER, LEVELS, TOTAL_SECRETS } from './levels';
import { Particles } from './particles';
import { Renderer } from './render';
import { hashStr, mulberry32 } from './rng';
import { writeSave } from './save';
import {
  T_AIR, T_BRICK, T_CRUMBLE, T_DOOR, T_GEYSER, T_HIDDEN, T_ONEWAY, T_ROCK, T_SPIKE, T_WATER, T_VEIL_ECHO, T_VEIL_LIFE, T_SPRING, T_UPDRAFT, T_PRISM, overlap, makeBoss,
  type Actor, type Anchor, type BossProjectile, type BossState, type Captive, type Door, type Echo, type Enemy, type Ghost, type HiddenRegion, type LevelState, type Mover, type PlayerState, type Recording, type Prism,
} from './state';

const BOUNCE_VY = -9.0;
const UPDRAFT_LIFT = 0.62;
const UPDRAFT_MAX_VY = -3.4;
import type { GameEvent, HudState, LevelDef, SaveData, Settings, Theme } from './types';

type Mode = 'playing' | 'intro' | 'paused' | 'dying' | 'dead' | 'transition' | 'victory' | 'shop' | 'unlock';

export class Game {
  ctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  input = new Input();
  particles = new Particles();
  renderer: Renderer;
  save: SaveData;
  settings: Settings;
  stats: Stats;
  level!: LevelState;
  player!: PlayerState;
  echoes: Echo[] = [];
  recording: Recording | null = null;
  lastRecording: Recording | null = null;
  energy = 8;
  cam = { x: 0, y: 0 };
  view = { w: 640, h: 360 };
  scale = 1;
  offX = 0;
  offY = 0;
  mode: Mode = 'playing';
  frame = 0;
  introFrame = 0;
  message: { text: string; until: number } | null = null;
  prompt: string | null = null;
  sign: string | null = null;
  shake = 0;
  flash = 0;
  transition: { t: number; next: Theme | null } | null = null;
  deathT = 0;
  echoSeq = 0;
  activeMap = new Map<string, { a: number; n: number }>();
  nearShrine = false;
  keys = new Set<string>();
  anchors: Anchor[] = [];
  ghosts: Ghost[] = [];
  swapCd = 0;
  camFast = 0;
  private anchorSeq = 0;
  private veilMsgAt = -999;
  private lastDripSound = -999;
  private raf = 0;
  private lastTime = 0;
  private acc = 0;
  private destroyed = false;
  private sessionStart = 0;

  constructor(
    public canvas: HTMLCanvasElement,
    public audio: AudioEngine,
    settings: Settings,
    save: SaveData,
    private onHud: (h: HudState) => void,
    private onEvent: (e: GameEvent) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.buffer = document.createElement('canvas');
    this.settings = settings;
    this.save = save;
    if (!save.characters || !save.characters.includes(save.character)) save.character = 'echo';
    this.stats = computeStats(save.upgrades, save.character);
    this.renderer = new Renderer(this);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                          */
  /* ------------------------------------------------------------------ */
  start(showIntro = false) {
    const cp = this.save.checkpoint;
    const levelId: Theme = cp && LEVELS[cp.level] ? cp.level : 'cave';
    this.loadLevel(levelId, cp && cp.level === levelId ? { x: cp.x, y: cp.y } : undefined);
    if (!cp) {
      this.save.checkpoint = { level: levelId, x: this.level.spawn.x, y: this.level.spawn.y };
    }
    this.energy = this.stats.recordTime;
    if (showIntro) {
      this.mode = 'intro';
      this.introFrame = 0;
      this.input.enabled = false;
      this.audio.play('awakening');
      this.onEvent({ type: 'intro', active: true });
    }
    this.sessionStart = performance.now();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.audio.startAmbient(this.level.def.theme);
    this.audio.startMusic(this.level.def.theme);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.input.destroy();
    this.audio.stopAmbient();
    this.audio.stopMusic();
  }

  resize = () => {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sf = H / VIEW_H;
    const scale = sf >= 2 ? Math.floor(sf) : Math.max(1, Math.floor(sf * 2) / 2);
    this.scale = scale;
    this.view.h = Math.ceil(H / scale);
    this.view.w = Math.max(MIN_VIEW_W, Math.min(MAX_VIEW_W, Math.ceil(W / scale)));
    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buffer.width = this.view.w;
    this.buffer.height = this.view.h;
    this.offX = Math.floor((W - this.view.w * scale) / 2);
    this.offY = Math.floor((H - this.view.h * scale) / 2);
    this.renderer.resize(this.view.w, this.view.h);
  };

  pause() {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.input.reset();
      this.onEvent({ type: 'pause' });
    }
  }

  resume() {
    if (this.mode === 'paused' || this.mode === 'shop' || this.mode === 'unlock') {
      this.mode = 'playing';
      this.input.reset();
      this.lastTime = performance.now();
      this.acc = 0;
    }
  }

  finishIntro() {
    if (this.mode !== 'intro') return;
    this.mode = 'playing';
    this.introFrame = 0;
    this.input.enabled = true;
    this.input.reset();
    this.lastTime = performance.now();
    this.acc = 0;
    this.audio.play('summon');
    this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, {
      count: 20, color: ['#6ff3ff', '#c8fbff', '#ffffff'], speed: 1.5, life: 38, glow: true,
    });
    this.onEvent({ type: 'intro', active: false });
    this.onEvent({ type: 'levelStart', name: this.level.def.name, subtitle: this.level.def.subtitle, id: this.level.def.id });
    this.say('A — D / strzałki: ruch. Spacja: skok. Q: nagraj echo.');
  }

  openShop() {
    if (this.mode === 'playing' || this.mode === 'paused') {
      this.mode = 'shop';
      this.input.reset();
      this.onEvent({ type: 'shop' });
    }
  }

  setSettings(s: Settings) {
    this.settings = s;
  }

  /** Free roam after reaching the Core: return to the last checkpoint so the portal isn't retriggered. */
  continueAfterVictory() {
    this.transition = null;
    this.mode = 'playing';
    this.teleportToCheckpoint();
    this.player.hp = this.stats.maxHp;
    this.input.reset();
    this.lastTime = performance.now();
    this.acc = 0;
    this.say('Podziemia są Twoje. Szukaj pozostałych sekretów.');
  }

  saveNow() {
    this.save.playtime += (performance.now() - this.sessionStart) / 1000;
    this.sessionStart = performance.now();
    this.save.areaName = this.level.def.name;
    writeSave(this.save);
    this.onEvent({ type: 'saved' });
  }

  /* ------------------------------------------------------------------ */
  /*  Upgrades                                                           */
  /* ------------------------------------------------------------------ */
  buy(id: UpgradeId): boolean {
    const def = UPGRADES.find((u) => u.id === id)!;
    const lvl = this.save.upgrades[id];
    if (lvl >= def.costs.length) return false;
    const cost = def.costs[lvl];
    if (this.save.crystals < cost) {
      this.audio.play('denied');
      return false;
    }
    this.save.crystals -= cost;
    this.save.upgrades[id]++;
    const old = this.stats;
    this.stats = computeStats(this.save.upgrades, this.save.character);
    if (this.stats.maxHp > old.maxHp) this.player.hp += this.stats.maxHp - old.maxHp;
    if (this.stats.recordTime > old.recordTime) this.energy = Math.min(this.stats.recordTime, this.energy + (this.stats.recordTime - old.recordTime));
    this.audio.play('upgrade');
    this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, { count: 30, color: ['#ffd166', '#9ff9ff', '#ffffff'], speed: 2, life: 50, glow: true });
    this.saveNow();
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Level loading                                                      */
  /* ------------------------------------------------------------------ */
  loadLevel(id: Theme, spawnTile?: { x: number; y: number }) {
    const def = LEVELS[id];
    const L = this.parseLevel(def);
    this.level = L;
    this.echoes = [];
    this.anchors = [];
    this.ghosts = [];
    this.recording = null;
    this.particles.clear();
    this.activeMap = new Map();
    const sp = spawnTile ?? L.spawn;
    this.player = this.makePlayer(sp.x, sp.y);
    for (const cp of L.checkpoints) cp.active = cp.x === sp.x && cp.y === sp.y;
    this.renderer.prepare(L);
    this.snapCamera();
    if (!this.save.unlocked.includes(id)) this.save.unlocked.push(id);
    this.onEvent({ type: 'levelStart', name: def.name, subtitle: def.subtitle, id: def.id });
  }

  private makePlayer(tx: number, ty: number): PlayerState {
    return {
      x: tx * TILE + (TILE - PLAYER_W) / 2, y: ty * TILE + TILE - PLAYER_H, w: PLAYER_W, h: PLAYER_H, vx: 0, vy: 0,
      onGround: false, facing: 1, hp: this.stats.maxHp, invuln: 0, hurtT: 0, coyote: 0, jumpBuffer: 0,
      anim: 'idle', animT: 0, dead: false, deathT: 0, onMover: null, dropThrough: 0, wasOnGround: false, prevBottom: 0,
      bounceT: 0, portalCd: 0, inUpdraft: false, landT: 0, actT: 0,
      dashT: 0, dashCd: 0, dashesLeft: this.stats.dashes, dashDir: 1, wallSide: 0, wallCoyote: 0, wallLock: 0, clinging: false, blinkT: 0,
    };
  }

  private parseLevel(def: LevelDef): LevelState {
    const rows = def.map;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const tiles = new Uint8Array(w * h);
    const L: LevelState = {
      def, w, h, tiles, crystals: [], plates: [], levers: [], doors: [], doorAt: new Map(), movers: [], crumbles: new Map(),
      checkpoints: [], signs: [], shrines: [], exits: [], hidden: [], hiddenAt: new Map(), enemies: [], spawn: { x: 2, y: 2 }, decor: [],
      dripEmitters: [], droplets: [], dripRipples: [],
      springs: new Map(), prisms: [], keys: [], portals: [], updrafts: [], markers: [], captives: [], boss: null,
    };
    const doorGroups = new Map<string, { tiles: Array<{ x: number; y: number }>; latch: boolean; lockId?: string }>();
    const occupied = new Set<number>();
    this.keys = new Set(this.save.solved.filter((k) => k.startsWith(`${def.id}:key:`)).map((k) => k.slice(`${def.id}:key:`.length)));
    const mkEnemy = (kind: Enemy['kind'], x: number, y: number, range: number, sleepWhen?: string): Enemy => {
      const size =
        kind === 'shadow' ? { w: 12, h: 13 }
          : kind === 'guardian' ? { w: 14, h: 28 }
            : kind === 'wraith' ? { w: 12, h: 20 }
              : kind === 'snapper' ? { w: 14, h: 12 }
                : kind === 'crawler' ? { w: 12, h: 10 }
                  : kind === 'floater' ? { w: 12, h: 12 }
                    : kind === 'sentinel' ? { w: 14, h: 26 }
                      : { w: 14, h: 14 };
      const floating = kind === 'devourer' || kind === 'wraith' || kind === 'floater';
      const px = floating ? x * TILE + 1 : x * TILE + (TILE - size.w) / 2;
      const py = floating ? y * TILE + 1 : (y + 1) * TILE - size.h;
      return {
        kind, x: px, y: py, w: size.w, h: size.h, vx: 0, vy: 0, onGround: false, facing: 1, spawnX: px, spawnY: py, range,
        state: 'patrol', timer: 0, sleepWhen, asleep: false, alert: 0, satiated: 0, animT: Math.floor(Math.random() * 100), stepT: 0, hunting: false, wanderT: Math.random() * 10,
      };
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = rows[y][x] ?? '#';
        const idx = y * w + x;
        let t = T_AIR;
        switch (c) {
          case '#': t = T_ROCK; break;
          case '%': t = T_BRICK; break;
          case '-': t = T_ONEWAY; break;
          case '^': t = T_SPIKE; break;
          case '~': t = T_CRUMBLE; L.crumbles.set(idx, { x, y, state: 0, timer: 0 }); break;
          case 'H': t = T_HIDDEN; break;
          case 'w': t = T_WATER; break;
          case '.': break;
          case 'P': L.spawn = { x, y }; occupied.add(idx); break;
          case 'K': L.checkpoints.push({ x, y, active: false }); occupied.add(idx); break;
          case 'C': case '$': {
            const id = `${def.id}:${x},${y}`;
            if (!this.save.collected.includes(id)) L.crystals.push({ id, x, y, value: c === '$' ? 5 : 1, taken: false, takenT: 0 });
            occupied.add(idx);
            break;
          }
          case 'U': L.shrines.push({ x, y }); occupied.add(idx); break;
          case 'X': L.exits.push({ x, y }); occupied.add(idx); break;
          case 's': L.enemies.push(mkEnemy('shadow', x, y, 5)); occupied.add(idx); break;
          case 'B': t = T_VEIL_ECHO; break;
          case 'Z': t = T_VEIL_LIFE; break;
          case 'S': t = T_SPRING; L.springs.set(idx, { x, y, squash: 0 }); break;
          case 'W': t = T_UPDRAFT; L.updrafts.push({ x, y }); break;
          case 'M': t = T_PRISM; L.prisms.push({ x, y, idx: L.prisms.length, charge: 0 }); occupied.add(idx); break;
          case 'm': L.markers.push({ x, y }); occupied.add(idx); break;
          case 'r': L.enemies.push(mkEnemy('wraith', x, y, 6)); break;
          case 'n': L.enemies.push(mkEnemy('snapper', x, y, 2)); occupied.add(idx); break;
          case 'J': t = 14; break; // gejzer — erupcyjna kolumna gorącego pyłu (T_GEYSER)
          case 'e': L.enemies.push(mkEnemy('crawler', x, y, 5)); occupied.add(idx); break;
          case 'f': L.enemies.push(mkEnemy('floater', x, y, 7)); break;
          case 't': L.enemies.push(mkEnemy('sentinel', x, y, 4)); occupied.add(idx); break;
          default: {
            const le = def.legend[c];
            if (!le) {
              if (c === 'g') L.enemies.push(mkEnemy('guardian', x, y, 5));
              else if (c === 'v') L.enemies.push(mkEnemy('devourer', x, y, 6));
              else console.warn('Unknown tile', c, x, y);
              break;
            }
            switch (le.type) {
              case 'captive': {
                if (!this.save.characters.includes(le.char)) L.captives.push({ x, y, char: le.char, open: 0, freed: false });
                occupied.add(idx);
                break;
              }
              case 'key': {
                const taken = this.save.solved.includes(`${def.id}:key:${le.id}`);
                L.keys.push({ id: le.id, x, y, taken });
                occupied.add(idx);
                break;
              }
              case 'lock': {
                t = T_DOOR;
                const gid = `lock:${le.id}`;
                const g = doorGroups.get(gid) ?? { tiles: [], latch: true, lockId: le.id };
                g.tiles.push({ x, y });
                doorGroups.set(gid, g);
                break;
              }
              case 'portal': L.portals.push({ id: le.id, x, y, partner: null, pulse: 0 }); occupied.add(idx); break;
              case 'wraith': L.enemies.push(mkEnemy('wraith', x, y, le.range ?? 6)); break;
              case 'snapper': L.enemies.push(mkEnemy('snapper', x, y, 2)); occupied.add(idx); break;
              case 'sign': L.signs.push({ x, y, text: le.text }); occupied.add(idx); break;
              case 'plate':
                L.plates.push({
                  x, y, target: le.target, pressed: false, pressedBy: null,
                  noEcho: !!le.noEcho, anim: 0, deniedT: 0,
                  echoOnly: !!le.echoOnly, timed: le.timed ?? 0, hold: 0,
                });
                occupied.add(idx);
                break;
              case 'lever': {
                const key = `${def.id}:lever:${x},${y}`;
                L.levers.push({ x, y, target: le.target, on: !le.timed && this.save.solved.includes(key), timed: le.timed ?? 0, timer: 0, noEcho: !!le.noEcho, key, deniedT: 0 });
                occupied.add(idx);
                break;
              }
              case 'door': {
                t = T_DOOR;
                const g = doorGroups.get(le.id) ?? { tiles: [], latch: !!le.latch };
                g.tiles.push({ x, y });
                doorGroups.set(le.id, g);
                break;
              }
              case 'mover': {
                const x0 = x * TILE, y0 = y * TILE;
                const x1 = x0 + le.dx * TILE, y1 = y0 + le.dy * TILE;
                const len = Math.hypot(x1 - x0, y1 - y0);
                const phase = le.when ? 0 : (le.phase ?? 0);
                const prog = phase * len;
                const f0 = len > 0 ? prog / len : 0;
                L.movers.push({
                  x: x0 + (x1 - x0) * f0, y: y0 + (y1 - y0) * f0, w: le.w * TILE, h: 8, x0, y0, x1, y1, prog, len, dir: 1, speed: le.speed,
                  vx: 0, vy: 0, prevY: y0 + (y1 - y0) * f0, pause: 0, when: le.when, spikes: !!le.spikes, phase, active: false,
                });
                break;
              }
              case 'shadow': L.enemies.push(mkEnemy('shadow', x, y, le.range ?? 5)); break;
              case 'guardian': L.enemies.push(mkEnemy('guardian', x, y, le.range ?? 5, le.sleepWhen)); break;
              case 'devourer': L.enemies.push(mkEnemy('devourer', x, y, le.range ?? 6)); break;
            }
          }
        }
        tiles[idx] = t;
      }
    }
    for (const [id, g] of doorGroups) {
      const minX = Math.min(...g.tiles.map((t) => t.x));
      const minY = Math.min(...g.tiles.map((t) => t.y));
      const key = `${def.id}:door:${id}`;
      const latched = g.latch && this.save.solved.includes(key);
      const door: Door = { id, tiles: g.tiles, x: minX, y: minY, tilesHigh: g.tiles.length, open: latched, latch: g.latch, latched, anim: latched ? 1 : 0, blocked: false, timedLeft: 0, lockId: g.lockId };
      L.doors.push(door);
      for (const t of g.tiles) L.doorAt.set(t.y * w + t.x, door);
    }
    if (def.boss) L.boss = makeBoss(def.boss, this.save.solved.includes(`${def.id}:boss`));
    for (const p of L.portals) {
      if (!p.partner) {
        const other = L.portals.find((o) => o !== p && o.id === p.id && !o.partner);
        if (other) { p.partner = other; other.partner = p; }
      }
    }
    // hidden regions via flood fill
    const seen = new Set<number>();
    let hn = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== T_HIDDEN || seen.has(i)) continue;
      const region: HiddenRegion = { id: `${def.id}:h${hn++}`, tiles: [], revealed: false, revealT: 0 };
      const stack = [i];
      seen.add(i);
      while (stack.length) {
        const k = stack.pop()!;
        region.tiles.push(k);
        L.hiddenAt.set(k, region);
        const kx = k % w, ky = Math.floor(k / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = kx + dx, ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (tiles[ni] === T_HIDDEN && !seen.has(ni)) { seen.add(ni); stack.push(ni); }
        }
      }
      region.revealed = this.save.secrets.includes(region.id);
      if (region.revealed) region.revealT = 999;
      L.hidden.push(region);
    }
    // Decorations remain cosmetic and never occupy collision tiles.
    const rnd = mulberry32(hashStr(def.id) ^ 0x9e3779b9);
    const solidLike = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return true;
      const t = tiles[y * w + x];
      return t === T_ROCK || t === T_BRICK || t === T_HIDDEN;
    };
    const floorDensity: Record<Theme, number> = {
      cave: 0.68, ruins: 0.57, archive: 0.72, gardens: 0.84, forge: 0.45, spire: 0.54, heart: 0.64,
      abyss: 0.66, mire: 0.82, citadel: 0.48, rift: 0.6,
    };
    const ceilingDensity: Record<Theme, number> = {
      cave: 0.72, ruins: 0.66, archive: 0.78, gardens: 0.86, forge: 0.48, spire: 0.64, heart: 0.7,
      abyss: 0.74, mire: 0.72, citadel: 0.5, rift: 0.66,
    };
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (tiles[idx] !== T_AIR || occupied.has(idx)) continue;
        const below = solidLike(x, y + 1) && tiles[(y + 1) * w + x] !== T_HIDDEN;
        const above = solidLike(x, y - 1) && tiles[(y - 1) * w + x] !== T_HIDDEN;
        const r = rnd();
        if (below) {
          if (r >= floorDensity[def.theme]) continue;
          const kind = rnd();
          let type = kind < 0.15 ? 0 : kind < 0.27 ? 1 : kind < 0.35 ? 2 : kind < 0.43 ? 3
            : kind < 0.49 ? 6 : kind < 0.63 ? 12 : kind < 0.76 ? 13 : kind < 0.86 ? 14
            : kind < 0.94 ? 15 : 16;
          // Taller flowers should not hide runes, collectibles or the player's path near mechanisms.
          const nearMechanism = [-1, 0, 1].some((dx) => occupied.has(y * w + x + dx) || occupied.has((y - 1) * w + x + dx));
          const roomAbove = y > 1 && tiles[(y - 1) * w + x] === T_AIR;
          if (!roomAbove || nearMechanism) {
            if (type === 12 || type === 13 || type === 14 || type === 16) type = rnd() < 0.5 ? 15 : 2;
          }
          if (def.theme !== 'cave' && roomAbove && !nearMechanism && rnd() < 0.025) type = 8;
          const light = type === 3 || (type === 1 && rnd() < 0.42) || (type === 0 && rnd() < 0.35)
            || (type === 13 && rnd() < 0.72) || (type === 14 && rnd() < 0.40) || (type === 16 && rnd() < 0.48);
          L.decor.push({ x, y, type, variant: Math.floor(rnd() * 6), light });
        } else if (above) {
          if (r >= ceilingDensity[def.theme]) continue;
          const variant = Math.floor(rnd() * 6);
          const kind = rnd();
          let type = kind < 0.12 ? 9 : kind < 0.22 ? 4 : kind < 0.32 ? 10
            : kind < 0.44 ? 5 : kind < 0.56 ? 11 : kind < 0.66 ? 17 : kind < 0.74 ? 18
              : kind < 0.84 ? 19 : kind < 0.93 ? 20 : 21;
          let airDepth = 0;
          while (y + airDepth < h && tiles[(y + airDepth) * w + x] === T_AIR) airDepth++;
          if ((airDepth < 3 && (type === 5 || type === 9 || type === 17 || type === 18 || type === 19 || type === 20 || type === 21))
            || (type === 11 && airDepth < 4)) type = 4;
          L.decor.push({ x, y, type, variant, light: type === 4 || type === 9 || type === 10 || type === 18 || type === 19 || type === 21 || rnd() < 0.35 });
        } else if (solidLike(x - 1, y) && r < 0.09) {
          L.decor.push({ x, y, type: 7, variant: Math.floor(rnd() * 4), light: false });
        }
      }
    }

    // A separate seeded stream makes the drip pattern stable and independent of plant placement.
    const wet = mulberry32(hashStr(def.id) ^ 0x6aa76aaf);
    const wetness: Record<Theme, number> = {
      cave: 0.08, ruins: 0.04, archive: 0.105, gardens: 0.085, forge: 0.022, spire: 0.045, heart: 0.052,
      abyss: 0.1, mire: 0.06, citadel: 0.03, rift: 0.05,
    };
    for (let y = 1; y < h - 4; y++) {
      let lastX = -5;
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (tiles[idx] !== T_AIR || (tiles[idx - w] !== T_ROCK && tiles[idx - w] !== T_BRICK)) continue;
        let air = 0;
        while (y + air < h && tiles[(y + air) * w + x] === T_AIR) air++;
        if (air < 3 || x - lastX < 4 || wet() >= wetness[def.theme]) continue;
        const interval = 92 + Math.floor(wet() * 120);
        L.dripEmitters.push({ x: x * TILE + 4 + Math.floor(wet() * 8), y: y * TILE + 2, timer: Math.floor(wet() * interval), interval });
        lastX = x;
      }
    }
    // Condensation also gathers at the tips of some hanging plants and large crystals.
    for (const d of L.decor) {
      if (d.type !== 9 && d.type !== 10 && d.type !== 11 && d.type !== 18 && d.type !== 19 && d.type !== 20 && d.type !== 21) continue;
      if (wet() >= (def.theme === 'archive' || def.theme === 'gardens' ? 0.28 : 0.12)) continue;
      const tip = d.type === 9 || d.type === 19 ? 30 + (d.variant % 3) * 5 : d.type === 10 || d.type === 18 || d.type === 21
        ? 29 + (d.variant % 3) * 5 : 39;
      const px = d.x * TILE + 8, py = d.y * TILE + tip;
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (ty + 2 >= h || tiles[ty * w + tx] !== T_AIR || tiles[(ty + 1) * w + tx] !== T_AIR) continue;
      if (L.dripEmitters.some((e) => Math.abs(e.x - px) < 26 && Math.abs(e.y - py) < 30)) continue;
      const interval = 130 + Math.floor(wet() * 100);
      L.dripEmitters.push({ x: px, y: py, timer: Math.floor(wet() * interval), interval });
    }
    // The opening cavern always contains at least one visible drip, even with sparse seeds.
    if (def.id === 'cave' && !L.dripEmitters.some((e) => Math.abs(e.x - L.spawn.x * TILE) < 160)) {
      for (let x = L.spawn.x + 4; x < Math.min(w - 1, L.spawn.x + 14); x++) {
        for (let y = 2; y < L.spawn.y - 3; y++) {
          const idx = y * w + x;
          if (tiles[idx] !== T_AIR || (tiles[idx - w] !== T_ROCK && tiles[idx - w] !== T_BRICK)
            || tiles[idx + w] !== T_AIR || tiles[idx + w * 2] !== T_AIR) continue;
          L.dripEmitters.push({ x: x * TILE + 8, y: y * TILE + 2, timer: 22, interval: 105 });
          x = w;
          break;
        }
      }
    }
    return L;
  }

  /* ------------------------------------------------------------------ */
  /*  Main loop                                                          */
  /* ------------------------------------------------------------------ */
  private loop = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(100, now - this.lastTime);
    this.lastTime = now;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP_MS && n < 5) {
      this.step();
      this.acc -= STEP_MS;
      n++;
    }
    if (n === 5) this.acc = 0;
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private render() {
    const bctx = this.buffer.getContext('2d')!;
    this.renderer.draw(bctx);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.drawImage(this.buffer, this.offX, this.offY, this.view.w * this.scale, this.view.h * this.scale);
  }

  /* ------------------------------------------------------------------ */
  /*  Simulation step                                                    */
  /* ------------------------------------------------------------------ */
  private step() {
    this.frame++;
    if (this.swapCd > 0) this.swapCd--;
    if (this.camFast > 0) this.camFast--;
    const input = this.input;
    if (this.mode === 'playing') {
      if (input.justPressed('pause')) {
        this.pause();
        input.endStep();
        return;
      }
      if (input.justPressed('swap')) this.swapCharacter();
      this.updateMovers();
      this.updateBoss();
      this.updatePlayer();
      if (this.isWeaver()) this.updateWeaver(); else this.updateRecording();
      this.updateEchoes();
      this.updateCrumbles();
      this.updateMechanisms();
      this.updateEnemies();
      this.updateBossContacts();
      this.updateInteractions();
      this.updateDrips();
      if (this.frame % 10 === 0) this.updateMusicTension();
      if (!this.recording) this.energy = Math.min(this.stats.recordTime, this.energy + this.stats.regen / 60);
      this.updateAmbientParticles();
    } else if (this.mode === 'intro') {
      this.introFrame++;
      this.player.animT++;
      this.updateDrips();
      this.updateAmbientParticles();
    } else if (this.mode === 'dying') {
      this.deathT++;
      if (this.deathT % 4 === 0) this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, { count: 3, color: ['#6ff3ff', '#2f93b5'], speed: 0.8, life: 40, glow: true, g: -0.02 });
      if (this.deathT >= 80) {
        this.mode = 'dead';
        this.onEvent({ type: 'death' });
      }
      this.updateMovers();
      this.updateCrumbles();
      this.updateDrips();
    } else if (this.mode === 'transition') {
      const tr = this.transition!;
      tr.t++;
      if (tr.t === 40) {
        if (tr.next) {
          this.loadLevel(tr.next);
          this.save.checkpoint = { level: tr.next, x: this.level.spawn.x, y: this.level.spawn.y };
          this.player.hp = this.stats.maxHp;
          this.energy = this.stats.recordTime;
          this.saveNow();
          this.audio.startAmbient(this.level.def.theme);
          this.audio.startMusic(this.level.def.theme);
        } else {
          this.mode = 'victory';
          this.audio.stopMusic();
          this.save.completed = true;
          this.saveNow();
          this.audio.play('victory');
          this.onEvent({ type: 'victory', stats: { crystals: this.save.totalCrystals, deaths: this.save.deaths, secrets: this.save.secrets.length, secretsTotal: TOTAL_SECRETS, time: this.save.playtime } });
          input.endStep();
          return;
        }
      }
      if (tr.t >= 80) {
        this.mode = 'playing';
        this.transition = null;
      }
    }
    if (this.mode !== 'paused' && this.mode !== 'shop' && this.mode !== 'dead') this.particles.update();
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      if (--this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
    if (this.level) for (const c of this.level.captives) if (c.freed && c.open < 1) c.open = Math.min(1, c.open + 0.025);
    this.updateCamera();
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.4);
    if (this.flash > 0) this.flash--;
    if (this.message && this.frame > this.message.until) this.message = null;
    input.endStep();
    if (this.frame % 3 === 0) this.emitHud();
  }

  /* ------------------------------------------------------------------ */
  /*  Collision helpers                                                  */
  /* ------------------------------------------------------------------ */
  tile(tx: number, ty: number): number {
    const L = this.level;
    if (tx < 0 || tx >= L.w || ty < 0 || ty >= L.h) return T_AIR;
    return L.tiles[ty * L.w + tx];
  }

  solid(tx: number, ty: number): boolean {
    const L = this.level;
    if (tx < 0 || tx >= L.w) return true;
    if (ty < 0) return true;
    if (ty >= L.h) return false;
    const boss = L.boss;
    if (boss && boss.active && !boss.defeated) {
      const [left, right, top, bottom] = boss.arena;
      const fy = ty * TILE + TILE / 2;
      if ((tx === Math.floor(left / TILE) || tx === Math.floor(right / TILE)) && fy >= top && fy < bottom) return true;
    }
    const idx = ty * L.w + tx;
    const t = L.tiles[idx];
    if (t === T_ROCK || t === T_BRICK || t === T_VEIL_ECHO || t === T_SPRING) return true;
    if (t === T_CRUMBLE) {
      const c = L.crumbles.get(idx);
      return !c || c.state !== 2;
    }
    if (t === T_DOOR) {
      const d = L.doorAt.get(idx);
      return !!d && !d.open && !d.blocked;
    }
    return false;
  }

  groundAt(tx: number, ty: number): boolean {
    return this.solid(tx, ty) || this.tile(tx, ty) === T_ONEWAY;
  }

  /** Gejzer wybija gorącą kolumną w nieregularnych odstępach; każde źródło ma własny rytm. */
  geyserActive(tx: number, ty: number): boolean {
    const cycle = (tx * 31 + ty * 17) % 220;
    return ((this.frame + cycle) % 220) < 128;
  }

  rectSolid(x: number, y: number, w: number, h: number): boolean {
    const x1 = Math.floor(x / TILE), x2 = Math.floor((x + w - 0.01) / TILE);
    const y1 = Math.floor(y / TILE), y2 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y1; ty <= y2; ty++) for (let tx = x1; tx <= x2; tx++) if (this.solid(tx, ty)) return true;
    return false;
  }

  private moveX(a: Actor, dx: number): boolean {
    a.x += dx;
    const y1 = Math.floor(a.y / TILE), y2 = Math.floor((a.y + a.h - 0.01) / TILE);
    if (dx > 0) {
      const tx = Math.floor((a.x + a.w - 0.01) / TILE);
      for (let ty = y1; ty <= y2; ty++) if (this.solid(tx, ty)) { a.x = tx * TILE - a.w; a.vx = 0; return true; }
    } else if (dx < 0) {
      const tx = Math.floor(a.x / TILE);
      for (let ty = y1; ty <= y2; ty++) if (this.solid(tx, ty)) { a.x = (tx + 1) * TILE; a.vx = 0; return true; }
    }
    return false;
  }

  private moveY(a: Actor, dy: number, prevBottom: number, dropping: boolean): { landedTile: number | null } {
    a.y += dy;
    a.onGround = false;
    const x1 = Math.floor(a.x / TILE), x2 = Math.floor((a.x + a.w - 0.01) / TILE);
    let landedTile: number | null = null;
    if (dy >= 0) {
      const ty = Math.floor((a.y + a.h - 0.01) / TILE);
      for (let tx = x1; tx <= x2; tx++) {
        const t = this.tile(tx, ty);
        const oneWay = t === T_ONEWAY && !dropping && prevBottom <= ty * TILE + 0.01;
        if (this.solid(tx, ty) || oneWay) {
          a.y = ty * TILE - a.h;
          a.vy = 0;
          a.onGround = true;
          landedTile = ty * this.level.w + tx;
          break;
        }
      }
    } else {
      const ty = Math.floor(a.y / TILE);
      for (let tx = x1; tx <= x2; tx++) if (this.solid(tx, ty)) { a.y = (ty + 1) * TILE; a.vy = 0; break; }
    }
    return { landedTile };
  }

  private landOnMovers(a: Actor, prevBottom: number, dropping: boolean): Mover | null {
    if (a.vy < 0 || dropping) return null;
    for (const m of this.level.movers) {
      if (m.spikes) continue;
      if (a.x + a.w <= m.x || a.x >= m.x + m.w) continue;
      if (prevBottom <= m.prevY + 2 && a.y + a.h >= m.y) {
        a.y = m.y - a.h;
        a.vy = 0;
        a.onGround = true;
        return m;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /*  Player                                                             */
  /* ------------------------------------------------------------------ */
  private updatePlayer() {
    const p = this.player;
    const st = this.stats;
    const input = this.input;
    if (p.invuln > 0) p.invuln--;
    if (p.hurtT > 0) p.hurtT--;
    if (p.dropThrough > 0) p.dropThrough--;
    if (p.bounceT > 0) p.bounceT--;
    if (p.landT > 0) p.landT--;
    if (p.actT > 0) p.actT--;
    if (p.dashCd > 0) p.dashCd--;
    if (p.wallLock > 0) p.wallLock--;
    if (p.blinkT > 0) p.blinkT--;
    if (p.wallCoyote > 0) p.wallCoyote--;
    const weaver = this.isWeaver();
    p.animT++;
    const left = input.isDown('left'), right = input.isDown('right');
    if (input.justPressed('jump')) p.jumpBuffer = JUMP_BUFFER; else if (p.jumpBuffer > 0) p.jumpBuffer--;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    // --- Weaver: dash (one charge per airtime, refilled on the ground, a wall kick or a blink) ---
    if (weaver) {
      if (p.onGround && p.dashT === 0) p.dashesLeft = st.dashes;
      if (input.justPressed('dash') && p.dashT === 0 && p.dashCd === 0 && p.dashesLeft > 0 && p.hurtT === 0) {
        p.dashDir = (p.clinging ? -p.wallSide : dir !== 0 ? dir : p.facing) as 1 | -1;
        p.facing = p.dashDir;
        p.dashT = DASH_FRAMES;
        p.dashesLeft--;
        p.vy = 0;
        p.onMover = null;
        p.jumpBuffer = 0;
        p.clinging = false;
        this.audio.play('dash');
        this.pushGhost();
        this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 10, color: ['#c9a6ff', '#ffb347', '#ffffff'], speed: 1.6, life: 24, glow: true, dirX: -p.dashDir * 1.2, drag: 0.92 });
      }
    }
    if (p.dashT > 0) {
      p.vx = p.dashDir * DASH_V;
    } else if (p.hurtT === 0) {
      const target = dir * st.speed;
      const accel = p.wallLock > 0 ? 0.07 : p.onGround ? 0.35 : 0.22;
      p.vx += Math.max(-accel, Math.min(accel, target - p.vx));
      if (dir !== 0 && p.wallLock === 0) p.facing = dir as 1 | -1;
    } else {
      p.vx *= 0.96;
    }
    if (p.onGround) p.coyote = COYOTE; else if (p.coyote > 0) p.coyote--;
    if (p.jumpBuffer > 0 && p.coyote > 0 && p.hurtT === 0) {
      const standingOnOneWay = this.standingOnOneWayOnly(p);
      if (input.isDown('down') && (standingOnOneWay || p.onMover)) {
        p.dropThrough = 10;
        p.onMover = null;
        p.jumpBuffer = 0;
        p.coyote = 0;
      } else {
        p.vy = st.jump;
        p.onGround = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.onMover = null;
        this.audio.play('jump');
        this.particles.burst(p.x + p.w / 2, p.y + p.h, { count: 5, color: ['#6a7092', '#9aa0bd'], speed: 0.8, life: 20, up: true, spread: 2 });
      }
    }
    // --- Weaver: wall cling & wall jump ---
    p.clinging = false;
    if (weaver && !p.onGround && p.dashT === 0 && p.hurtT === 0) {
      const wy1 = Math.floor((p.y + 3) / TILE), wy2 = Math.floor((p.y + p.h - 3) / TILE);
      const rx = Math.floor((p.x + p.w + 0.6) / TILE), lx = Math.floor((p.x - 0.6) / TILE);
      let side: -1 | 0 | 1 = 0;
      if (this.solid(rx, wy1) && this.solid(rx, wy2)) side = 1;
      else if (this.solid(lx, wy1) && this.solid(lx, wy2)) side = -1;
      if (side !== 0) {
        p.wallSide = side;
        p.wallCoyote = 6;
        if (dir === side && p.vy > -0.5) {
          p.clinging = true;
          p.facing = side;
          if (this.frame % 5 === 0) this.particles.burst(p.x + (side > 0 ? p.w : 0), p.y + 4, { count: 1, color: ['#9aa0bd', '#c9a6ff'], speed: 0.3, life: 18, g: 0.04 });
        }
      }
    }
    if (weaver && p.jumpBuffer > 0 && !p.onGround && p.wallCoyote > 0 && p.wallSide !== 0 && p.hurtT === 0 && p.dashT === 0) {
      p.vy = st.jump * 0.96;
      p.vx = -p.wallSide * 2.8;
      p.facing = (-p.wallSide) as 1 | -1;
      p.wallLock = 10;
      p.wallCoyote = 0;
      p.jumpBuffer = 0;
      p.clinging = false;
      p.dashesLeft = st.dashes;
      p.onMover = null;
      this.audio.play('wallKick');
      this.particles.burst(p.x + (p.wallSide > 0 ? p.w : 0), p.y + p.h / 2, { count: 8, color: ['#c9a6ff', '#ffffff', '#ffb347'], speed: 1.4, life: 22, glow: true, dirX: -p.wallSide * 0.8 });
    }
    if (!input.isDown('jump') && p.vy < -2.5 && p.bounceT === 0) p.vy = -2.5;
    if (p.dashT > 0 && p.vy >= 0) {
      p.vy = 0.16; // a flat dash that still keeps contact with the floor
    } else {
      if (p.dashT > 0) { p.dashT = 0; p.dashCd = 8; } // jumping out of a dash cancels it but keeps the speed
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
      if (p.clinging && p.vy > 0.9) p.vy = 0.9;
    }
    // updraft columns & geysers
    p.inUpdraft = false;
    {
      const ux1 = Math.floor(p.x / TILE), ux2 = Math.floor((p.x + p.w - 0.01) / TILE);
      const uy1 = Math.floor(p.y / TILE), uy2 = Math.floor((p.y + p.h - 0.01) / TILE);
      let geyserLift = 0;
      outer: for (let ty = uy1; ty <= uy2; ty++) {
        for (let tx = ux1; tx <= ux2; tx++) {
          const tile = this.tile(tx, ty);
          if (tile === T_UPDRAFT) { p.inUpdraft = true; break outer; }
          if (tile === T_GEYSER && this.geyserActive(tx, ty)) {
            // each erupting column has its own burst height
            geyserLift = Math.max(geyserLift, 0.92);
            p.inUpdraft = true;
          }
        }
      }
      if (geyserLift > 0) {
        p.vy = Math.max(-5.2, p.vy - geyserLift);
        p.bounceT = Math.max(p.bounceT, 2);
        if (this.frame % 3 === 0) this.particles.burst(p.x + Math.random() * p.w, p.y + p.h, { count: 1, color: ['#b6f2ff', '#75bfda', '#ffffff'], speed: 0.5, life: 22, glow: true, g: -0.12 });
      } else if (p.inUpdraft) {
        p.vy = Math.max(UPDRAFT_MAX_VY, p.vy - UPDRAFT_LIFT);
        p.bounceT = Math.max(p.bounceT, 2);
        if (this.frame % 4 === 0) this.particles.burst(p.x + Math.random() * p.w, p.y + p.h, { count: 1, color: ['#9ffbe6', '#ffffff'], speed: 0.3, life: 25, glow: true, g: -0.08 });
      }
    }
    if (p.onMover) {
      const m = p.onMover;
      if (p.x + p.w > m.x && p.x < m.x + m.w) {
        p.x += m.vx;
        p.y = m.y - p.h;
      } else {
        p.onMover = null;
      }
    }
    const wasOnGround = p.onGround;
    const prevBottom = p.y + p.h;
    const impactVy = p.vy;
    p.prevBottom = prevBottom;
    const hitX = this.moveX(p, p.vx);
    const dropping = p.dropThrough > 0;
    const { landedTile } = this.moveY(p, p.vy, prevBottom, dropping);
    const m = this.landOnMovers(p, prevBottom, dropping);
    p.onMover = m;
    if (p.dashT > 0) {
      if (this.frame % 2 === 0) this.pushGhost();
      this.particles.burst(p.x + p.w / 2 - p.dashDir * 4, p.y + p.h / 2 + 2, { count: 1, color: ['#c9a6ff', '#ffffff', '#ffb347'], speed: 0.4, life: 18, glow: true, drag: 0.95 });
      p.dashT = hitX ? 0 : p.dashT - 1;
      if (p.dashT === 0) { p.dashCd = 14; p.vx *= 0.55; }
    }
    if (landedTile !== null) {
      const c = this.level.crumbles.get(landedTile);
      if (c && c.state === 0) { c.state = 1; c.timer = 28; }
      const sp = this.level.springs.get(landedTile);
      if (sp) {
        p.vy = BOUNCE_VY;
        p.onGround = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.bounceT = 34;
        sp.squash = 1;
        this.audio.play('spring');
        this.particles.burst(sp.x * TILE + 8, sp.y * TILE + 2, { count: 10, color: ['#ffd36a', '#d8ffe8', '#ffffff'], speed: 1.4, life: 30, glow: true, up: true, spread: 2.2 });
      }
    }
    // spiked blocks
    for (const mv of this.level.movers) {
      if (!mv.spikes) continue;
      if (overlap(p, { x: mv.x, y: mv.y - 4, w: mv.w, h: mv.h + 8 })) { this.hurt(1, mv.x + mv.w / 2); break; }
    }
    // portals (re-armed only after the player leaves the destination rift)
    {
      const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      let inside: typeof this.level.portals[number] | null = null;
      for (const po of this.level.portals) {
        if (po.partner && Math.abs(pcx - (po.x * TILE + 8)) < 7 && Math.abs(pcy - (po.y * TILE + 8)) < 12) { inside = po; break; }
      }
      if (!inside) p.portalCd = 0;
      else if (p.portalCd === 0) {
        const po = inside;
        const dest = po.partner!;
        this.particles.burst(pcx, pcy, { count: 22, color: ['#6ff3ff', '#c15cf5', '#ffffff'], speed: 2, life: 40, glow: true, drag: 0.93 });
        p.x = dest.x * TILE + (TILE - PLAYER_W) / 2;
        p.y = dest.y * TILE + TILE - PLAYER_H;
        p.vy = Math.min(p.vy, 0);
        p.onMover = null;
        p.portalCd = 1; // armed again once the player steps out of the destination rift
        po.pulse = 1; dest.pulse = 1;
        this.flash = Math.max(this.flash, 8);
        this.audio.play('portal');
        this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 22, color: ['#6ff3ff', '#c15cf5', '#ffffff'], speed: 2, life: 40, glow: true, drag: 0.93 });
      }
    }
    if (!wasOnGround && p.onGround) {
      this.audio.play('land');
      const heavy = impactVy > 4.2;
      p.landT = heavy ? 11 : 6;
      this.particles.burst(p.x + p.w / 2, p.y + p.h, { count: heavy ? 10 : 6, color: ['#6a7092', '#9aa0bd'], speed: heavy ? 1.4 : 1, life: 18, up: true, spread: 2.5 });
    }
    // animation state machine
    const prevAnim = p.anim;
    const braking = dir !== 0 && p.vx * dir < -0.3 && Math.abs(p.vx) > 0.75;
    if (p.hurtT > 0) p.anim = 'hurt';
    else if (p.dashT > 0) p.anim = 'dash';
    else if (p.clinging) p.anim = 'wall';
    else if (p.blinkT > 0) p.anim = 'blink';
    else if (p.inUpdraft) p.anim = 'float';
    else if (!p.onGround) {
      if (p.bounceT > 22) p.anim = 'launch';
      else if (p.vy < -1.3) p.anim = 'jump';
      else if (p.vy > 1.3) p.anim = 'fall';
      else p.anim = 'apex';
    } else if (p.landT > 0) p.anim = 'land';
    else if (braking) p.anim = 'turn';
    else if (p.actT > 0) p.anim = 'interact';
    else if (Math.abs(p.vx) > 0.25) p.anim = 'run';
    else p.anim = 'idle';
    if (prevAnim !== p.anim) p.animT = 0;
    // motion dust
    if (p.anim === 'turn' && this.frame % 3 === 0) {
      this.particles.burst(p.x + p.w / 2 - Math.sign(p.vx) * 4, p.y + p.h, { count: 2, color: ['#6a7092', '#9aa0bd'], speed: 0.7, life: 20, up: true, spread: 1.8, dirX: -Math.sign(p.vx) * 0.4 });
    } else if (p.anim === 'run' && this.frame % 11 === 0) {
      this.particles.burst(p.x + p.w / 2 - Math.sign(p.vx) * 3, p.y + p.h, { count: 1, color: '#6a7092', speed: 0.4, life: 16, up: true, spread: 1.4 });
    }
    // hazards
    this.checkHazards();
  }

  private standingOnOneWayOnly(a: Actor): boolean {
    const ty = Math.floor((a.y + a.h + 0.5) / TILE);
    const x1 = Math.floor(a.x / TILE), x2 = Math.floor((a.x + a.w - 0.01) / TILE);
    let oneway = false;
    for (let tx = x1; tx <= x2; tx++) {
      if (this.solid(tx, ty)) return false;
      if (this.tile(tx, ty) === T_ONEWAY) oneway = true;
    }
    return oneway;
  }

  private checkHazards() {
    const p = this.player;
    const L = this.level;
    if (p.dead) return;
    if (p.y > L.h * TILE + 24) { this.drown(); return; }
    const x1 = Math.floor(p.x / TILE), x2 = Math.floor((p.x + p.w - 0.01) / TILE);
    const y1 = Math.floor(p.y / TILE), y2 = Math.floor((p.y + p.h - 0.01) / TILE);
    for (let ty = y1; ty <= y2; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const t = this.tile(tx, ty);
        if (t === T_SPIKE) {
          const box = { x: tx * TILE + 2, y: ty * TILE + 7, w: 12, h: 9 };
          if (overlap(p, box)) { this.hurt(1, tx * TILE + 8); return; }
        } else if (t === T_WATER) {
          const cx = p.x + p.w / 2, cy = p.y + p.h - 2;
          if (cx >= tx * TILE && cx < tx * TILE + TILE && cy >= ty * TILE) { this.drown(); return; }
        }
      }
    }
  }

  private drown() {
    const p = this.player;
    this.audio.play('splash');
    this.particles.burst(p.x + p.w / 2, p.y + p.h, { count: 18, color: ['#2f93b5', '#6ff3ff', '#1a4a6a'], speed: 2, life: 40, up: true, g: 0.1 });
    this.hurt(1, p.x, true);
    if (!p.dead) {
      this.teleportToCheckpoint();
      this.flash = 18;
      this.say('Ciemna woda odrzuca Cię do punktu kontrolnego.');
    }
  }

  private teleportToCheckpoint() {
    const cp = this.save.checkpoint;
    const t = cp && cp.level === this.level.def.id ? { x: cp.x, y: cp.y } : this.level.spawn;
    const p = this.player;
    p.x = t.x * TILE + (TILE - PLAYER_W) / 2;
    p.y = t.y * TILE + TILE - PLAYER_H;
    p.vx = 0; p.vy = 0; p.onMover = null; p.hurtT = 0;
    this.snapCamera();
  }

  hurt(dmg: number, fromX: number, silentKnock = false) {
    const p = this.player;
    if (p.dead || p.invuln > 0 || p.dashT > 0) return; // a dash makes the Weaver untouchable
    p.hp -= dmg;
    p.invuln = INVULN_FRAMES;
    this.audio.play('hurt');
    if (this.settings.shake) this.shake = 5;
    this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 12, color: ['#ff4d6d', '#ffffff', '#ff9bb0'], speed: 1.8, life: 30 });
    if (!silentKnock) {
      p.hurtT = 18;
      p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 2.4;
      p.vy = -3.2;
      p.onGround = false;
      p.onMover = null;
    }
    if (p.hp <= 0) this.die();
  }

  private die() {
    const p = this.player;
    p.dead = true;
    p.hp = 0;
    p.anim = 'dead';
    this.mode = 'dying';
    this.deathT = 0;
    this.save.deaths++;
    this.audio.play('death');
    if (this.settings.shake) this.shake = 8;
    this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 40, color: ['#6ff3ff', '#2f93b5', '#ffffff', '#31295e'], speed: 2.2, life: 60, glow: true, g: 0.03 });
    this.recording = null;
    this.anchors = [];
    for (const e of this.echoes) e.state = 'fading';
    this.input.reset();
  }

  respawn() {
    this.resetDynamic();
    const p = this.player;
    p.dead = false;
    p.hp = this.stats.maxHp;
    p.invuln = 60;
    p.anim = 'idle';
    this.teleportToCheckpoint();
    this.energy = this.stats.recordTime;
    this.mode = 'playing';
    this.input.reset();
    this.lastTime = performance.now();
    this.acc = 0;
    this.audio.play('respawn');
    this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 25, color: ['#6ff3ff', '#ffffff'], speed: 1.5, life: 40, glow: true });
  }

  private resetDynamic() {
    const L = this.level;
    this.echoes = [];
    this.recording = null;
    this.particles.clear();
    for (const en of L.enemies) {
      en.x = en.spawnX; en.y = en.spawnY; en.vx = 0; en.vy = 0; en.state = 'patrol'; en.timer = 0; en.satiated = 0; en.alert = 0; en.hunting = false; en.facing = 1;
    }
    for (const c of L.crumbles.values()) { c.state = 0; c.timer = 0; }
    for (const lv of L.levers) if (lv.timed) lv.timer = 0;
    for (const m of L.movers) {
      m.prog = m.phase * m.len; m.dir = 1; m.pause = 0; m.active = false;
      const f = m.len > 0 ? m.prog / m.len : 0;
      m.x = m.x0 + (m.x1 - m.x0) * f; m.y = m.y0 + (m.y1 - m.y0) * f; m.prevY = m.y; m.vx = 0; m.vy = 0;
    }
    if (L.boss && !L.boss.defeated) {
      const b = L.boss;
      b.x = b.spawnX;
      b.y = b.spawnY;
      b.vx = 0; b.vy = 0;
      b.hp = b.maxHp; b.phase = 1; b.state = 'sleep'; b.active = false; b.vulnerable = false;
      b.timer = 0; b.cooldown = 100; b.hitLock = 0; b.attacks = 0; b.projectiles.length = 0;
    }
    for (const sp of L.springs.values()) sp.squash = 0;
    for (const pr of L.prisms) pr.charge = 0;
    this.player.portalCd = 0;
    this.player.bounceT = 0;
    this.anchors = [];
    this.ghosts = [];
    const pl = this.player;
    pl.dashT = 0; pl.dashCd = 0; pl.clinging = false; pl.wallCoyote = 0; pl.wallLock = 0; pl.blinkT = 0; pl.dashesLeft = this.stats.dashes;
    if (L.boss && !L.boss.defeated) {
      const b = L.boss;
      b.x = b.spawnX; b.y = b.spawnY; b.vx = 0; b.vy = 0;
      b.hp = b.maxHp; b.phase = 1; b.state = 'sleep'; b.active = false; b.vulnerable = false;
      b.timer = 0; b.cooldown = 100; b.hitLock = 0; b.attacks = 0; b.projectiles.length = 0;
    }
  }

  private liveEchoCount(): number {
    return this.echoes.filter((e) => e.state !== 'fading' && !e.reflected).length;
  }

  /* ------------------------------------------------------------------ */
  /*  Characters: the Echo Wanderer and the Shadow Weaver                */
  /* ------------------------------------------------------------------ */
  isWeaver(): boolean {
    return this.save.character === 'weaver';
  }

  hasCharacter(id: CharId): boolean {
    return this.save.characters.includes(id);
  }

  canSwap(): boolean {
    return this.save.characters.length > 1 && !this.recording && !this.player.dead;
  }

  swapCharacter(id?: CharId): boolean {
    const chars = this.save.characters;
    const p = this.player;
    if (chars.length < 2 || p.dead || this.swapCd > 0) return false;
    if (this.recording) {
      this.say('Zakończ nagrywanie [Q], zanim zmienisz postać.');
      this.audio.play('denied');
      return false;
    }
    const next: CharId = id ?? chars[(chars.indexOf(this.save.character) + 1) % chars.length];
    if (next === this.save.character || !chars.includes(next)) return false;
    const old = this.stats;
    this.save.character = next;
    this.stats = computeStats(this.save.upgrades, next);
    // wounds carry over between characters
    const missing = Math.max(0, old.maxHp - p.hp);
    p.hp = Math.max(1, this.stats.maxHp - missing);
    this.energy = Math.min(this.energy, this.stats.recordTime);
    // wind down everything that belonged to the previous character
    for (const e of this.echoes) if (e.state !== 'fading') { e.state = 'fading'; e.fade = 20; }
    this.anchors = [];
    p.dashT = 0; p.dashCd = 0; p.clinging = false; p.wallCoyote = 0; p.wallLock = 0; p.blinkT = 0; p.dashesLeft = this.stats.dashes;
    this.swapCd = 40;
    this.audio.play('swap');
    this.flash = Math.max(this.flash, 7);
    this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, {
      count: 34, color: next === 'weaver' ? ['#c9a6ff', '#ffb347', '#ffffff'] : ['#6ff3ff', '#c8fbff', '#ffffff'], speed: 2.2, life: 45, glow: true, drag: 0.93,
    });
    this.say(`${CHARACTERS[next].name} — ${CHARACTERS[next].title}`);
    this.saveNow();
    return true;
  }

  /** Adds a character to the roster and shows the unlock screen. */
  unlockCharacter(id: CharId) {
    if (!this.save.characters.includes(id)) this.save.characters.push(id);
    this.audio.play('unlock');
    this.mode = 'unlock';
    this.input.reset();
    this.saveNow();
    this.onEvent({ type: 'unlock', char: id });
  }

  /** Fallback for players who skipped the cage: buy the character at an altar. */
  buyCharacter(id: CharId): boolean {
    const def = CHARACTERS[id];
    if (this.hasCharacter(id)) return false;
    if (this.save.crystals < def.price) {
      this.audio.play('denied');
      return false;
    }
    this.save.crystals -= def.price;
    this.save.characters.push(id);
    this.audio.play('unlock');
    this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, { count: 40, color: ['#ffb347', '#c9a6ff', '#ffffff'], speed: 2.2, life: 55, glow: true });
    this.say(`${def.name} dołącza do Ciebie! Zmieniaj postacie klawiszem [C].`);
    this.saveNow();
    return true;
  }

  private freeCaptive(cp: Captive) {
    cp.freed = true;
    this.audio.play('cage');
    this.flash = 20;
    if (this.settings.shake) this.shake = 6;
    this.particles.burst(cp.x * TILE + 8, cp.y * TILE + 4, { count: 60, color: ['#ffb347', '#ffe2a8', '#ffffff', '#c9a6ff'], speed: 2.6, life: 70, glow: true, drag: 0.94 });
    this.unlockCharacter(cp.char);
  }

  private pushGhost() {
    const p = this.player;
    this.ghosts.push({ x: p.x, y: p.y, facing: p.facing, anim: p.anim, t: p.animT, life: 14, max: 14 });
  }

  private touchesTile(r: { x: number; y: number; w: number; h: number }, tile: number): boolean {
    const x1 = Math.floor(r.x / TILE), x2 = Math.floor((r.x + r.w - 0.01) / TILE);
    const y1 = Math.floor(r.y / TILE), y2 = Math.floor((r.y + r.h - 0.01) / TILE);
    for (let ty = y1; ty <= y2; ty++) for (let tx = x1; tx <= x2; tx++) if (this.tile(tx, ty) === tile) return true;
    return false;
  }

  /** Weaver replacement for the echo system: place a Shadow Anchor, then blink to it. */
  private updateWeaver() {
    const input = this.input;
    const p = this.player;
    if (p.dead) return;
    const live = this.anchors.some((a) => a.state === 'live');
    if (input.justPressed('echo')) {
      if (live) this.blinkToAnchor();
      else this.placeAnchor();
    }
    if (input.justPressed('clear') && live) this.dismissAnchors();
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i];
      a.age++;
      if (a.state === 'live') {
        if (Number.isFinite(a.lifeMax) && --a.life <= 0) {
          a.state = 'fading';
          a.fade = 24;
          this.audio.play('echoFade');
          this.say('Kotwica Cienia rozpłynęła się.');
        } else if (this.touchesTile(a, T_VEIL_LIFE)) {
          a.state = 'fading';
          a.fade = 18;
          this.audio.play('veil');
          this.say('Bursztynowa Zasłona rozproszyła Kotwicę.');
          this.particles.burst(a.x + a.w / 2, a.y + a.h / 2, { count: 16, color: ['#ffd27a', '#ffaa3c', '#ffffff'], speed: 1.6, life: 35, glow: true });
        } else if (this.frame % 7 === 0) {
          this.particles.burst(a.x + a.w / 2, a.y + a.h - 2, { count: 1, color: ['#c9a6ff', '#ffffff'], speed: 0.3, life: 30, glow: true, g: -0.04 });
        }
      } else if (--a.fade <= 0) {
        this.anchors.splice(i, 1);
      }
    }
  }

  private placeAnchor() {
    const p = this.player;
    const st = this.stats;
    if (this.energy < st.anchorCost) {
      this.say('Za mało energii cienia. Poczekaj na odnowienie.');
      this.audio.play('denied');
      return;
    }
    this.energy -= st.anchorCost;
    this.anchors = [{
      id: ++this.anchorSeq, x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H, facing: p.facing,
      life: st.anchorLife * 60, lifeMax: st.anchorLife * 60, age: 0, state: 'live', fade: 24,
    }];
    p.actT = 12;
    this.audio.play('anchor');
    this.particles.burst(p.x + p.w / 2, p.y + p.h - 2, { count: 18, color: ['#c9a6ff', '#ffb347', '#ffffff'], speed: 1.4, life: 36, glow: true, up: true, spread: 2.4 });
    this.say('Kotwica Cienia zapuszczona. [Q] — skocz do niej, [R] — rozproś.');
  }

  private blinkToAnchor() {
    const p = this.player;
    const a = this.anchors.find((x) => x.state === 'live');
    if (!a) return;
    if (this.rectSolid(a.x, a.y, a.w, a.h)) {
      this.anchors = [];
      this.say('Kotwica została zasypana — nie ma już dokąd skoczyć.');
      this.audio.play('denied');
      return;
    }
    this.pushGhost();
    this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 26, color: ['#c9a6ff', '#ffb347', '#ffffff'], speed: 2.2, life: 40, glow: true, drag: 0.93 });
    p.x = a.x;
    p.y = a.y;
    p.vx *= 0.35;
    p.vy = Math.min(p.vy * 0.3, 0);
    p.onMover = null;
    p.coyote = COYOTE;
    p.dashT = 0;
    p.clinging = false;
    p.dashesLeft = this.stats.dashes; // a blink refills the dash
    p.blinkT = 10;
    this.anchors = this.anchors.filter((x) => x !== a);
    this.audio.play('blink');
    this.flash = Math.max(this.flash, 5);
    this.camFast = 40;
    this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 26, color: ['#c9a6ff', '#ffb347', '#ffffff'], speed: 2.2, life: 40, glow: true, drag: 0.93 });
  }

  dismissAnchors() {
    let any = false;
    for (const a of this.anchors) if (a.state === 'live') { a.state = 'fading'; a.fade = 20; any = true; }
    if (any) { this.audio.play('echoFade'); this.say('Kotwica rozproszona.'); }
  }

  /* ------------------------------------------------------------------ */
  /*  Echo system                                                        */
  /* ------------------------------------------------------------------ */
  private updateRecording() {
    const input = this.input;
    const p = this.player;
    if (input.justPressed('echo')) {
      if (this.recording) this.stopRecording();
      else this.startRecording();
    }
    if (input.justPressed('clear')) {
      if (this.recording) {
        this.recording = null;
        this.say('Nagrywanie przerwane.');
        this.audio.play('recStop');
      } else if (this.echoes.length) {
        this.dismissEchoes();
      }
    }
    if (input.justPressed('memory')) this.summonMemory();
    if (this.recording) {
      const rec = this.recording;
      rec.frames.push({ x: p.x, y: p.y, f: p.facing, a: p.anim, i: input.justPressed('interact') });
      this.energy -= 1 / 60;
      if (rec.frames.length % 6 === 0) this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 1, color: '#ff4d6d', speed: 0.3, life: 25, glow: true, g: -0.02 });
      if (this.energy <= 0 || rec.frames.length >= this.stats.recordTime * 60) {
        this.energy = Math.max(0, this.energy);
        this.stopRecording(true);
      }
    }
  }

  private startRecording() {
    if (this.player.dead) return;
    if (this.liveEchoCount() >= this.stats.maxEchoes) {
      this.say(`Brak wolnych ech (${this.stats.maxEchoes}). Naciśnij R, aby je rozproszyć.`);
      this.audio.play('denied');
      return;
    }
    if (this.energy < 1) {
      this.say('Za mało energii echa. Poczekaj na odnowienie.');
      this.audio.play('denied');
      return;
    }
    this.recording = { frames: [], startX: this.player.x, startY: this.player.y };
    this.audio.play('recStart');
    this.say('Nagrywanie... Naciśnij Q ponownie, aby przywołać echo.');
  }

  private stopRecording(auto = false) {
    const rec = this.recording;
    this.recording = null;
    if (!rec) return;
    if (rec.frames.length < 12) {
      this.say('Nagranie zbyt krótkie.');
      this.audio.play('denied');
      return;
    }
    this.lastRecording = rec;
    this.audio.play('recStop');
    this.spawnEcho(rec);
    if (auto) this.say('Limit nagrania — echo przywołane automatycznie.');
  }

  private spawnEcho(rec: Recording) {
    const live = this.echoes.filter((e) => e.state !== 'fading' && !e.reflected);
    if (live.length >= this.stats.maxEchoes) {
      live[0].state = 'fading';
      live[0].fade = 20;
    }
    const first = rec.frames[0];
    const echo: Echo = {
      id: ++this.echoSeq, frames: rec.frames, t: 0, x: first.x, y: first.y, w: PLAYER_W, h: PLAYER_H, facing: first.f, anim: first.a,
      state: 'playing', linger: this.stats.linger * 60, lingerMax: this.stats.linger * 60, fade: 30, trail: [], age: 0,
      prisms: new Set(), reflected: false,
    };
    this.echoes.push(echo);
    this.audio.play('summon');
    this.particles.burst(first.x + PLAYER_W / 2, first.y + PLAYER_H / 2, { count: 36, color: ['#6ff3ff', '#c8fbff', '#2f93b5'], speed: 2.4, life: 45, glow: true, drag: 0.93 });
    if (this.settings.shake) this.shake = Math.max(this.shake, 2);
  }

  /** A prism splits a playing echo: the remainder of its path is mirrored around the prism's axis. */
  private spawnReflection(src: Echo, prism: Prism) {
    const axis = prism.x * TILE + 8;
    const frames = src.frames.slice(src.t).map((f) => ({ x: 2 * axis - f.x - PLAYER_W, y: f.y, f: (f.f * -1) as 1 | -1, a: f.a, i: f.i }));
    if (frames.length < 2) return;
    const first = frames[0];
    const echo: Echo = {
      id: ++this.echoSeq, frames, t: 0, x: first.x, y: first.y, w: PLAYER_W, h: PLAYER_H, facing: first.f, anim: first.a,
      state: 'playing', linger: this.stats.linger * 60, lingerMax: this.stats.linger * 60, fade: 30, trail: [], age: 0,
      prisms: new Set(src.prisms), reflected: true,
    };
    this.echoes.push(echo);
    prism.charge = 1;
    this.audio.play('prism');
    this.flash = Math.max(this.flash, 5);
    this.particles.burst(axis, prism.y * TILE + 4, { count: 30, color: ['#f4c2ff', '#c15cf5', '#ffffff'], speed: 2.2, life: 45, glow: true, drag: 0.93 });
    this.say('Pryzmat odbił echo!');
  }

  private summonMemory() {
    if (!this.stats.memory) return;
    if (!this.lastRecording) { this.say('Brak zapamiętanego nagrania.'); this.audio.play('denied'); return; }
    if (this.recording) return;
    const cost = (this.lastRecording.frames.length / 60) * 0.5;
    if (this.energy < cost) { this.say('Za mało energii, by odtworzyć pamięć echa.'); this.audio.play('denied'); return; }
    if (this.liveEchoCount() >= this.stats.maxEchoes) {
      this.say('Brak wolnych ech. Naciśnij R, aby je rozproszyć.');
      this.audio.play('denied');
      return;
    }
    this.energy -= cost;
    this.spawnEcho(this.lastRecording);
    this.say('Pamięć echa odtworzona.');
  }

  dismissEchoes() {
    let any = false;
    for (const e of this.echoes) if (e.state !== 'fading') { e.state = 'fading'; e.fade = 25; any = true; }
    if (any) { this.audio.play('echoFade'); this.say('Echa rozproszone.'); }
  }

  private updateEchoes() {
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      e.age++;
      if (e.state === 'playing') {
        const fr = e.frames[e.t];
        e.x = fr.x; e.y = fr.y; e.facing = fr.f; e.anim = fr.a;
        if (fr.i) this.tryInteract(e, true);
        e.t++;
        if (e.t >= e.frames.length) e.state = 'lingering';
        if (e.age % 2 === 0) { e.trail.push({ x: e.x, y: e.y }); if (e.trail.length > 7) e.trail.shift(); }
        // prisms split the echo into a mirrored reflection
        for (const pr of this.level.prisms) {
          if (e.prisms.has(pr.idx)) continue;
          if (overlap(e, { x: pr.x * TILE + 4, y: pr.y * TILE - 8, w: 8, h: 24 })) {
            e.prisms.add(pr.idx);
            this.spawnReflection(e, pr);
          }
        }
      } else if (e.state === 'lingering') {
        e.anim = 'idle';
        e.linger--;
        if (e.trail.length && e.age % 3 === 0) e.trail.shift();
        if (e.linger <= 0) { e.state = 'fading'; e.fade = 30; this.audio.play('echoFade'); }
      } else {
        e.fade--;
        if (e.fade <= 0) this.echoes.splice(i, 1);
      }
      // amber veils dissolve any echo that touches them
      if (e.state !== 'fading') {
        const x1 = Math.floor(e.x / TILE), x2 = Math.floor((e.x + e.w - 0.01) / TILE);
        const y1 = Math.floor(e.y / TILE), y2 = Math.floor((e.y + e.h - 0.01) / TILE);
        let hit = false;
        for (let ty = y1; ty <= y2 && !hit; ty++) for (let tx = x1; tx <= x2; tx++) if (this.tile(tx, ty) === T_VEIL_LIFE) { hit = true; break; }
        if (hit) {
          e.state = 'fading';
          e.fade = 18;
          this.audio.play('veil');
          this.particles.burst(e.x + e.w / 2, e.y + e.h / 2, { count: 16, color: ['#ffd27a', '#ffaa3c', '#ffffff'], speed: 1.6, life: 35, glow: true });
          if (this.frame - this.veilMsgAt > 90) { this.veilMsgAt = this.frame; this.say('Bursztynowa Zasłona rozproszyła echo.'); }
        }
      }
    }
    for (const pr of this.level.prisms) if (pr.charge > 0) pr.charge = Math.max(0, pr.charge - 0.04);
    for (const sp of this.level.springs.values()) if (sp.squash > 0) sp.squash = Math.max(0, sp.squash - 0.08);
    for (const po of this.level.portals) if (po.pulse > 0) po.pulse = Math.max(0, po.pulse - 0.03);
  }

  /* ------------------------------------------------------------------ */
  /*  World objects                                                      */
  /* ------------------------------------------------------------------ */
  private updateMovers() {
    for (const m of this.level.movers) {
      m.prevY = m.y;
      const px = m.x;
      if (m.when !== undefined) {
        const active = this.isActive(m.when);
        if (active && !m.active && m.prog < m.len) this.audio.play('lift');
        m.active = active;
        m.dir = active ? 1 : -1;
        m.prog = Math.max(0, Math.min(m.len, m.prog + m.dir * m.speed));
      } else if (m.pause > 0) {
        m.pause--;
      } else {
        m.prog += m.dir * m.speed;
        if (m.prog >= m.len) { m.prog = m.len; m.dir = -1; m.pause = m.spikes ? 10 : 40; }
        if (m.prog <= 0) { m.prog = 0; m.dir = 1; m.pause = m.spikes ? 10 : 40; }
      }
      const f = m.len > 0 ? m.prog / m.len : 0;
      m.x = m.x0 + (m.x1 - m.x0) * f;
      m.y = m.y0 + (m.y1 - m.y0) * f;
      m.vx = m.x - px;
      m.vy = m.y - m.prevY;
    }
  }

  private updateCrumbles() {
    for (const c of this.level.crumbles.values()) {
      if (c.state === 1) {
        c.timer--;
        if (c.timer <= 0) {
          c.state = 2;
          c.timer = 200;
          this.audio.play('crumble');
          this.particles.burst(c.x * TILE + 8, c.y * TILE + 4, { count: 10, color: ['#4a4f6a', '#6a7092', '#2a2d44'], speed: 1.2, life: 40, g: 0.15 });
        }
      } else if (c.state === 2) {
        c.timer--;
        if (c.timer <= 0) c.state = 0;
      }
    }
  }

  /** Drives the score's heartbeat & trembling strings from nearby threats. */
  private updateMusicTension() {
    const p = this.player;
    let tension = 0;
    for (const en of this.level.enemies) {
      if (en.kind === 'shadow' && (en.state === 'dispersed' || en.state === 'reform')) continue;
      const d = Math.hypot(en.x - p.x, en.y - p.y);
      let w = Math.max(0, 1 - d / 220);
      if (en.kind === 'shadow' && en.state === 'chase') w = Math.max(w, 0.85);
      else if (en.kind === 'guardian' && en.asleep) w *= 0.3;
      else if (en.kind === 'devourer' && en.hunting) w = Math.max(w, 0.6);
      else if (en.kind === 'snapper' && en.state === 'stunned') w = 0;
      tension = Math.max(tension, w);
    }
    if (p.hp <= 1) tension = Math.max(tension, 0.55);
    this.audio.setMusicTension(tension);
  }

  private updateDrips() {
    const L = this.level;
    const left = this.cam.x - 24, right = this.cam.x + this.view.w + 24;
    const top = this.cam.y - 24, bottom = this.cam.y + this.view.h + 24;

    // Only visible ceiling sources produce drops; their initial delays are seeded per level.
    for (const e of L.dripEmitters) {
      if (e.x < left || e.x > right || e.y < top - 64 || e.y > bottom) continue;
      if (--e.timer <= 0) {
        if (L.droplets.length < 70) L.droplets.push({ x: e.x, y: e.y, vy: 0.15 });
        e.timer = e.interval + Math.floor(Math.random() * 32);
      }
    }

    for (let i = L.droplets.length - 1; i >= 0; i--) {
      const drop = L.droplets[i];
      const prevY = drop.y;
      drop.vy = Math.min(4.5, drop.vy + 0.17);
      const nextY = prevY + drop.vy;
      const tx = Math.floor(drop.x / TILE);
      let impactY = -1;
      let water = false;
      for (let ty = Math.floor(prevY / TILE); ty <= Math.floor(nextY / TILE); ty++) {
        if (ty < 0 || ty >= L.h) continue;
        const surface = ty * TILE;
        if (prevY > surface || nextY < surface) continue;
        const idx = ty * L.w + tx;
        const tile = L.tiles[idx];
        if (tile === T_WATER) {
          water = true;
        } else if (tile !== T_ROCK && tile !== T_BRICK && tile !== T_HIDDEN && tile !== T_ONEWAY
          && tile !== T_SPRING && tile !== T_SPIKE
          && !(tile === T_CRUMBLE && L.crumbles.get(idx)?.state !== 2)
          && !(tile === T_DOOR && !L.doorAt.get(idx)?.open)) continue;
        impactY = surface;
        break;
      }

      if (impactY >= 0) {
        L.droplets.splice(i, 1);
        if (L.dripRipples.length < 96) {
          const life = water ? 22 : 14;
          L.dripRipples.push({ x: drop.x, y: impactY, life, max: life, water });
        }
        if (drop.x > left && drop.x < right && impactY > top && impactY < bottom) {
          this.particles.burst(drop.x, impactY - 1, {
            count: water ? 5 : 3, color: ['#b6f2ff', '#75bfda', '#ffffff'],
            speed: water ? 0.8 : 0.5, life: 16, size: 1, up: true, spread: 2.4, g: 0.08,
          });
        }
        if (this.mode === 'playing' && this.frame - this.lastDripSound > 60
          && Math.abs(drop.x - (this.player.x + this.player.w / 2)) < 150
          && Math.abs(impactY - (this.player.y + this.player.h / 2)) < 120) {
          this.audio.play('waterDrip');
          this.lastDripSound = this.frame;
        }
      } else if (nextY > L.h * TILE + 20) {
        L.droplets.splice(i, 1);
      } else {
        drop.y = nextY;
      }
    }
    for (let i = L.dripRipples.length - 1; i >= 0; i--) {
      if (--L.dripRipples[i].life <= 0) L.dripRipples.splice(i, 1);
    }
  }

  isActive(id: string): boolean {
    const e = this.activeMap.get(id);
    return !!e && e.n > 0 && e.a === e.n;
  }

  private updateMechanisms() {
    const L = this.level;
    const p = this.player;
    // plates
    for (const pl of L.plates) {
      const was = pl.pressed;
      pl.pressed = false;
      pl.pressedBy = null;
      if (pl.deniedT > 0) pl.deniedT--;
      const box = { x: pl.x * TILE + 2, y: pl.y * TILE + 10, w: 12, h: 6 };
      // Living-only plates reject echoes, memory plates reject the living.
      if (!p.dead && overlap(p, box)) {
        if (pl.echoOnly) pl.deniedT = 10;
        else { pl.pressed = true; pl.pressedBy = 'player'; }
      }
      if (!pl.pressed) {
        for (const e of this.echoes) {
          if (e.state === 'fading') continue;
          if (overlap(e, box)) {
            if (pl.noEcho) { pl.deniedT = 10; continue; }
            pl.pressed = true; pl.pressedBy = 'echo';
            break;
          }
        }
      }
      if (!pl.pressed) {
        // a Shadow Anchor holds plates just like an echo (but is not "alive" enough for living-only plates)
        for (const a of this.anchors) {
          if (a.state !== 'live' || !overlap(a, box)) continue;
          if (pl.noEcho) { pl.deniedT = 10; continue; }
          pl.pressed = true; pl.pressedBy = 'echo';
          break;
        }
      }
      // Pressure plates hold their charge briefly after being released.
      const holdSeconds = pl.timed ?? 0;
      if (holdSeconds > 0) {
        if (pl.pressed) pl.hold = holdSeconds * 60;
        else if ((pl.hold ?? 0) > 0) {
          pl.hold!--;
          pl.pressed = true;
          pl.pressedBy = 'echo';
        }
      }
      pl.anim += ((pl.pressed ? 1 : 0) - pl.anim) * 0.3;
      if (pl.pressed && !was) { this.audio.play('plateOn'); this.particles.burst(pl.x * TILE + 8, pl.y * TILE + 13, { count: 6, color: '#6ff3ff', speed: 0.8, life: 25, glow: true, up: true }); }
      if (!pl.pressed && was) this.audio.play('plateOff');
    }
    // levers
    for (const lv of L.levers) {
      if (lv.timer > 0) {
        lv.timer--;
        if (lv.timer === 90 || lv.timer === 60 || lv.timer === 30) this.audio.play('tick');
      }
      if (lv.deniedT > 0) lv.deniedT--;
    }
    // active map
    const map = new Map<string, { a: number; n: number }>();
    const inc = (id: string, on: boolean) => {
      const e = map.get(id) ?? { a: 0, n: 0 };
      e.n++;
      if (on) e.a++;
      map.set(id, e);
    };
    for (const pl of L.plates) inc(pl.target, pl.pressed);
    for (const lv of L.levers) inc(lv.target, lv.timed ? lv.timer > 0 : lv.on);
    this.activeMap = map;
    // doors
    for (const d of L.doors) {
      const rect = { x: d.x * TILE, y: d.y * TILE, w: TILE, h: d.tilesHigh * TILE };
      d.blocked = (!p.dead && overlap(p, rect)) || this.anchors.some((a) => overlap(a, rect));
      let open = d.latched || this.isActive(d.id);
      if (d.lockId && !d.latched) {
        const near = { x: rect.x - 10, y: rect.y - 4, w: rect.w + 20, h: rect.h + 8 };
        if (!p.dead && overlap(p, near)) {
          if (this.keys.has(d.lockId)) {
            open = true;
            this.keys.delete(d.lockId);
            this.particles.burst(rect.x + 8, rect.y + rect.h / 2, { count: 24, color: ['#ffd166', '#fff6d0', '#ffffff'], speed: 1.8, life: 40, glow: true });
          } else if (this.frame % 90 === 0) {
            this.say('Zamek Pamięci — potrzebny klucz.');
          }
        }
      }
      if (open && d.latch && !d.latched) {
        d.latched = true;
        const key = `${L.def.id}:door:${d.id}`;
        if (!this.save.solved.includes(key)) this.save.solved.push(key);
        this.say(d.lockId ? 'Klucz Pamięci otworzył zamek.' : 'Zamek otwarty na stałe!');
        this.audio.play('latch');
        this.saveNow();
      }
      if (open !== d.open) {
        d.open = open;
        this.audio.play(open ? 'doorOpen' : 'doorClose');
        if (this.settings.shake) this.shake = Math.max(this.shake, 1.5);
        this.particles.burst(rect.x + 8, rect.y + rect.h, { count: 8, color: ['#6a7092', '#4a4f6a'], speed: 0.8, life: 30, up: true, spread: 1.5 });
      }
      d.anim += ((d.open ? 1 : 0) - d.anim) * 0.12;
      let tl = 0;
      for (const lv of L.levers) if (lv.target === d.id && lv.timed && lv.timer > 0) tl = Math.max(tl, lv.timer / 60);
      d.timedLeft = d.open && !d.latched ? tl : 0;
    }
  }

  private tryInteract(actor: { x: number; y: number; w: number; h: number }, isEcho: boolean): boolean {
    const L = this.level;
    const reach = { x: actor.x - 8, y: actor.y - 6, w: actor.w + 16, h: actor.h + 8 };
    for (const lv of L.levers) {
      const box = { x: lv.x * TILE, y: lv.y * TILE, w: TILE, h: TILE };
      if (!overlap(reach, box)) continue;
      if (isEcho && lv.noEcho) {
        lv.deniedT = 20;
        this.audio.play('denied');
        return false;
      }
      if (lv.timed) {
        lv.timer = Math.round(lv.timed * 60);
        this.say(`Mechanizm aktywny przez ${lv.timed} s!`);
      } else {
        lv.on = !lv.on;
        if (lv.on && !this.save.solved.includes(lv.key)) this.save.solved.push(lv.key);
        if (!lv.on) this.save.solved = this.save.solved.filter((k) => k !== lv.key);
      }
      this.audio.play('lever');
      this.particles.burst(lv.x * TILE + 8, lv.y * TILE + 8, { count: 8, color: lv.timed ? '#ffb347' : '#6ff3ff', speed: 1, life: 25, glow: true });
      return true;
    }
    if (!isEcho) {
      for (const cp of L.captives) {
        if (cp.freed) continue;
        if (overlap(reach, { x: cp.x * TILE - 8, y: (cp.y - 1) * TILE, w: TILE + 16, h: TILE * 2 + 4 })) {
          this.freeCaptive(cp);
          return true;
        }
      }
      for (const sh of L.shrines) {
        const box = { x: sh.x * TILE - 4, y: sh.y * TILE, w: TILE + 8, h: TILE };
        if (overlap(reach, box)) {
          this.openShop();
          return true;
        }
      }
    }
    return false;
  }

  private updateInteractions() {
    const L = this.level;
    const p = this.player;
    if (p.dead) return;
    const input = this.input;
    // prompt & shrine proximity
    this.prompt = null;
    this.nearShrine = false;
    const reach = { x: p.x - 8, y: p.y - 6, w: p.w + 16, h: p.h + 8 };
    for (const lv of L.levers) {
      if (overlap(reach, { x: lv.x * TILE, y: lv.y * TILE, w: TILE, h: TILE })) this.prompt = lv.timed ? 'E — pociągnij dźwignię czasową' : 'E — pociągnij dźwignię';
    }
    for (const sh of L.shrines) {
      if (overlap(reach, { x: sh.x * TILE - 4, y: sh.y * TILE, w: TILE + 8, h: TILE })) { this.prompt = 'E — ołtarz ulepszeń'; this.nearShrine = true; }
    }
    for (const cp of L.captives) {
      if (!cp.freed && overlap(reach, { x: cp.x * TILE - 8, y: (cp.y - 1) * TILE, w: TILE + 16, h: TILE * 2 + 4 })) this.prompt = 'E — uwolnij uwięzioną postać';
    }
    if (input.justPressed('interact')) { p.actT = 14; this.tryInteract(p, false); }
    // signs
    this.sign = null;
    const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
    for (const s of L.signs) {
      if (Math.abs(pcx - (s.x * TILE + 8)) < 26 && Math.abs(pcy - (s.y * TILE + 8)) < 30) { this.sign = s.text; break; }
    }
    // crystals
    for (const c of L.crystals) {
      if (c.taken) { c.takenT++; continue; }
      const box = { x: c.x * TILE + 4, y: c.y * TILE + 3, w: 8, h: 10 };
      if (overlap(p, box)) {
        c.taken = true;
        this.save.crystals += c.value;
        this.save.totalCrystals += c.value;
        this.save.collected.push(c.id);
        this.audio.play(c.value > 1 ? 'bigCrystal' : 'crystal');
        this.particles.burst(c.x * TILE + 8, c.y * TILE + 8, { count: c.value > 1 ? 30 : 12, color: c.value > 1 ? ['#f4c2ff', '#c15cf5', '#ffffff'] : ['#c6fbff', '#4fd8f0', '#ffffff'], speed: 1.6, life: 40, glow: true, drag: 0.95 });
        if (c.value > 1) this.say(`+${c.value} kryształów!`);
        this.saveNow();
      }
    }
    // keys (only living hands can carry them)
    for (const k of L.keys) {
      if (k.taken) continue;
      if (overlap(p, { x: k.x * TILE + 3, y: k.y * TILE + 2, w: 10, h: 12 })) {
        k.taken = true;
        this.keys.add(k.id);
        const sk = `${L.def.id}:key:${k.id}`;
        if (!this.save.solved.includes(sk)) this.save.solved.push(sk);
        this.audio.play('key');
        this.say('Zdobyto Klucz Pamięci!');
        this.flash = Math.max(this.flash, 6);
        this.particles.burst(k.x * TILE + 8, k.y * TILE + 8, { count: 26, color: ['#ffd166', '#fff6d0', '#ffffff'], speed: 1.8, life: 45, glow: true, drag: 0.94 });
        this.saveNow();
      }
    }
    // checkpoints
    for (const cp of L.checkpoints) {
      if (cp.active) continue;
      if (overlap(p, { x: cp.x * TILE + 2, y: cp.y * TILE - 8, w: 12, h: 24 })) {
        for (const o of L.checkpoints) o.active = false;
        cp.active = true;
        this.save.checkpoint = { level: L.def.id, x: cp.x, y: cp.y };
        this.audio.play('checkpoint');
        this.say('Punkt kontrolny aktywowany.');
        this.particles.burst(cp.x * TILE + 8, cp.y * TILE + 4, { count: 20, color: ['#6ff3ff', '#ffffff'], speed: 1.4, life: 50, glow: true, g: -0.03 });
        this.saveNow();
      }
    }
    // hidden regions
    const x1 = Math.floor(p.x / TILE), x2 = Math.floor((p.x + p.w - 0.01) / TILE);
    const y1 = Math.floor(p.y / TILE), y2 = Math.floor((p.y + p.h - 0.01) / TILE);
    for (let ty = y1; ty <= y2; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const r = L.hiddenAt.get(ty * L.w + tx);
        if (r && !r.revealed) {
          r.revealed = true;
          r.revealT = 0;
          this.save.secrets.push(r.id);
          this.audio.play('secret');
          this.say('Odkryto sekretne przejście!');
          for (const k of r.tiles) this.particles.burst((k % L.w) * TILE + 8, Math.floor(k / L.w) * TILE + 8, { count: 4, color: ['#ffd166', '#ffffff'], speed: 0.8, life: 40, glow: true });
          this.saveNow();
        }
      }
    }
    for (const r of L.hidden) if (r.revealed && r.revealT < 999) r.revealT++;
    // exits
    for (const ex of L.exits) {
      const final = L.def.next === null;
      const box = final ? { x: ex.x * TILE - 2, y: ex.y * TILE - 28, w: 20, h: 44 } : { x: ex.x * TILE + 2, y: ex.y * TILE - 16, w: 12, h: 32 };
      if (overlap(p, box)) {
        if (L.boss && !L.boss.defeated) {
          this.say(`${L.boss.name} wciąż blokuje przejście!`, 2.2);
          continue;
        }
        this.mode = 'transition';
        this.transition = { t: 0, next: L.def.next };
        this.recording = null;
        this.audio.play('levelDone');
        this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, { count: 40, color: ['#6ff3ff', '#ffffff', '#c15cf5'], speed: 2.5, life: 70, glow: true, drag: 0.95 });
        if (L.def.next) {
          if (!this.save.unlocked.includes(L.def.next)) this.save.unlocked.push(L.def.next);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Boss encounters                                                    */
  /* ------------------------------------------------------------------ */
  private bossTarget(b: BossState): { x: number; y: number } {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let bestD = Infinity;
    let target = { x: this.player.x + this.player.w / 2, y: this.player.y + this.player.h / 2 };
    // Bosses can be tricked by both kinds of decoy.
    for (const e of this.echoes) {
      if (e.state === 'fading') continue;
      const d = Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy);
      if (d < bestD) { bestD = d; target = { x: e.x + e.w / 2, y: e.y + e.h / 2 }; }
    }
    for (const a of this.anchors) {
      if (a.state !== 'live') continue;
      const d = Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy);
      if (d < bestD) { bestD = d; target = { x: a.x + a.w / 2, y: a.y + a.h / 2 }; }
    }
    return target;
  }

  private fireBossShot(b: BossState, x: number, y: number, targetX: number, targetY: number, action: BossProjectile['action'], speed: number, angleOffset = 0) {
    const dx = targetX - x, dy = targetY - y;
    const a = Math.atan2(dy, dx) + angleOffset;
    const radius = action === 'wave' ? 7 : action === 'ember' ? 4 : 3;
    b.projectiles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 180, radius, action, wobble: Math.random() * Math.PI * 2 });
  }

  private bossVolley(b: BossState, target: { x: number; y: number }) {
    const sx = b.x + b.w / 2, sy = b.y + b.h * 0.45;
    const phase2 = b.phase > 1;
    if (b.kind === 'rootMatriarch') {
      const n = phase2 ? 5 : 3;
      for (let i = 0; i < n; i++) this.fireBossShot(b, sx, sy, target.x, target.y + 10, 'seed', 1.65 + (phase2 ? 0.25 : 0), (i - (n - 1) / 2) * 0.19);
    } else if (b.kind === 'forgeBehemoth') {
      const direction = Math.sign(target.x - sx) || b.facing;
      for (const spread of [-0.16, 0, 0.16]) this.fireBossShot(b, sx, b.y + b.h - 8, sx + direction * 240, b.y + b.h, 'ember', 2.3, spread);
    } else if (b.kind === 'glassWarden') {
      const n = phase2 ? 7 : 5;
      for (let i = 0; i < n; i++) this.fireBossShot(b, sx, sy, target.x, target.y, 'orb', 1.8, (i - (n - 1) / 2) * (phase2 ? 0.18 : 0.22));
    } else {
      // The Core alternates a tracking shard fan with a low sweeping pulse.
      if (b.attacks % 2 === 0) {
        const n = phase2 ? 7 : 5;
        for (let i = 0; i < n; i++) this.fireBossShot(b, sx, sy, target.x, target.y, 'orb', 1.7, (i - (n - 1) / 2) * 0.2);
      } else {
        const dir = Math.sign(target.x - sx) || b.facing;
        this.fireBossShot(b, sx, b.y + b.h - 5, sx + dir * 260, b.y + b.h - 5, 'wave', phase2 ? 2.9 : 2.3);
        if (phase2) this.fireBossShot(b, sx, b.y + b.h - 5, sx - dir * 260, b.y + b.h - 5, 'wave', 2.1);
      }
    }
    this.audio.play(b.kind === 'forgeBehemoth' ? 'guardianStep' : 'devourer');
  }

  private damageBoss(b: BossState, amount: number, hitX: number) {
    if (!b.active || b.defeated || !b.vulnerable || b.hitLock > 0) return false;
    b.hp = Math.max(0, b.hp - amount);
    b.hitLock = 26;
    b.state = 'recovery';
    b.timer = Math.max(b.timer, 26);
    this.flash = Math.max(this.flash, 3);
    this.shake = Math.max(this.shake, this.settings.shake ? 3 : 0);
    this.particles.burst(hitX, b.y + b.h * 0.55, {
      count: 18, color: b.kind === 'rootMatriarch' ? ['#5cff9f', '#d8ffe8', '#ffffff']
        : b.kind === 'forgeBehemoth' ? ['#ff8a3d', '#ffd08a', '#ffffff']
          : ['#c9a6ff', '#ffffff', '#6ff3ff'],
      speed: 2, life: 35, glow: true,
    });
    this.audio.play('bossHit');
    if (b.kind === 'heartCore' && b.phase === 1 && b.hp <= Math.ceil(b.maxHp / 2)) {
      b.phase = 2;
      b.state = 'intro';
      b.timer = 92;
      b.vulnerable = false;
      b.projectiles.length = 0;
      this.say('Rdzeń się rozszczepia. Nadchodzi drugie uderzenie.', 4.5);
      this.audio.play('bossRoar');
      this.shake = Math.max(this.shake, this.settings.shake ? 8 : 0);
    }
    if (b.hp <= 0) this.defeatBoss(b);
    else this.say(b.kind === 'glassWarden' ? 'Szklana osłona pęka!' : 'Cios dosięga Strażnika!');
    return true;
  }

  private defeatBoss(b: BossState) {
    if (b.defeated) return;
    b.hp = 0;
    b.defeated = true;
    b.active = true;
    b.vulnerable = false;
    b.state = 'defeated';
    b.timer = 120;
    b.projectiles.length = 0;
    const key = `${this.level.def.id}:boss`;
    if (!this.save.solved.includes(key)) this.save.solved.push(key);
    this.save.crystals += 12;
    this.save.totalCrystals += 12;
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 1);
    this.audio.play('bossBreak');
    this.flash = 18;
    this.shake = Math.max(this.shake, this.settings.shake ? 10 : 0);
    this.particles.burst(b.x + b.w / 2, b.y + b.h / 2, {
      count: 72, color: b.kind === 'rootMatriarch' ? ['#5cff9f', '#ffd36a', '#ffffff']
        : b.kind === 'forgeBehemoth' ? ['#ff6a3a', '#ffd08a', '#ffffff']
          : ['#c15cf5', '#c9a6ff', '#ffffff'],
      speed: 3.4, life: 65, glow: true, drag: 0.95,
    });
    this.say(`${b.name} pokonany. +12 kryształów i jedno serce.`, 5);
    this.saveNow();
  }

  private updateBoss() {
    const b = this.level.boss;
    if (!b) return;
    b.animT++;
    if (b.hitLock > 0) b.hitLock--;
    if (b.defeated) {
      if (b.timer > 0) b.timer--;
      return;
    }

    const p = this.player;
    const cx = b.x + b.w / 2;
    const [left, right, top, bottom] = b.arena;
    const pcx = p.x + p.w / 2;
    // The left arena seal occupies the boundary tile. Activate only after the
    // player's full hitbox clears that tile, or the new wall pushes them back
    // out on the same frame the encounter begins.
    const enteredArena = pcx >= left + TILE + p.w / 2;
    if (b.state === 'sleep' && !p.dead && enteredArena && pcx <= right - 6
      && p.y + p.h > top && p.y < bottom) {
      b.active = true;
      b.state = 'intro';
      b.timer = 88;
      b.targetX = pcx;
      this.camFast = 65;
      this.shake = Math.max(this.shake, this.settings.shake ? 5 : 0);
      this.audio.play('bossRoar');
      this.say(`${b.name} — ${b.title}.`, 4.5);
    }
    if (!b.active) return;
    if (b.state === 'intro') {
      b.timer--;
      b.x += Math.sin(b.animT * 0.09) * 0.12;
      if (b.timer <= 0) {
        b.state = 'idle';
        b.cooldown = b.kind === 'heartCore' ? 75 : 90;
      }
    } else if (b.state === 'idle') {
      b.vulnerable = false;
      b.cooldown--;
      const target = this.bossTarget(b);
      b.facing = target.x >= cx ? 1 : -1;
      if (b.kind === 'rootMatriarch' || b.kind === 'glassWarden' || b.kind === 'heartCore') {
        const drift = Math.sin(b.animT * (b.kind === 'heartCore' ? 0.11 : 0.035));
        const home = b.kind === 'rootMatriarch' ? b.y : b.y + Math.sin(drift) * 5;
        b.y += (home - b.y) * 0.04;
        if (b.kind !== 'heartCore') {
          const targetX = Math.max(left + 38, Math.min(right - b.w - 20, target.x - b.w / 2));
          b.x += Math.max(-0.75, Math.min(0.75, (targetX - b.x) * 0.012));
        }
      }
      if (b.cooldown <= 0) {
        b.state = 'windup';
        b.timer = b.kind === 'rootMatriarch' ? (b.phase > 1 ? 32 : 44)
          : b.kind === 'forgeBehemoth' ? (b.phase > 1 ? 28 : 38)
            : b.kind === 'glassWarden' ? (b.phase > 1 ? 28 : 36)
              : (b.phase > 1 ? 25 : 40);
        b.targetX = target.x;
        this.audio.play('bossTelegraph');
      }
    } else if (b.state === 'windup') {
      b.vulnerable = false;
      b.timer--;
      const target = this.bossTarget(b);
      b.targetX = target.x;
      b.facing = target.x >= cx ? 1 : -1;
      if (b.timer <= 0) {
        b.attacks++;
        if (b.kind === 'forgeBehemoth') {
          b.state = 'charge';
          b.timer = 108;
          b.vx = b.facing * (b.phase > 1 ? 3.6 : 3.0);
        } else {
          this.bossVolley(b, target);
          b.state = 'recovery';
          b.vulnerable = true;
          b.timer = b.kind === 'rootMatriarch' ? (b.phase > 1 ? 62 : 78)
            : b.kind === 'heartCore' && b.phase > 1 ? 52 : 70;
        }
      }
    } else if (b.state === 'charge') {
      b.vulnerable = false;
      const nextX = b.x + b.vx;
      const minX = left + 3, maxX = right - b.w - 3;
      if (nextX <= minX || nextX >= maxX || b.timer <= 0) {
        b.x = Math.max(minX, Math.min(maxX, nextX));
        b.vx = 0;
        b.state = 'stunned';
        b.vulnerable = true;
        b.timer = 92;
        const floorY = b.arena[3] - 4;
        this.fireBossShot(b, b.x + b.w / 2, floorY, left - 50, floorY, 'wave', 2.25, 0);
        this.fireBossShot(b, b.x + b.w / 2, floorY, right + 50, floorY, 'wave', 2.25, 0);
        this.audio.play('guardianStep');
        this.shake = Math.max(this.shake, this.settings.shake ? 5 : 0);
        this.particles.burst(b.x + b.w / 2, floorY, { count: 15, color: ['#ff9a3a', '#ffd08a', '#ffffff'], speed: 1.8, life: 35, glow: true, up: true, spread: 2.4 });
      } else {
        b.x = nextX;
        b.timer--;
        b.facing = b.vx >= 0 ? 1 : -1;
        if (this.frame % 5 === 0) this.particles.burst(b.x + (b.facing > 0 ? 0 : b.w), b.y + b.h - 2, { count: 2, color: ['#ff6a3a', '#ffd08a'], speed: 0.8, life: 22, glow: true, up: true });
      }
    } else if (b.state === 'stunned' || b.state === 'recovery') {
      b.vulnerable = true;
      b.timer--;
      if (b.timer <= 0) {
        b.vulnerable = false;
        b.state = 'idle';
        b.cooldown = b.kind === 'heartCore' && b.phase > 1 ? 34 : b.kind === 'glassWarden' ? 52 : 70;
      }
    }

    this.updateBossProjectiles(b);
  }

  private updateBossProjectiles(b: BossState) {
    const p = this.player;
    for (let i = b.projectiles.length - 1; i >= 0; i--) {
      const shot = b.projectiles[i];
      shot.life--;
      shot.wobble += 0.17;
      if (shot.action === 'seed' || shot.action === 'ember' || shot.action === 'wave') shot.vy += shot.action === 'wave' ? 0 : 0.105;
      else {
        // Glass and Core shards gently home toward the living target.
        const target = this.bossTarget(b);
        const dx = target.x - shot.x, dy = target.y - shot.y;
        const d = Math.hypot(dx, dy) || 1;
        shot.vx += (dx / d) * 0.018;
        shot.vy += (dy / d) * 0.018;
        const s = Math.hypot(shot.vx, shot.vy);
        const cap = b.phase > 1 ? 2.45 : 1.9;
        if (s > cap) { shot.vx *= cap / s; shot.vy *= cap / s; }
        shot.x += Math.sin(shot.wobble) * 0.22;
      }
      shot.x += shot.vx;
      shot.y += shot.vy;
      const r = { x: shot.x - shot.radius, y: shot.y - shot.radius, w: shot.radius * 2, h: shot.radius * 2 };
      if (shot.life <= 0 || shot.x < b.arena[0] - 30 || shot.x > b.arena[1] + 30 || shot.y > b.arena[3] + 20 || this.rectSolid(r.x, r.y, r.w, r.h)) {
        b.projectiles.splice(i, 1);
        if (shot.action !== 'wave' && shot.y < b.arena[3] + 12 && shot.life > 0) {
          this.particles.burst(shot.x, shot.y, { count: 5, color: ['#ffb347', '#c9a6ff', '#ffffff'], speed: 0.75, life: 19, glow: true });
        }
        continue;
      }
      // Lures can intercept projectiles; the boss's opening still lets the player attack it.
      let intercepted = false;
      for (const e of this.echoes) {
        if (e.state === 'fading' || !overlap(r, e)) continue;
        e.state = 'fading'; e.fade = 18; intercepted = true; break;
      }
      if (!intercepted) {
        const ai = this.anchors.findIndex((a) => a.state === 'live' && overlap(r, a));
        if (ai >= 0) { this.anchors.splice(ai, 1); intercepted = true; }
      }
      if (intercepted) {
        b.projectiles.splice(i, 1);
        this.particles.burst(shot.x, shot.y, { count: 7, color: ['#c9a6ff', '#ffd08a', '#ffffff'], speed: 0.9, life: 20, glow: true });
        continue;
      }
      if (p.dashT === 0 && p.invuln === 0 && overlap(r, p)) {
        this.hurt(1, shot.x);
        this.energy = Math.max(0, this.energy - 0.65);
        b.projectiles.splice(i, 1);
      }
    }
  }

  private updateBossContacts() {
    const b = this.level.boss;
    if (!b || !b.active || b.defeated || b.state === 'intro') return;
    const p = this.player;
    const br = { x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 3 };
    if (!p.dead && overlap(p, br)) {
      const dash = p.dashT > 0;
      const stomp = !dash && p.vy > 0 && p.prevBottom <= b.y + Math.min(13, b.h * 0.3);
      if (b.vulnerable && (dash || stomp)) {
        const damage = dash ? 2 : 1;
        this.damageBoss(b, damage, p.x + p.w / 2);
        if (dash) { p.dashT = 0; p.dashCd = 12; p.vx *= 0.55; }
        else { p.vy = -5.25; p.onGround = false; }
      } else if (!dash && p.invuln === 0) {
        this.hurt(b.kind === 'forgeBehemoth' || b.kind === 'heartCore' ? 2 : 1, b.x + b.w / 2);
      }
    }
    // Echoes can land an attack during the exposed window, but anchors only distract.
    if (b.vulnerable && b.hitLock === 0) {
      for (const e of this.echoes) {
        if (e.reflected || e.state !== 'playing' || e.t < 2) continue;
        const prev = e.frames[e.t - 2];
        const descending = e.y > prev.y && prev.y + e.h <= b.y + 13;
        if (descending && overlap(e, br)) {
          this.damageBoss(b, 1, e.x + e.w / 2);
          e.state = 'fading'; e.fade = 18;
          break;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Enemies                                                            */
  /* ------------------------------------------------------------------ */
  private updateEnemies() {
    for (const en of this.level.enemies) {
      en.animT++;
      if (en.kind === 'shadow') this.updateShadow(en);
      else if (en.kind === 'guardian') this.updateGuardian(en);
      else if (en.kind === 'wraith') this.updateWraith(en);
      else if (en.kind === 'snapper') this.updateSnapper(en);
      else if (en.kind === 'crawler') this.updateCrawler(en);
      else if (en.kind === 'floater') this.updateFloater(en);
      else if (en.kind === 'sentinel') this.updateSentinel(en);
      else this.updateDevourer(en);
    }
  }

  /** Wraith: a "watcher" ghost — moves only while the player looks away; echo light also freezes it. */
  private updateWraith(en: Enemy) {
    const p = this.player;
    const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
    const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
    const dx = pcx - cx, dy = pcy - cy;
    const facingIt = !p.dead && Math.sign(cx - pcx) === p.facing && Math.abs(dx) < 260 && Math.abs(dy) < 110;
    let echoNear = false;
    for (const e of this.echoes) {
      if (e.state === 'fading') continue;
      if (Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < 60) { echoNear = true; break; }
    }
    if (!echoNear) {
      for (const a of this.anchors) {
        if (a.state === 'live' && Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) < 60) { echoNear = true; break; }
      }
    }
    const wasFrozen = en.asleep;
    en.asleep = facingIt || echoNear;
    if (en.asleep && !wasFrozen && Math.abs(dx) < 240) this.audio.play('wraith');
    if (en.timer > 0) en.timer--;
    if (!en.asleep) {
      let tx: number, ty: number;
      const far = Math.abs(dx) > 300 || Math.abs(dy) > 140 || p.dead;
      if (en.timer > 0 || far) { tx = en.spawnX + en.w / 2; ty = en.spawnY + en.h / 2; }
      else { tx = pcx; ty = pcy - 4; }
      const ddx = tx - cx, ddy = ty - cy;
      const dist = Math.hypot(ddx, ddy) || 1;
      const sp = en.timer > 0 ? 0.9 : 0.58;
      en.vx += ((ddx / dist) * sp - en.vx) * 0.08;
      en.vy += ((ddy / dist) * sp - en.vy) * 0.08;
      en.x += en.vx;
      en.y += en.vy;
      // stay within its haunt
      const limX = en.range * TILE, limY = 3.5 * TILE;
      en.x = Math.max(en.spawnX - limX, Math.min(en.spawnX + limX, en.x));
      en.y = Math.max(en.spawnY - limY, Math.min(en.spawnY + limY, en.y));
      en.facing = en.vx >= 0 ? 1 : -1;
      if (en.animT % 5 === 0) this.particles.add({ x: cx + (Math.random() - 0.5) * 8, y: en.y + en.h, vx: 0, vy: 0.2, life: 20, max: 20, color: '#352c66', size: 1, g: 0, drag: 1, glow: false, shrink: false });
    } else {
      en.vx = 0; en.vy = 0;
      en.facing = pcx > cx ? 1 : -1;
    }
    if (!p.dead && p.invuln === 0 && en.timer === 0 && overlap(en, p)) {
      this.hurt(1, cx);
      en.timer = 110;
      en.asleep = false;
    }
  }

  /** Snapper: a carnivorous plant rooted in the floor. Telegraphs, bites, cools down; stompable while calm. */
  private updateSnapper(en: Enemy) {
    const p = this.player;
    const cx = en.x + en.w / 2;
    const bottom = en.y + en.h;
    if (en.state === 'stunned') {
      if (--en.timer <= 0) en.state = 'patrol';
      return;
    }
    const near = !p.dead && Math.abs(p.x + p.w / 2 - cx) < 30 && p.y + p.h > bottom - 34 && p.y < bottom + 6;
    if (en.state === 'patrol') {
      if (near) { en.state = 'windup'; en.timer = 16; }
    } else if (en.state === 'windup') {
      if (--en.timer <= 0) { en.state = 'snap'; en.timer = 12; this.audio.play('snap'); this.particles.burst(cx, bottom - 16, { count: 6, color: ['#5cff9f', '#1f9a5a'], speed: 1, life: 20, glow: true }); }
    } else if (en.state === 'snap') {
      const bite = { x: cx - 9, y: bottom - 30, w: 18, h: 30 };
      if (!p.dead && overlap(p, bite)) this.hurt(1, cx);
      if (--en.timer <= 0) { en.state = 'cool'; en.timer = 75; }
    } else if (en.state === 'cool') {
      if (--en.timer <= 0) en.state = 'patrol';
    }
    if (!p.dead && (en.state === 'patrol' || en.state === 'cool') && overlap(p, en)) {
      if (p.vy > 0 && p.prevBottom <= en.y + 6) {
        en.state = 'stunned';
        en.timer = 540;
        p.vy = -4.4;
        p.onGround = false;
        this.audio.play('stomp');
        this.say('Żarłacz ogłuszony!');
        this.particles.burst(cx, en.y, { count: 14, color: ['#5cff9f', '#d8ffe8', '#1f9a5a'], speed: 1.6, life: 35, glow: true });
      } else {
        this.hurt(1, cx);
      }
    }
  }

  /** Pełzacz: szybki, niski drapieżnik, który ślizga się po podłodze i skacze na ofiarę. */
  private updateCrawler(en: Enemy) {
    const p = this.player;
    const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
    const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2) - cy;
    const canSee = !p.dead && Math.abs(dx) < 150 && Math.abs(dy) < 46;
    if (en.state === 'patrol' && canSee) {
      en.state = 'chase';
      en.alert = 50;
      this.audio.play('shadowAlert');
    } else if (en.state === 'chase' && (p.dead || Math.abs(dx) > 230)) {
      en.state = 'patrol';
    }
    if (en.alert > 0) en.alert--;

    let dir: 1 | -1 = en.state === 'chase' ? (dx > 0 ? 1 : -1) : en.facing;
    if (Math.abs(en.x - en.spawnX) > en.range * TILE) dir = en.spawnX > en.x ? 1 : -1;
    const aheadX = dir > 0 ? en.x + en.w + 1 : en.x - 1;
    const wall = this.solid(Math.floor(aheadX / TILE), Math.floor((en.y + en.h / 2) / TILE));
    const ground = this.groundAt(Math.floor(aheadX / TILE), Math.floor((en.y + en.h + 1) / TILE));
    if (en.onGround && (wall || !ground)) {
      if (en.state === 'chase' && ground) en.vy = -4.2; // skok za ofiarą
      else dir = -dir as 1 | -1;
    }
    en.facing = dir;
    en.vx = dir * (en.state === 'chase' ? 1.45 : 0.8);
    this.groundPhysics(en);

    if (!p.dead && overlap(p, en)) {
      const stomp = p.vy > 0 && p.prevBottom <= en.y + 5;
      if (stomp) {
        en.state = 'patrol';
        en.timer = 260;
        p.vy = -4.2;
        p.onGround = false;
        this.audio.play('stomp');
        this.particles.burst(cx, cy, { count: 16, color: ['#4fd8f0', '#c8fbff', '#ffffff'], speed: 1.6, life: 32, glow: true });
        this.say('Pełzacz zdeptany!');
      } else if (p.dashT === 0) {
        this.hurt(1, cx);
      }
    }
    if (en.timer > 0) en.timer--;
    if (en.animT % 7 === 0) {
      this.particles.add({ x: cx - dir * 5, y: en.y + en.h - 1, vx: -dir * 0.2, vy: -0.05, life: 18, max: 18, color: '#2a6b86', size: 1, g: 0, drag: 0.98, glow: true, shrink: true });
    }
  }

  /** Duszek: bezwolna, unosząca się zjawa, która powoli sunie w stronę intruza. */
  private updateFloater(en: Enemy) {
    const p = this.player;
    const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
    const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2 - 4) - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const hunting = !p.dead && dist < 260;
    if (hunting && en.state !== 'chase') {
      en.state = 'chase';
      this.audio.play('wraith');
    } else if (!hunting && en.state === 'chase') en.state = 'patrol';
    const speed = en.state === 'chase' ? 0.72 : 0.28;
    en.vx += (dx / dist) * speed * 0.08;
    en.vy += (dy / dist) * speed * 0.08;
    en.vx += Math.sin(en.animT * 0.012) * 0.012;
    en.vy += Math.cos(en.animT * 0.017) * 0.014;
    const sp = Math.hypot(en.vx, en.vy);
    const cap = en.state === 'chase' ? 1.05 : 0.55;
    if (sp > cap) { en.vx *= cap / sp; en.vy *= cap / sp; }
    en.x += en.vx;
    en.y += en.vy;
    en.facing = en.vx >= 0 ? 1 : -1;
    en.y += Math.sin(en.animT * 0.06) * 0.16;

    if (en.animT % 4 === 0) {
      this.particles.add({
        x: cx + (Math.random() - 0.5) * 12, y: cy + (Math.random() - 0.5) * 12,
        vx: -en.vx * 0.2, vy: -0.06, life: 34, max: 34, color: '#6fa8d8', size: 1, g: 0, drag: 0.99, glow: true, shrink: true,
      });
    }
    if (!p.dead && p.invuln === 0 && overlap(p, en)) this.hurt(1, cx);
  }

  /** Strażnik Otchłani: ciężki stwór, który zatrzymuje się, sygnalizuje atak i miażdży podłoże. */
  private updateSentinel(en: Enemy) {
    const p = this.player;
    const cx = en.x + en.w / 2;
    const dx = (p.x + p.w / 2) - cx;
    const dy = (p.y + p.h / 2) - (en.y + en.h / 2);
    const canSee = !p.dead && Math.abs(dx) < 175 && Math.abs(dy) < 70;

    if (en.state === 'windup') {
      en.vx *= 0.82;
      if (--en.timer <= 0) {
        en.state = 'strike';
        en.timer = 46;
        en.vx = en.facing * 2.45;
        this.audio.play('guardianStep');
        if (this.settings.shake) this.shake = Math.max(this.shake, 2.6);
        this.particles.burst(cx, en.y + en.h, { count: 18, color: ['#6a7092', '#9aa0bd', '#ffffff'], speed: 1.4, life: 30, up: true, spread: 2.6 });
      }
    } else if (en.state === 'strike') {
      en.timer--;
      const wallX = this.solid(Math.floor((en.x + (en.vx > 0 ? en.w + 1 : -1)) / TILE), Math.floor((en.y + en.h / 2) / TILE));
      if (en.timer <= 0 || wallX) {
        en.state = 'recover';
        en.timer = 82;
        en.vx = 0;
        this.audio.play('bossImpact');
        if (this.settings.shake) this.shake = Math.max(this.shake, 3);
        this.particles.burst(cx, en.y + en.h, { count: 18, color: ['#ffb347', '#ffffff', '#6a7092'], speed: 1.8, life: 34, up: true, spread: 2.4 });
      }
    } else if (en.state === 'recover') {
      en.vx *= 0.88;
      if (--en.timer <= 0) en.state = 'patrol';
    } else {
      const dir: 1 | -1 = Math.abs(en.x - en.spawnX) > en.range * TILE
        ? (en.spawnX > en.x ? 1 : -1)
        : canSee ? (dx > 0 ? 1 : -1) : en.facing;
      const aheadX = dir > 0 ? en.x + en.w + 1 : en.x - 1;
      const wall = this.solid(Math.floor(aheadX / TILE), Math.floor((en.y + en.h / 2) / TILE));
      const ground = this.groundAt(Math.floor(aheadX / TILE), Math.floor((en.y + en.h + 1) / TILE));
      if (en.onGround && (wall || !ground)) en.facing = -dir as 1 | -1;
      else en.facing = dir;
      en.vx = en.facing * 0.58;
      if (canSee && en.onGround) {
        en.state = 'windup';
        en.timer = 32;
        en.vx = 0;
        this.audio.play('bossTelegraph');
      }
    }
    this.groundPhysics(en);

    if (!p.dead && overlap(p, en)) {
      const stomp = p.vy > 0 && p.prevBottom <= en.y + 8 && en.state === 'recover';
      if (stomp) {
        p.vy = -5.2;
        p.onGround = false;
        en.timer = 120;
        this.audio.play('stomp');
        this.particles.burst(cx, en.y + 4, { count: 20, color: ['#ffb347', '#ffffff', '#6a7092'], speed: 2, life: 36, glow: true });
        this.say('Strażnik oszołomiony!');
      } else if (p.dashT === 0) {
        this.hurt(en.state === 'strike' ? 2 : 1, cx);
      }
    }
  }

  private groundPhysics(en: Enemy) {
    en.vy = Math.min(en.vy + GRAVITY, MAX_FALL);
    const prevBottom = en.y + en.h;
    this.moveX(en, en.vx);
    const { landedTile } = this.moveY(en, en.vy, prevBottom, false);
    if (landedTile !== null) {
      const c = this.level.crumbles.get(landedTile);
      if (c && c.state === 0 && en.kind === 'guardian') { c.state = 1; c.timer = 28; }
    }
    if (en.y > this.level.h * TILE + 40) { en.x = en.spawnX; en.y = en.spawnY; en.vy = 0; }
  }

  private updateShadow(en: Enemy) {
    const p = this.player;
    if (en.state === 'dispersed') {
      if (--en.timer <= 0) { en.state = 'reform'; en.timer = 50; en.x = en.spawnX; en.y = en.spawnY; en.vx = 0; en.vy = 0; }
      return;
    }
    if (en.state === 'reform') {
      if (en.timer % 4 === 0) {
        const a = Math.random() * Math.PI * 2;
        this.particles.add({ x: en.x + en.w / 2 + Math.cos(a) * 18, y: en.y + en.h / 2 + Math.sin(a) * 18, vx: -Math.cos(a) * 1.2, vy: -Math.sin(a) * 1.2, life: 15, max: 15, color: '#2b1f4d', size: 1, g: 0, drag: 1, glow: false, shrink: false });
      }
      if (--en.timer <= 0) en.state = 'patrol';
      return;
    }
    if (en.alert > 0) en.alert--;
    const dx = (p.x + p.w / 2) - (en.x + en.w / 2);
    const dy = (p.y + p.h / 2) - (en.y + en.h / 2);
    const canSee = !p.dead && Math.abs(dx) < 120 && Math.abs(dy) < 40;
    if (en.state === 'patrol' && canSee) {
      en.state = 'chase';
      en.alert = 45;
      if (Math.abs(dx) < 320) this.audio.play('shadowAlert');
    } else if (en.state === 'chase' && (p.dead || Math.abs(dx) > 190 || Math.abs(dy) > 72)) {
      en.state = 'return';
    } else if (en.state === 'return') {
      if (Math.abs(en.x - en.spawnX) < 4) en.state = 'patrol';
      else if (canSee) en.state = 'chase';
    }
    let dir: 1 | -1 = en.facing;
    let speed = 0.55;
    if (en.state === 'chase') { speed = 1.15; dir = dx > 0 ? 1 : -1; }
    else if (en.state === 'return') { speed = 0.8; dir = en.spawnX > en.x ? 1 : -1; }
    else if (Math.abs(en.x - en.spawnX) > en.range * TILE) dir = en.spawnX > en.x ? 1 : -1;
    const aheadX = dir > 0 ? en.x + en.w + 1 : en.x - 1;
    const tx = Math.floor(aheadX / TILE);
    const wall = this.solid(tx, Math.floor((en.y + en.h / 2) / TILE));
    const ground = this.groundAt(tx, Math.floor((en.y + en.h + 1) / TILE));
    if (en.onGround && (wall || !ground)) {
      if (en.state === 'patrol') dir = -dir as 1 | -1; else speed = 0;
    }
    en.facing = dir;
    en.vx = dir * speed;
    this.groundPhysics(en);
    // contact
    if (!p.dead && overlap(p, en)) {
      const dashHit = p.dashT > 0;
      const stomp = !dashHit && p.vy > 0 && p.prevBottom <= en.y + 5;
      if (stomp || dashHit) {
        en.state = 'dispersed';
        en.timer = 480;
        if (stomp) {
          p.vy = -4.2;
          p.onGround = false;
        }
        this.audio.play('stomp');
        this.particles.burst(en.x + en.w / 2, en.y + en.h / 2, { count: 22, color: ['#0b0817', '#2b1f4d', '#c35bff'], speed: 2, life: 40, drag: 0.94 });
        this.say(dashHit ? 'Dash rozproszył Cienia!' : 'Cień rozproszony!');
      } else {
        this.hurt(1, en.x + en.w / 2);
      }
    }
  }

  private updateGuardian(en: Enemy) {
    const p = this.player;
    en.asleep = en.sleepWhen ? this.isActive(en.sleepWhen) : false;
    if (en.asleep) {
      en.vx = 0;
      this.groundPhysics(en);
      return;
    }
    let dir: 1 | -1 = en.facing;
    const speed = 0.45;
    if (Math.abs(en.x - en.spawnX) > en.range * TILE) dir = en.spawnX > en.x ? 1 : -1;
    const aheadX = dir > 0 ? en.x + en.w + 1 : en.x - 1;
    const tx = Math.floor(aheadX / TILE);
    const wall = this.solid(tx, Math.floor((en.y + en.h / 2) / TILE)) || this.solid(tx, Math.floor((en.y + 4) / TILE));
    const ground = this.groundAt(tx, Math.floor((en.y + en.h + 1) / TILE));
    if (en.onGround && (wall || !ground)) dir = -dir as 1 | -1;
    en.facing = dir;
    en.vx = dir * speed;
    this.groundPhysics(en);
    if (++en.stepT >= 40) {
      en.stepT = 0;
      const dist = Math.abs(p.x - en.x);
      if (dist < 280) {
        this.audio.play('guardianStep');
        if (dist < 140 && this.settings.shake) this.shake = Math.max(this.shake, 1.2);
        this.particles.burst(en.x + en.w / 2, en.y + en.h, { count: 3, color: ['#6a7092', '#4a4f6a'], speed: 0.6, life: 20, up: true, spread: 2 });
      }
    }
    if (!p.dead && overlap(p, en)) this.hurt(2, en.x + en.w / 2);
  }

  private updateDevourer(en: Enemy) {
    const p = this.player;
    en.hunting = false;
    if (en.satiated > 0) en.satiated--;
    const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
    let target: Echo | Anchor | null = null;
    if (en.satiated <= 0) {
      let best = en.range * TILE;
      for (const e of this.echoes) {
        if (e.state === 'fading') continue;
        const d = Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy);
        if (d < best) { best = d; target = e; }
      }
      // the Weaver's Shadow Anchor is just as tasty a decoy
      for (const a of this.anchors) {
        if (a.state === 'fading') continue;
        const d = Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy);
        if (d < best) { best = d; target = a; }
      }
    }
    let tx: number, ty: number;
    if (target) { tx = target.x + target.w / 2; ty = target.y + target.h / 2; en.hunting = true; }
    else {
      en.wanderT += 0.012;
      tx = en.spawnX + en.w / 2 + Math.sin(en.wanderT) * 40;
      ty = en.spawnY + en.h / 2 + Math.cos(en.wanderT * 1.3) * 18;
    }
    const maxV = target ? 1.0 : 0.45;
    const acc = target ? 0.06 : 0.02;
    const ddx = tx - cx, ddy = ty - cy;
    const dist = Math.hypot(ddx, ddy) || 1;
    en.vx += (ddx / dist) * acc;
    en.vy += (ddy / dist) * acc;
    const sp = Math.hypot(en.vx, en.vy);
    if (sp > maxV) { en.vx *= maxV / sp; en.vy *= maxV / sp; }
    if (en.satiated > 0) { en.vx *= 0.9; en.vy *= 0.9; }
    const nx = en.x + en.vx;
    if (!this.rectSolid(nx, en.y, en.w, en.h)) en.x = nx; else { en.vx = -en.vx * 0.5; en.wanderT += 0.8; }
    const ny = en.y + en.vy;
    if (!this.rectSolid(en.x, ny, en.w, en.h)) en.y = ny; else { en.vy = -en.vy * 0.5; en.wanderT += 0.8; }
    en.facing = en.vx >= 0 ? 1 : -1;
    if (target && overlap(en, target)) this.eatEcho(target, en);
    if (en.hunting && en.animT % 100 === 0) this.audio.play('devourer');
    if (!p.dead && p.invuln === 0 && p.dashT === 0 && overlap(en, p)) {
      this.hurt(1, cx);
      this.energy = Math.max(0, this.energy - 2);
      this.say('Pożeracz wyssał Twoją energię!');
      en.vx = -(ddx / dist) * 2.2;
      en.vy = -(ddy / dist) * 2.2;
    }
  }

  private eatEcho(e: Echo | Anchor, en: Enemy) {
    const idx = this.echoes.indexOf(e as Echo);
    if (idx >= 0) this.echoes.splice(idx, 1);
    const ai = this.anchors.indexOf(e as Anchor);
    if (ai >= 0) this.anchors.splice(ai, 1);
    en.satiated = 330;
    en.hunting = false;
    this.audio.play('echoEaten');
    this.say(ai >= 0 ? 'Pożeracz pochłonął Kotwicę Cienia!' : 'Pożeracz pochłonął echo!');
    this.particles.burst(e.x + e.w / 2, e.y + e.h / 2, { count: 28, color: ['#6ff3ff', '#8a2fc2', '#ff7bf0'], speed: 2, life: 45, glow: true, drag: 0.94 });
  }

  /* ------------------------------------------------------------------ */
  /*  Camera, FX, HUD                                                    */
  /* ------------------------------------------------------------------ */
  private cameraTarget() {
    const p = this.player;
    const L = this.level;
    const tx = p.x + p.w / 2 + p.facing * 24 - this.view.w / 2;
    const ty = p.y + p.h / 2 - this.view.h / 2 - 12;
    const maxX = Math.max(0, L.w * TILE - this.view.w);
    const maxY = Math.max(0, L.h * TILE - this.view.h);
    return { x: Math.max(0, Math.min(maxX, tx)), y: Math.max(0, Math.min(maxY, ty)) };
  }

  private snapCamera() {
    const t = this.cameraTarget();
    this.cam.x = t.x;
    this.cam.y = t.y;
  }

  private updateCamera() {
    const t = this.cameraTarget();
    const kx = this.camFast > 0 ? 0.22 : 0.08, ky = this.camFast > 0 ? 0.25 : 0.1;
    this.cam.x += (t.x - this.cam.x) * kx;
    this.cam.y += (t.y - this.cam.y) * ky;
    if (Math.abs(t.x - this.cam.x) < 0.05) this.cam.x = t.x;
    if (Math.abs(t.y - this.cam.y) < 0.05) this.cam.y = t.y;
  }

  private updateAmbientParticles() {
    if (this.frame % 6 !== 0) return;
    const theme = this.level.def.theme;
    const colors = theme === 'heart' ? ['#ff9bf5', '#c15cf5'] : theme === 'archive' ? ['#9ff0ff', '#5fd0ff']
      : theme === 'gardens' ? ['#5cff9f', '#d8ffe8', '#ffd36a'] : theme === 'forge' ? ['#ff9a3a', '#ffd08a', '#ff6a3a'] : theme === 'spire' ? ['#c0b4ff', '#ffffff', '#9b8cff'] : ['#9ffbe6', '#6ff3ff'];
    const x = this.cam.x + Math.random() * this.view.w;
    const y = this.cam.y + Math.random() * this.view.h;
    if (this.rectSolid(x, y, 1, 1)) return;
    const ember = theme === 'forge';
    this.particles.add({ x, y, vx: (Math.random() - 0.5) * (ember ? 0.3 : 0.15), vy: ember ? -0.25 - Math.random() * 0.3 : -0.1 - Math.random() * 0.15, life: 240, max: 240, color: colors[Math.floor(Math.random() * colors.length)], size: 1, g: 0, drag: 1, glow: true, shrink: false });
    // updraft spore streams
    const L = this.level;
    if (L.updrafts.length) {
      for (let k = 0; k < 2; k++) {
        const u = L.updrafts[Math.floor(Math.random() * L.updrafts.length)];
        const ux = u.x * TILE, uy = u.y * TILE;
        if (ux < this.cam.x - 32 || ux > this.cam.x + this.view.w + 32 || uy < this.cam.y - 32 || uy > this.cam.y + this.view.h + 32) continue;
        this.particles.add({ x: ux + Math.random() * TILE, y: uy + Math.random() * TILE, vx: (Math.random() - 0.5) * 0.2, vy: -1.2 - Math.random() * 0.8, life: 40, max: 40, color: Math.random() < 0.5 ? '#d8ffe8' : '#9ffbe6', size: 1, g: 0, drag: 1, glow: true, shrink: false });
      }
    }
  }

  say(text: string, secs = 2.8) {
    this.message = { text, until: this.frame + Math.round(secs * 60) };
  }

  private emitHud() {
    const p = this.player;
    const a0 = this.anchors.find((a) => a.state === 'live');
    this.onHud({
      hp: p.hp, maxHp: this.stats.maxHp, crystals: this.save.crystals,
      energy: Math.round(this.energy * 20) / 20, maxEnergy: this.stats.recordTime,
      recording: !!this.recording, recTime: this.recording ? this.recording.frames.length / 60 : 0, recMax: this.stats.recordTime,
      echoes: this.liveEchoCount(), maxEchoes: this.stats.maxEchoes,
      area: this.level.def.name, message: this.message?.text ?? null, prompt: this.prompt, sign: this.sign,
      memory: this.stats.memory, hasMemory: !!this.lastRecording, lowEnergy: this.energy < 1,
      act: LEVEL_ORDER.indexOf(this.level.def.id) >= 7 ? 2 : 1,
      keys: this.keys.size, reflections: this.echoes.filter((e) => e.state !== 'fading' && e.reflected).length,
      character: this.save.character, charsUnlocked: this.save.characters.length,
      dashes: p.dashesLeft, maxDashes: this.stats.dashes,
      anchor: a0 ? (Number.isFinite(a0.lifeMax) ? a0.life / a0.lifeMax : 1) : -1,
      boss: this.level.boss?.active && !this.level.boss.defeated ? {
        name: this.level.boss.name, title: this.level.boss.title, hp: this.level.boss.hp,
        maxHp: this.level.boss.maxHp, phase: this.level.boss.phase, vulnerable: this.level.boss.vulnerable,
      } : null,
    });
  }
}
