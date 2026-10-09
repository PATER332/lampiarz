import { useState } from 'react';
import { audio } from '../audio/audio';
import { CLASSES, NIGHTS } from '../game/content';
import { classUnlocked, type Profile } from '../game/meta';
import { codeToSeed } from '../game/rng';
import type { ClassId } from '../game/types';
import { ClassPortrait } from './common';
import { IconArrow, IconDice, IconHeart, IconLock, IconOil } from './icons';

export function NewRun({
  profile,
  hasSaved,
  onStart,
  onBack,
}: {
  profile: Profile;
  hasSaved: boolean;
  onStart: (cls: ClassId, night: number, seed: number) => void;
  onBack: () => void;
}) {
  const [cls, setCls] = useState<ClassId>('lampiarz');
  const [night, setNight] = useState(Math.min(profile.nightUnlocked, 1));
  const [seedText, setSeedText] = useState('');
  const start = () => {
    audio.play('click');
    const seed = seedText.trim() ? codeToSeed(seedText) : (Math.random() * 4294967296) >>> 0;
    onStart(cls, night, seed);
  };
  return (
    <div className="setup">
      <div className="setup-inner">
        <div className="setup-head">
          <div>
            <p className="eyebrow">Nowa noc</p>
            <h1>Kto dziś zapala latarnie?</h1>
          </div>
          <button className="btn ghost" onClick={() => (audio.play('click'), onBack())}>
            <IconArrow dir="left" size={18} /> Wróć
          </button>
        </div>

        <div className="class-grid" role="radiogroup" aria-label="Postać">
          {(Object.keys(CLASSES) as ClassId[]).map((id) => {
            const c = CLASSES[id];
            const ok = classUnlocked(profile, id);
            return (
              <button
                key={id}
                role="radio"
                aria-checked={cls === id}
                className={`class-card ${cls === id ? 'selected' : ''}`}
                disabled={!ok}
                onClick={() => {
                  audio.play('click');
                  setCls(id);
                }}
              >
                <div className="portrait">
                  <ClassPortrait cls={id} animate={ok} />
                  {!ok ? (
                    <div className="locked-veil">
                      <div>
                        <IconLock size={22} />
                        <div style={{ marginTop: 6 }}>{c.unlockHint}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="body">
                  <h3>{c.name}</h3>
                  <div className="role">{c.title}</div>
                  <div className="statline">
                    <span style={{ color: 'var(--blood)' }}>
                      <IconHeart size={15} /> {c.hp}
                    </span>
                    <span style={{ color: 'var(--oil)' }}>
                      <IconOil size={15} /> {c.startOil}/{c.maxOil}
                    </span>
                    <span className="muted">wręcz {c.melee}</span>
                  </div>
                  <div className="ability">
                    <b>{c.ability.name}</b> ({c.ability.cost} oleju): {c.ability.desc}
                  </div>
                  <div className="ability muted" style={{ marginTop: 6 }}>
                    {c.passive}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="setup-row">
          <div className="panel field">
            <span className="label">Trudność</span>
            <div className="nights" role="radiogroup" aria-label="Poziom nocy">
              {NIGHTS.map((n) => (
                <button
                  key={n.level}
                  className={`night-btn ${night === n.level ? 'on' : ''}`}
                  disabled={n.level > profile.nightUnlocked}
                  role="radio"
                  aria-checked={night === n.level}
                  aria-label={n.name}
                  title={n.level > profile.nightUnlocked ? 'Wygraj na poprzedniej nocy, by odblokować' : n.desc}
                  onClick={() => {
                    audio.play('click');
                    setNight(n.level);
                  }}
                >
                  {['I', 'II', 'III', 'IV', 'V'][n.level - 1]}
                </button>
              ))}
            </div>
            <div className="night-desc">
              {NIGHTS[night - 1].name}: {NIGHTS[night - 1].desc}
              {profile.nightUnlocked < 5 ? <span className="muted"> Wygrana odblokowuje kolejną noc.</span> : null}
            </div>
          </div>
          <div className="panel field">
            <label htmlFor="seed">Ziarno miasta (opcjonalnie)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="seed"
                className="input"
                placeholder="losowe — lub wpisz kod, np. MGL-4F2K"
                value={seedText}
                maxLength={32}
                onChange={(e) => setSeedText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') start();
                }}
              />
              <button className="btn icon" aria-label="Wyczyść ziarno" title="Losowe ziarno" onClick={() => setSeedText('')}>
                <IconDice />
              </button>
            </div>
            <div className="night-desc">To samo ziarno = to samo miasto i te same zdarzenia.</div>
          </div>
        </div>

        <div className="setup-actions">
          {hasSaved ? <span className="muted" style={{ alignSelf: 'center', fontSize: 14 }}>Rozpoczęcie porzuci trwającą noc.</span> : null}
          <button className="btn primary" onClick={start} data-autofocus>
            Zapal pierwszą latarnię
          </button>
        </div>
      </div>
    </div>
  );
}
