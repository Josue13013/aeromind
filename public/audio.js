const LOOKAHEAD_S = 2;
const TICK_MS = 500;

export const TRACKS = {
  cabina: { nombre: 'Cabina tranquila', detalle: 'Un zumbido grave y parejo, como el de la cabina en pleno vuelo.' },
  acordes: { nombre: 'Acordes para respirar', detalle: 'Acordes lentos que suben 4 segundos y bajan 6: respira con ellos.' },
  campanas: { nombre: 'Campanas lejanas', detalle: 'Notas suaves y espaciadas, con eco.' },
  arpa: { nombre: 'Arpa al atardecer', detalle: 'Notas de arpa que suben y bajan despacio, sobre acordes suaves.' },
};

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function loopedNoise(ctx, seconds = 6) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  src.loop = true;
  return src;
}

function filter(ctx, type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function gain(ctx, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function buildCabina(ctx, out) {
  const src = loopedNoise(ctx);
  const swell = gain(ctx, 1);
  chain(src, filter(ctx, 'lowpass', 260), filter(ctx, 'lowpass', 520), gain(ctx, 2.2), swell, out);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  chain(lfo, gain(ctx, 0.12), swell.gain);
  src.start();
  lfo.start();
  return { nodes: [src, lfo], schedule: () => {} };
}

const ARPA_CHORDS = [
  [130.81, 196.0, 261.63, 329.63, 392.0],
  [110.0, 164.81, 220.0, 261.63, 329.63],
  [87.31, 130.81, 174.61, 220.0, 261.63],
  [98.0, 146.83, 196.0, 246.94, 293.66],
];
const ARPA_PATTERN = [0, 1, 2, 3, 4, 3, 2, 1];
const ARPA_STEP_S = 0.75;
const PLUCK_S = 2.6;

function pluckBuffer(ctx, frequency) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * PLUCK_S);
  const buffer = ctx.createBuffer(1, length, rate);
  const y = buffer.getChannelData(0);
  const period = Math.round(rate / frequency);
  let smooth = 0;
  let mean = 0;
  for (let i = 0; i < period; i++) {
    smooth = smooth * 0.55 + (Math.random() * 2 - 1) * 0.45;
    y[i] = smooth;
    mean += smooth / period;
  }
  let peak = 0;
  for (let i = 0; i < period; i++) {
    y[i] -= mean;
    peak = Math.max(peak, Math.abs(y[i]));
  }
  for (let i = 0; i < period; i++) y[i] /= peak;
  for (let i = period; i < length; i++) {
    const a = y[i - period];
    const b = i - period - 1 >= 0 ? y[i - period - 1] : a;
    y[i] = 0.996 * 0.5 * (a + b);
  }
  const fade = Math.floor(rate * 0.5);
  for (let i = 0; i < fade; i++) y[length - fade + i] *= 1 - i / fade;
  return buffer;
}

function buildArpa(ctx, out) {
  const dry = gain(ctx, 1);
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.38;
  const feedback = gain(ctx, 0.3);
  const damp = filter(ctx, 'lowpass', 3000);
  chain(dry, out);
  chain(dry, delay, damp, feedback, delay);
  chain(damp, gain(ctx, 0.3), out);
  const buffers = new Map();
  const pluck = (f) => {
    if (!buffers.has(f)) buffers.set(f, pluckBuffer(ctx, f));
    return buffers.get(f);
  };
  let step = 0;
  let next = null;
  return {
    nodes: [],
    schedule(from, to) {
      if (next === null) next = from;
      for (; next < to; next += ARPA_STEP_S) {
        const chord = ARPA_CHORDS[Math.floor(step / ARPA_PATTERN.length) % ARPA_CHORDS.length];
        const index = ARPA_PATTERN[step % ARPA_PATTERN.length];
        step++;
        const src = ctx.createBufferSource();
        src.buffer = pluck(chord[index]);
        const level = (index === 0 ? 0.3 : 0.2) + Math.random() * 0.06;
        chain(src, gain(ctx, level), dry);
        src.start(next + Math.random() * 0.04);
      }
    },
  };
}

const CHORDS = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [87.31, 110.0, 130.81, 164.81],
  [98.0, 123.47, 146.83, 164.81],
];
const BREATH_CYCLE_S = 10;

