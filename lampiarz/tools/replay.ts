// Plays district 1 with the bot in Node and prints the key sequence + final state for browser replay.
import { codeToSeed } from '../src/game/rng';
import { newRun, playerAct } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import { botAction } from '../tests/helpers';
const code = process.argv[2];
const run = newRun({ cls: 'lampiarz', night: 1, seed: codeToSeed(code), daily: null });
const rng = new Rng(11);
const keys: string[] = [];
for (let i = 0; i < 400 && run.phase === 'play'; i++) {
  const a = botAction(run, rng);
  if (a.type === 'interact') continue; // facing hack in bot is not reproducible by keys
  playerAct(run, a);
  keys.push(a.type === 'move' ? ({ '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' } as Record<string, string>)[`${a.dx},${a.dy}`] : a.type === 'wait' ? 'Space' : 'KeyQ');
}
console.log(JSON.stringify({ keys, phase: run.phase, turn: run.district.turn, player: [run.player.x, run.player.y, run.player.hp, run.player.oil, run.player.embers], enemies: run.district.enemies.length, rng: run.rngState }));
