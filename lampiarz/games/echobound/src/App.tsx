import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './game/audio';
import { Game } from './game/game';
import { clearSave, loadSave, loadSettings, newSave, writeSettings } from './game/save';
import type { GameEvent, HudState, SaveData, Settings, VictoryStats } from './game/types';
import { MainMenu } from './components/MainMenu';
import { AreaBanner, HUD } from './components/HUD';
import { DeathScreen, PauseMenu, UpgradeShop, VictoryScreen } from './components/Overlays';
import { ControlsPanel, SettingsPanel } from './components/Panels';
import { TouchControls } from './components/TouchControls';
import { IntroCutscene } from './components/IntroCutscene';
import { UnlockCutscene } from './components/UnlockCutscene';
import { CharacterSelect } from './components/CharacterSelect';
import { UnlockScreen } from './components/UnlockScreen';
import type { CharId } from './game/constants';

type Overlay = 'none' | 'intro' | 'pause' | 'dead' | 'victory' | 'shop' | 'settings' | 'controls' | 'characters' | 'unlock' | 'unlockCutscene';

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [hud, setHud] = useState<HudState | null>(null);
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const [save, setSave] = useState<SaveData | null>(() => loadSave());
  const [banner, setBanner] = useState<{ name: string; subtitle: string; k: number } | null>(null);
  const [victory, setVictory] = useState<VictoryStats | null>(null);
  const [gameInstance, setGameInstance] = useState<Game | null>(null);
  const [unlockChar, setUnlockChar] = useState<CharId>('weaver');

  const audioRef = useRef<AudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new AudioEngine();
  const audio = audioRef.current;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const pendingSave = useRef<SaveData | null>(null);
  const pendingIntro = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // unlock audio on first interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      audio.init();
      audio.applySettings(settingsRef.current);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [audio]);

  const updateSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    writeSettings(s);
    audio.applySettings(s);
    gameRef.current?.setSettings(s);
  }, [audio]);

  const handleEvent = useCallback((e: GameEvent) => {
    switch (e.type) {
      case 'intro':
        setOverlay(e.active ? 'intro' : 'none');
        if (e.active) setBanner(null);
        break;
      case 'unlock': setUnlockChar(e.char); setOverlay('unlockCutscene'); break;
      case 'pause': setOverlay('pause'); break;
      case 'death': setOverlay('dead'); break;
      case 'victory': setVictory(e.stats); setOverlay('victory'); break;
      case 'shop': setOverlay('shop'); break;
      case 'levelStart': setBanner({ name: e.name, subtitle: e.subtitle, k: Date.now() }); break;
      case 'saved': setSave(loadSave()); break;
    }
  }, []);

  // create / destroy the game with the canvas
  useEffect(() => {
    if (screen !== 'game' || !canvasRef.current || !pendingSave.current) return;
    const game = new Game(canvasRef.current, audio, settingsRef.current, pendingSave.current, setHud, handleEvent);
    gameRef.current = game;
    setGameInstance(game);
    game.start(pendingIntro.current);
    return () => {
      game.saveNow();
      game.destroy();
      gameRef.current = null;
      setGameInstance(null);
    };
  }, [screen, audio, handleEvent]);

  const startGame = (data: SaveData, showIntro = false) => {
    audio.init();
    pendingSave.current = data;
    pendingIntro.current = showIntro;
    setVictory(null);
    setBanner(null);
    setOverlay('none');
    setScreen('game');
  };

  const exitToMenu = () => {
    setOverlay('none');
    setHud(null);
    setScreen('menu');
    setTimeout(() => setSave(loadSave()), 0);
  };

  const resume = () => { gameRef.current?.resume(); setOverlay('none'); };

  const isTouch = useMemo(() => {
    if (settings.touch === 'on') return true;
    if (settings.touch === 'off') return false;
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    return !!coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  }, [settings.touch]);

  if (screen === 'menu') {
    return (
      <MainMenu
        save={save} settings={settings} audio={audio}
        onNewGame={() => startGame(newSave(), true)}
        onContinue={() => { if (save) startGame(save, false); }}
        onSettings={updateSettings}
        onResetSave={() => { clearSave(); setSave(null); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-[#04050c]">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {hud && overlay !== 'victory' && <HUD hud={hud} touch={isTouch} />}
      {banner && <AreaBanner name={banner.name} subtitle={banner.subtitle} k={banner.k} />}
      {isTouch && gameInstance && overlay === 'none' && (
        <TouchControls input={gameInstance.input} onPause={() => gameInstance.pause()} weaver={hud?.character === 'weaver'} canSwap={(hud?.charsUnlocked ?? 1) > 1} />
      )}

      {overlay === 'intro' && gameInstance && (
        <IntroCutscene onFinish={() => {
          gameInstance.finishIntro();
          setOverlay('none');
        }} />
      )}

      {overlay === 'pause' && gameInstance && (
        <PauseMenu
          game={gameInstance} onResume={resume}
          onShop={() => gameInstance.openShop()}
          onSettings={() => setOverlay('settings')}
          onControls={() => setOverlay('controls')}
          onCharacters={() => setOverlay('characters')}
          onExit={exitToMenu}
        />
      )}
      {overlay === 'settings' && (
        <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setOverlay('pause')} hasSave={true} audio={audio} />
      )}
      {overlay === 'controls' && <ControlsPanel onClose={() => setOverlay('pause')} />}
      {overlay === 'characters' && gameInstance && <CharacterSelect game={gameInstance} onClose={() => setOverlay('pause')} />}
      {overlay === 'unlockCutscene' && gameInstance && (
        <UnlockCutscene onFinish={() => {
          setOverlay('unlock');
        }} />
      )}
      {overlay === 'unlock' && gameInstance && (
        <UnlockScreen
          char={unlockChar}
          onContinue={resume}
          onPlay={() => { resume(); gameRef.current?.swapCharacter(unlockChar); }}
        />
      )}
      {overlay === 'shop' && gameInstance && <UpgradeShop game={gameInstance} onClose={resume} />}
      {overlay === 'dead' && gameInstance && (
        <DeathScreen game={gameInstance} onRespawn={() => { gameInstance.respawn(); setOverlay('none'); }} onExit={exitToMenu} />
      )}
      {overlay === 'victory' && victory && (
        <VictoryScreen stats={victory} onMenu={exitToMenu} onContinue={() => { gameRef.current?.continueAfterVictory(); setOverlay('none'); }} />
      )}
    </div>
  );
}
