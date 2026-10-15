// Walking playthrough: the player only moves (forward + turning) and presses E; no
// teleports. Monsters are held dormant, so this checks the level, its doors and
// the order of the objectives, not survival.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sim } from '../src/game/sim';
import { newState } from '../src/game/state';
import { codeOf } from '../src/game/puzzle';
function playthrough(diff: any, seed: number) {
  const sim: any = new Sim(newState(diff, seed));

  const idle = { fwd: 0, side: 0, sprint: false, crouch: false, fire: false, aim: false };
  let T = 0;
  const log: string[] = [];
  const quiet = () => {
    for (const m of sim.monsters) {
      m.active = false;
      if (m.state !== 'dead') {
        m.set('dormant');
        m.x = m.z = -100;
        m.dormantFor = 1e9;
      }
    }
  };
  const step = (c = idle) => {
    quiet();
    sim.update(1 / 30, c);
    T += 1 / 30;
    if (sim.dead) throw new Error('died');
  };
  const wait = (s: number) => {
    for (let i = 0; i < s * 30; i++) step();
  };
  function standPoints(id: string) {
    const it = sim.interactables.find((i: any) => i.id === id);
    if (!it) throw new Error('no ' + id);
    const cx = (it.box.x0 + it.box.x1) / 2,
      cz = (it.box.z0 + it.box.z1) / 2;
    const L = sim.level;
    const out: [number, number][] = [];
    for (const d of [1.0, 1.4, 1.8, 0.75])
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = cx + Math.cos(a) * d,
          z = cz + Math.sin(a) * d;
        const t = L.cell(Math.floor(x / 2), Math.floor(z / 2));
        if (t !== 1 && t !== 3) continue;
        if (L.propBoxes.some(({ box }: any) => x > box.x0 - 0.36 && x < box.x1 + 0.36 && z > box.z0 - 0.36 && z < box.z1 + 0.36)) continue;
        if (
          [
            [-0.36, 0],
            [0.36, 0],
            [0, -0.36],
            [0, 0.36],
          ].some(([dx, dz]) => L.isSolid(Math.floor((x + dx) / 2), Math.floor((z + dz) / 2)))
        )
          continue;
        out.push([x, z]);
      }
    return out;
  }
  const pass = (d: any) =>
    sim.state.doors[d.id].open ||
    sim.state.doors[d.id].unlocked ||
    d.kind === 'normal' ||
    (d.kind === 'power' && sim.state.gen.on) ||
    (d.kind === 'card' && sim.state.liftcard) ||
    (d.kind === 'hidden' && sim.has('knowsSecret'));
  function walkTo(tx: number, tz: number, what: string) {
    const p = sim.player;
    let path = sim.level.path(p.x, p.z, tx, tz, pass);
    if (!path) throw new Error(`no path to ${what} from ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    path = [...path, [tx, tz]];
    let best = 1e9,
      stall = 0,
      t0 = T;
    while (path.length && !sim.ended) {
      const [wx, wz] = path[0];
      // a closed door on the way: open it
      const cx = Math.floor(wx / 2),
        cz = Math.floor(wz / 2);
      const door = sim.level.doorAtCell(cx, cz);
      if (door && !sim.state.doors[door.id].open && Math.hypot(wx - p.x, wz - p.z) < 2.6) {
        sim.aimAt(`door:${door.id}`);
        sim.interact();
        wait(1.4);
        if (!sim.state.doors[door.id].open) throw new Error(`door ${door.id} would not open (${sim.doorLabel(door)})`);
        continue;
      }
      p.yaw = Math.atan2(-(wx - p.x), -(wz - p.z));
      p.pitch = 0;
      step({ ...idle, fwd: 1 });
      const d = Math.hypot(wx - p.x, wz - p.z);
      if (d < (path.length === 1 ? 0.15 : 0.4)) {
        path.shift();
        best = 1e9;
        stall = 0;
        continue;
      }
      if (d < best - 0.02) {
        best = d;
        stall = 0;
      } else if (++stall > 90) throw new Error(`stuck on the way to ${what} at ${p.x.toFixed(2)},${p.z.toFixed(2)} → ${wx.toFixed(1)},${wz.toFixed(1)}`);
      if (T - t0 > 240) throw new Error('timeout ' + what);
    }
  }
  function use(id: string) {
    const pts = standPoints(id);
    const p = sim.player;
    pts.sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.z) - Math.hypot(b[0] - p.x, b[1] - p.z));
    let lastErr: any;
    for (const [x, z] of pts.slice(0, 12)) {
      try {
        walkTo(x, z, id);
      } catch (e) {
        lastErr = e;
        continue;
      }
      if (sim.aimAt(id)) {
        const lb = sim.focus.label();
        sim.interact();
        wait(0.3);
        log.push(`${T.toFixed(0).padStart(5)}s  ${id}: ${lb}`);
        return;
      }
    }
    throw lastErr ?? new Error('cannot aim at ' + id);
  }
  try {
    use('door:start');
    use('pick:p_d01');
    for (let i = 0; i < 5; i++) use(`prop:clock${i}`);
    use('wall:door');
    use('door:mzdark');
    use('prop:genpanel');
    for (const a of ['pump', 'choke', 'start']) sim.genAction(a);
    wait(2);
    use('prop:radio');
    for (const s of ['A', 'B']) {
      sim.radioFreq = sim.puzzle.radio['freq' + s];
      sim.observe('radio_' + sim.stationAt(sim.radioFreq));
    }
    use('door:darkstore');
    use('prop:console');
    sim.cctv = { cam: 2, viewT: 0 };
    wait(2);
    sim.cctv = null;
    use('prop:uvswitch');
    use('wall:uv');
    use('wall:paint');
    use('door:power');
    use('prop:roster');
    use('prop:armory_keypad');
    const r = sim.enterCode(codeOf(sim.puzzle));
    log.push('code: ' + r);
    use('door:armory');
    use('pick:p_revolver');
    use('pick:p_liftcard');
    use('door:lift');
    use('prop:liftpanel');
    wait(10);
    if (sim.state.area !== 'descent') throw new Error('lift did not go down');
    log.push(`${T.toFixed(0).padStart(5)}s  --- descent`);
    for (const l of ['lever_a', 'lever_b', 'lever_c']) use('prop:' + l);
    if (!sim.state.doors.anchor.open) {
      use('door:anchor');
      wait(2);
    }
    use('prop:anchor_terminal');
    log.push('choice: ' + sim.anchorChoice('open'));
    wait(3);
    log.push('exit door open: ' + sim.state.doors.exit.open + ' anim ' + sim.doorAnim.exit);
    walkTo(114.5, 97, 'exit');
    for (let i = 0; i < 60 && !sim.ended; i++) step({ ...idle, fwd: 1 });
    log.push(`${T.toFixed(0).padStart(5)}s  ended: ${sim.ended}`);
  } catch (e: any) {
    log.push('FAILED: ' + e.message);
  }
  return { sim, log };
}

for (const [diff, seed] of [
  ['normal', 77],
  ['nomercy', 1234],
] as const)
  test(`the whole game can be walked through without teleporting (${diff})`, () => {
    const { sim, log } = playthrough(diff, seed);
    const failed = log.find((l: string) => l.startsWith('FAILED'));
    assert.equal(failed, undefined, log.join('\n'));
    assert.equal(sim.ended, 'zejscie');
    for (const o of ['clock0', 'order', 'radio_A', 'radio_B', 'cam3', 'uv', 'roster']) assert.ok(sim.state.obs.includes(o), o);
  });