function buildAcordes(ctx, out) {
  const tone = filter(ctx, 'lowpass', 1600);
  chain(tone, out);
  let index = 0;
  let next = null;
  return {
    nodes: [],
    schedule(from, to) {
      if (next === null) next = from;
      for (; next < to; next += BREATH_CYCLE_S) {
        const t = next;
        const notes = CHORDS[index++ % CHORDS.length];
        const env = gain(ctx, 0);
        chain(env, tone);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(0.16, t + 4);
        env.gain.linearRampToValueAtTime(0.06, t + 10);
        env.gain.linearRampToValueAtTime(0.0001, t + 11.5);
        for (const f of notes) {
          for (const [type, detune, level] of [['sine', -4, 0.5], ['triangle', 5, 0.18]]) {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = f;
            osc.detune.value = detune;
            chain(osc, gain(ctx, level), env);
            osc.start(t);
            osc.stop(t + 11.6);
          }
        }
      }
    },
  };
}

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

function buildCampanas(ctx, out) {
  const dry = gain(ctx, 1);
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.45;
  const feedback = gain(ctx, 0.35);
  const wet = gain(ctx, 0.4);
  const damp = filter(ctx, 'lowpass', 2500);
  chain(dry, out);
  chain(dry, delay, damp, feedback, delay);
  chain(damp, wet, out);
  const pad = gain(ctx, 0.05);
  chain(pad, filter(ctx, 'lowpass', 900), out);
  const drones = [130.81, 196.0].map((f) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    osc.connect(pad);
    osc.start();
    return osc;
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  chain(lfo, gain(ctx, 0.02), pad.gain);
  lfo.start();
  let next = 0;
  return {
    nodes: [...drones, lfo],
    schedule(from, to) {
      if (next < from) next = from + 0.2;
      while (next < to) {
        const t = next;
        const f = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        const env = gain(ctx, 0);
        chain(env, dry);
        const peak = 0.14 + Math.random() * 0.06;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(peak, t + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
        for (const [ratio, level] of [[1, 1], [2, 0.25], [3, 0.08]]) {
          const osc = ctx.createOscillator();
          osc.frequency.value = f * ratio;
          chain(osc, gain(ctx, level), env);
          osc.start(t);
          osc.stop(t + 3.7);
        }
        next += 1.0 + Math.random() * 1.6;
      }
    },
  };
}

const BUILDERS = { cabina: buildCabina, arpa: buildArpa, acordes: buildAcordes, campanas: buildCampanas };

function masterChain(ctx, destination) {
  const level = gain(ctx, 0.8);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 6;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  chain(level, comp, destination);
  return level;
}

export async function renderTrack(id, seconds, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(1, Math.floor(sampleRate * seconds), sampleRate);
  const fade = gain(ctx, 0);
  chain(fade, masterChain(ctx, ctx.destination));
  fade.gain.setValueAtTime(0, 0);
  fade.gain.linearRampToValueAtTime(1, 1.5);
  const track = BUILDERS[id](ctx, fade);
  track.schedule(0, seconds);
  return ctx.startRendering();
}

export function createEngine() {
  let ctx = null;
  let master = null;
  let current = null;

  function ensureContext() {
    if (!ctx) {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      ctx = new AudioContext();
      master = masterChain(ctx, ctx.destination);
    }
    return ctx;
  }

  function stop(fadeSeconds = 1) {
    if (!current) return;
    const { fade, track, timer } = current;
    current = null;
    clearInterval(timer);
    const now = ctx.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    setTimeout(() => {
      for (const n of track.nodes) {
        try { n.stop(); } catch { }
      }
      fade.disconnect();
    }, fadeSeconds * 1000 + 100);
  }

  async function play(id) {
    ensureContext();
    await ctx.resume();
    stop(0.6);
    const fade = gain(ctx, 0);
    fade.connect(master);
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + 1.5);
    const track = BUILDERS[id](ctx, fade);
    let scheduledUntil = now;
    const tick = () => {
      const until = ctx.currentTime + LOOKAHEAD_S;
      track.schedule(scheduledUntil, until);
      scheduledUntil = until;
    };
    tick();
    current = { id, fade, track, timer: setInterval(tick, TICK_MS) };
  }

  function chime(frequency = 528) {
    ensureContext();
    ctx.resume();
    const t = ctx.currentTime + 0.02;
    const env = gain(ctx, 0);
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    chain(osc, env, master);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.12, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.start(t);
    osc.stop(t + 1.3);
  }

  return {
    play,
    stop,
    chime,
    unlock() {
      ensureContext();
      return ctx.resume();
    },
    setVolume(value) {
      ensureContext();
      master.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
    },
    get playing() { return current ? current.id : null; },
  };
}
