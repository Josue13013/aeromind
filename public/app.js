import { createEngine, TRACKS } from './audio.js';

const $ = (selector) => document.querySelector(selector);
const engine = createEngine();

const views = [...document.querySelectorAll('.view')];
const tabs = [...document.querySelectorAll('.tabbar a')];

function show(id, moveFocus) {
  const target = views.find((v) => v.id === id) ?? views[0];
  for (const view of views) view.hidden = view !== target;
  for (const tab of tabs) {
    if (tab.hash === `#${target.id}`) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  document.title = `${target.dataset.title} · AeroMind`;
  window.scrollTo(0, 0);
  if (moveFocus) target.querySelector('h1')?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => show(location.hash.slice(1), true));
show(location.hash.slice(1), false);

const PATTERNS = {
  '4-6': [['Inhala', 4, true], ['Exhala', 6, false]],
  '4-4-4-4': [['Inhala', 4, true], ['Sostén', 4, null], ['Exhala', 4, false], ['Sostén', 4, null]],
};
const CHIMES = { Inhala: 528, Exhala: 396, Sostén: 440 };

const circle = $('#circle');
const cue = $('#cue');
const count = $('#count');
const breathButton = $('#breath-toggle');
let breath = null;

async function keepScreenOn() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

function stopBreath(message) {
  if (!breath) return;
  clearInterval(breath.timer);
  breath.lock?.release?.();
  breath = null;
  circle.classList.remove('grow');
  cue.textContent = message;
  count.textContent = '';
  breathButton.textContent = 'Empezar';
  breathButton.setAttribute('aria-pressed', 'false');
}

async function startBreath() {
  const pattern = PATTERNS[document.querySelector('input[name="patron"]:checked').value];
  const endsAt = Date.now() + Number($('#minutos').value) * 60_000;
  const withSound = $('#guia-sonora').checked;
  let phase = -1;
  let phaseEndsAt = 0;

  const step = () => {
    const now = Date.now();
    if (now >= endsAt && phase !== -1 && now >= phaseEndsAt) {
      stopBreath('¡Muy bien! Respira normal unos segundos.');
      return;
    }
    if (now >= phaseEndsAt) {
      phase = (phase + 1) % pattern.length;
      const [label, seconds, grow] = pattern[phase];
      phaseEndsAt = now + seconds * 1000;
      circle.style.setProperty('--dur', `${seconds}s`);
      if (grow === true) circle.classList.add('grow');
      if (grow === false) circle.classList.remove('grow');
      cue.textContent = label;
      if (withSound) engine.chime(CHIMES[label]);
    }
    count.textContent = String(Math.ceil((phaseEndsAt - now) / 1000));
  };

  breath = { timer: setInterval(step, 200), lock: await keepScreenOn() };
  breathButton.textContent = 'Detener';
  breathButton.setAttribute('aria-pressed', 'true');
  step();
}

breathButton.addEventListener('click', () => {
  if (breath) {
    stopBreath('Ejercicio detenido');
    return;
  }
  if ($('#guia-sonora').checked) engine.unlock();
  startBreath();
});

const GROUND_STEPS = [
  'Nombra 5 cosas que puedes ver.',
  'Toca 4 cosas que tienes cerca.',
  'Escucha 3 sonidos a tu alrededor.',
  'Busca 2 olores.',
  'Nota 1 sabor en tu boca.',
  '¡Listo! Ahora respira despacio un par de veces.',
];
let groundIndex = 0;
$('#ground-next').addEventListener('click', (event) => {
  groundIndex = (groundIndex + 1) % GROUND_STEPS.length;
  $('#ground-step').textContent = GROUND_STEPS[groundIndex];
  event.currentTarget.textContent = groundIndex === GROUND_STEPS.length - 1 ? 'Empezar de nuevo' : 'Siguiente';
});

const tracksBox = $('#tracks');
const playButtons = new Map();

function refreshButtons() {
  for (const [id, button] of playButtons) {
    const on = engine.playing === id;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', `${on ? 'Pausar' : 'Reproducir'} ${TRACKS[id].nombre}`);
    button.querySelector('use').setAttribute('href', on ? '#i-pause' : '#i-play');
  }
}

for (const [id, track] of Object.entries(TRACKS)) {
  const card = document.createElement('div');
  card.className = 'card track';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'play';
  button.innerHTML = '<svg aria-hidden="true"><use href="#i-play"/></svg>';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = track.nombre;
  const detail = document.createElement('small');
  detail.textContent = track.detalle;
  text.append(title, detail);
  card.append(button, text);
  tracksBox.append(card);
  playButtons.set(id, button);
  button.addEventListener('click', async () => {
    if (engine.playing === id) engine.stop();
    else await engine.play(id);
    refreshButtons();
  });
}
refreshButtons();

$('#volumen').addEventListener('input', (event) => engine.setVolume(Number(event.target.value)));

let sleepTimer = null;
$('#apagar').addEventListener('change', (event) => {
  clearTimeout(sleepTimer);
  const minutes = Number(event.target.value);
  if (minutes > 0) {
    sleepTimer = setTimeout(() => {
      engine.stop(3);
      refreshButtons();
      event.target.value = '0';
    }, minutes * 60_000);
  }
});

const netStatus = $('#net-status');
const updateNet = () => { netStatus.hidden = navigator.onLine; };
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
updateNet();

const INSTALLED_KEY = 'aeromind-instalada';
const installButton = $('#install');
const iosTip = $('#ios-tip');
const installedNote = $('#installed-note');
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt = null;

function wasInstalled() {
  try { return localStorage.getItem(INSTALLED_KEY) === '1'; } catch { return false; }
}

function markInstalled() {
  try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { }
  installPrompt = null;
  installButton.hidden = true;
  iosTip.hidden = true;
  installedNote.hidden = false;
}

if (standalone || wasInstalled()) markInstalled();
else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) iosTip.hidden = false;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (standalone || wasInstalled()) return;
  installPrompt = event;
  installButton.hidden = false;
});
window.addEventListener('appinstalled', markInstalled);
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome === 'accepted') markInstalled();
  else installButton.hidden = true;
});
$('#ios-done').addEventListener('click', markInstalled);
navigator.getInstalledRelatedApps?.()
  .then((apps) => { if (apps.length > 0) markInstalled(); })
  .catch(() => {});

if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.ready.then(async () => {
    if (await caches.match('./index.html')) $('#offline-badge').hidden = false;
  });
}
