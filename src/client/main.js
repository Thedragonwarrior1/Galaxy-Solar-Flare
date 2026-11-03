// GRAND BRAWL — browser entry point.
import { GameRenderer } from './render/renderer.js';
import { InputManager, TouchControls, isTouchDevice } from './input/input.js';
import { audio } from './audio/audio.js';
import { createSimAudio } from './audio/simEvents.js';
import { loadSettings } from './settings.js';
import { App } from './app.js';
import { mainMenu, modeSelect, matchSetup, arenaSelect, settingsScreen, credits, pauseOverlay } from './ui/screens.js';
import { charSelect } from './ui/charSelect.js';
import { resultsScreen, tournamentScreen } from './ui/results.js';
import { onlineScreen } from './ui/online.js';

const boot = document.getElementById('boot');
const bar = boot.querySelector('.boot-bar i');
const msg = boot.querySelector('.boot-msg');
const step = (p, t) => { bar.style.width = p + '%'; msg.textContent = t; return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); };

async function start() {
  const settings = loadSettings();
  await step(10, 'Hoisting the sails…');
  let renderer;
  try {
    renderer = new GameRenderer(document.getElementById('stage'), settings);
  } catch (e) {
    msg.textContent = 'WebGL is not available on this device/browser, so GRAND BRAWL cannot run here.';
    throw e;
  }
  await step(30, 'Sculpting the crew…');
  const portraits = renderer.renderPortraits(256);
  await step(60, 'Charting the arenas…');
  const input = new InputManager();
  input.setBindings(settings.keys);
  input.sensitivity = settings.cameraSensitivity;
  const uiRoot = document.getElementById('ui');
  const touch = new TouchControls(document.getElementById('app'), input);
  touch.show(false);
  const simAudio = createSimAudio(audio);
  const app = new App({ renderer, input, audio, simAudio, settings, portraits, touch, uiRoot });
  app.isTouch = isTouchDevice();
  app.register('main', mainMenu);
  app.register('modes', modeSelect);
  app.register('setup', matchSetup);
  app.register('select', charSelect);
  app.register('arena', arenaSelect);
  app.register('settings', settingsScreen);
  app.register('credits', credits);
  app.register('results', resultsScreen);
  app.register('tournament', tournamentScreen);
  app.register('online', onlineScreen);
  app.register('pause', pauseOverlay);
  await step(85, 'Warming up the cannons…');
  app.go('main');
  app.start();
  await step(100, 'Ready!');
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 700);
  window.__gb = { app, renderer, audio, input, version: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev' };
}

start().catch((e) => { console.error(e); });
