import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { abandonRun, newRun } from '../game/engine';
import { checkAchievements, finalizeRun, newProfile, syncDiscoveries, todayKey, type Settings } from '../game/meta';
import { hashString } from '../game/rng';
import type { ClassId, Run } from '../game/types';
import { clearRun, loadProfile, loadRun, resetAll, saveProfile, saveRun } from '../save/storage';
import { achievementToast, Modal, Toasts, type ToastItem } from './common';
import { GameScreen } from './GameScreen';
import { MainMenu } from './MainMenu';
import { BookModal, HowToModal, SettingsModal } from './MetaModals';
import { NewRun } from './NewRun';

type Screen = 'menu' | 'setup' | 'game';
type Overlay = null | 'settings' | 'howto' | 'book';

let toastSeq = 1;

export function App() {
  const [boot] = useState(() => {
    const p = loadProfile();
    const r = loadRun();
    return { profile: p.value, run: r.value, warnings: [p.warning, r.warning].filter((w): w is string => !!w) };
  });
  const profileRef = useRef(boot.profile);
  const [, setProfileVer] = useState(0);
  const [run, setRun] = useState<Run | null>(boot.run);
  const [screen, setScreen] = useState<Screen>('menu');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDaily, setConfirmDaily] = useState(false);
  const profile = profileRef.current;

  const pushToast = useCallback((t: Omit<ToastItem, 'id'>) => {
    const item = { ...t, id: toastSeq++ };
    setToasts((ts) => [...ts, item]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== item.id)), 4800);
  }, []);

  const persistProfile = useCallback(() => {
    if (!saveProfile(profileRef.current)) {
      // storage may be unavailable; the game still works in-memory
    }
    setProfileVer((v) => v + 1);
  }, []);

  // ---------------------------------------------------------------- boot
  useEffect(() => {
    audio.configure(profile.settings);
    for (const w of boot.warnings) pushToast({ kind: 'warn', title: 'Problem z zapisem', text: w });
    const minDelay = new Promise((r) => setTimeout(r, 650));
    const fonts = (document.fonts?.load('600 16px Lora').catch(() => undefined) ?? Promise.resolve()) as Promise<unknown>;
    const timeout = new Promise((r) => setTimeout(r, 2500));
    void Promise.all([minDelay, Promise.race([fonts, timeout])]).then(() => setLoading(false));
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- run bookkeeping
  const onRunChanged = useCallback(
    (r: Run): string[] => {
      const p = profileRef.current;
      saveRun(r);
      syncDiscoveries(p, r);
      let fresh = checkAchievements(p, r);
      if (r.phase === 'victory' || r.phase === 'defeat') fresh = [...fresh, ...finalizeRun(p, r)];
      // at the end of a night the summary screen lists new achievements itself
      if (r.phase !== 'victory' && r.phase !== 'defeat') for (const id of fresh) pushToast(achievementToast(id, 0));
      persistProfile();
      return fresh;
    },
    [persistProfile, pushToast],
  );

  const endCurrentRunIfAny = () => {
    if (run && run.phase !== 'victory' && run.phase !== 'defeat') {
      abandonRun(run);
      onRunChanged(run);
    }
    clearRun();
  };

  const startRun = (cls: ClassId, night: number, seed: number, daily: string | null) => {
    endCurrentRunIfAny();
    const r = newRun({ cls, night, seed, daily });
    saveRun(r);
    setRun(r);
    setScreen('game');
    audio.unlock();
  };

  const startDaily = () => {
    const key = todayKey();
    startRun('lampiarz', 1, hashString('lampiarz-dzien-' + key), key);
  };

  const exitToMenu = () => {
    if (run) {
      if (run.phase === 'victory' || run.phase === 'defeat') {
        clearRun();
        setRun(null);
      } else saveRun(run);
    }
    setOverlay(null);
    setScreen('menu');
  };

  const updateSettings = (s: Settings) => {
    profileRef.current.settings = s;
    audio.configure(s);
    persistProfile();
  };

  const toggleMute = () => updateSettings({ ...profileRef.current.settings, muted: !profileRef.current.settings.muted });

  const resetProgress = () => {
    resetAll();
    profileRef.current = newProfile();
    setRun(null);
    setOverlay(null);
    setScreen('menu');
    persistProfile();
    pushToast({ kind: 'info', title: 'Postęp usunięty', text: 'Księga jest znowu pusta.' });
  };

  const savedRun = run && run.phase !== 'victory' && run.phase !== 'defeat' ? run : null;
  const today = todayKey();

  return (
    <>
      {screen === 'menu' ? (
        <MainMenu
          profile={profile}
          savedRun={savedRun}
          dailyScore={profile.daily[today] ?? null}
          onContinue={() => setScreen('game')}
          onNew={() => setScreen('setup')}
          onDaily={() => (savedRun ? setConfirmDaily(true) : startDaily())}
          onBook={() => setOverlay('book')}
          onHowTo={() => setOverlay('howto')}
          onSettings={() => setOverlay('settings')}
        />
      ) : null}
      {screen === 'setup' ? (
        <NewRun profile={profile} hasSaved={!!savedRun} onBack={() => setScreen('menu')} onStart={(c, n, s) => startRun(c, n, s, null)} />
      ) : null}
      {screen === 'game' && run ? (
        <GameScreen
          run={run}
          profile={profile}
          onRunChanged={onRunChanged}
          onExitToMenu={exitToMenu}
          onNewRun={() => {
            clearRun();
            setRun(null);
            setScreen('setup');
          }}
          onAbandon={() => {
            abandonRun(run);
          }}
          onOpenSettings={() => setOverlay('settings')}
          onOpenHowTo={() => setOverlay('howto')}
          onToggleMute={toggleMute}
          overlayOpen={overlay !== null}
        />
      ) : null}

      {overlay === 'settings' ? (
        <SettingsModal settings={profile.settings} onChange={updateSettings} onClose={() => setOverlay(null)} onReset={screen === 'menu' ? resetProgress : undefined} />
      ) : null}
      {overlay === 'howto' ? <HowToModal onClose={() => setOverlay(null)} /> : null}
      {overlay === 'book' ? <BookModal profile={profile} onClose={() => setOverlay(null)} /> : null}
      {confirmDaily ? (
        <Modal onClose={() => setConfirmDaily(false)} labelledBy="cd-title">
          <p className="eyebrow">Noc dnia</p>
          <h2 id="cd-title">Porzucić trwającą noc?</h2>
          <p className="muted">Noc dnia to to samo miasto dla wszystkich graczy dzisiaj. Rozpoczęcie jej zakończy obecną noc jako przegraną.</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirmDaily(false)}>
              Anuluj
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setConfirmDaily(false);
                startDaily();
              }}
            >
              Rozpocznij Noc dnia
            </button>
          </div>
        </Modal>
      ) : null}

      <Toasts items={toasts} />
      <div className={`loading ${loading ? '' : 'done'}`} aria-hidden={!loading}>
        <div className="loading-inner">
          <div className="loading-flame" />
          <div className="loading-text">Rozpalanie knotów…</div>
        </div>
      </div>
    </>
  );
}
