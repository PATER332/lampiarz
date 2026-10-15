// Plays the interactive tutorial in Node following its instructions and prints the key sequence
// plus the expected end state, so tools/e2e_tutorial.py can replay it in a real browser.
import { playerAct } from '../src/game/engine';
import { newTutorialRun, tutorialAdvance } from '../src/game/tutorial';
import { tutorialBotAction } from '../tests/helpers';
const run = newTutorialRun();
const keys: string[] = [];
for (let i = 0; i < 400 && run.phase === 'play'; i++) {
  const a = tutorialBotAction(run);
  playerAct(run, a);
  tutorialAdvance(run);
  keys.push(a.type === 'move' ? ({ '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' } as Record<string, string>)[`${a.dx},${a.dy}`] : a.type === 'wait' ? 'Space' : 'KeyQ');
}
console.log(JSON.stringify({ keys, phase: run.phase, done: run.tutorial!.done, turn: run.district.turn, player: [run.player.x, run.player.y, run.player.hp, run.player.oil] }));
