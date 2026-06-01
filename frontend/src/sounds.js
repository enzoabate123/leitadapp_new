// ─── Nintendo-Inspired UI Sound Engine (Web Audio API) ──────────────────
// All sounds are procedurally generated — no external audio files needed.
// Inspired by Wii, Switch, and GameCube menu aesthetics.

let audioCtx = null;
let sfxVolumeMultiplier = parseFloat(localStorage.getItem('sfxVolumeMultiplier') ?? '0.5');

export function setSfxVolume(vol) {
  sfxVolumeMultiplier = parseFloat(vol);
  localStorage.setItem('sfxVolumeMultiplier', sfxVolumeMultiplier.toString());
}

export function getSfxVolume() {
  return sfxVolumeMultiplier;
}

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Helper: play a tone with envelope
function playTone({ freq = 440, type = 'sine', duration = 0.08, volume = 0.15, delay = 0, detune = 0 } = {}) {
  const ctx = getCtx();
  const t = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.setValueAtTime(detune, t);

  const finalVolume = volume * sfxVolumeMultiplier;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(finalVolume, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.001 * sfxVolumeMultiplier), t + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.01);
}

// ─── Sound Effects ──────────────────────────────────────────────────────

// Wii-style hover: soft, quick tick
export function sfxHover() {
  playTone({ freq: 1800, type: 'sine', duration: 0.04, volume: 0.06 });
}

// Wii-style click/select: clean two-tone blip
export function sfxClick() {
  playTone({ freq: 1200, type: 'sine', duration: 0.06, volume: 0.12 });
  playTone({ freq: 1600, type: 'sine', duration: 0.08, volume: 0.10, delay: 0.04 });
}

// Switch-style confirm: crisp ascending snap
export function sfxConfirm() {
  playTone({ freq: 800, type: 'triangle', duration: 0.07, volume: 0.13 });
  playTone({ freq: 1200, type: 'triangle', duration: 0.07, volume: 0.11, delay: 0.06 });
  playTone({ freq: 1500, type: 'sine', duration: 0.12, volume: 0.09, delay: 0.11 });
}

// GameCube-style success chime: warm ascending arpeggio
export function sfxSuccess() {
  playTone({ freq: 523, type: 'sine', duration: 0.12, volume: 0.12 });        // C5
  playTone({ freq: 659, type: 'sine', duration: 0.12, volume: 0.11, delay: 0.09 }); // E5
  playTone({ freq: 784, type: 'sine', duration: 0.18, volume: 0.10, delay: 0.18 }); // G5
  playTone({ freq: 1047, type: 'sine', duration: 0.25, volume: 0.09, delay: 0.28 }); // C6
}

// Error/deny: low descending buzz
export function sfxError() {
  playTone({ freq: 300, type: 'square', duration: 0.1, volume: 0.08 });
  playTone({ freq: 220, type: 'square', duration: 0.15, volume: 0.07, delay: 0.08 });
}

// Tab navigation: Switch-style soft pop
export function sfxNavigate() {
  playTone({ freq: 1400, type: 'sine', duration: 0.05, volume: 0.08 });
  playTone({ freq: 1000, type: 'sine', duration: 0.06, volume: 0.06, delay: 0.03 });
}

// Modal open: Wii channel-open swoosh (ascending chord)
export function sfxModalOpen() {
  playTone({ freq: 600, type: 'sine', duration: 0.15, volume: 0.08 });
  playTone({ freq: 900, type: 'sine', duration: 0.15, volume: 0.07, delay: 0.05 });
  playTone({ freq: 1200, type: 'triangle', duration: 0.2, volume: 0.06, delay: 0.1 });
}

// Modal close: quick descending
export function sfxModalClose() {
  playTone({ freq: 1200, type: 'sine', duration: 0.06, volume: 0.07 });
  playTone({ freq: 800, type: 'sine', duration: 0.08, volume: 0.06, delay: 0.04 });
}

// Delete/revoke: GameCube-style warning
export function sfxDelete() {
  playTone({ freq: 400, type: 'triangle', duration: 0.1, volume: 0.1 });
  playTone({ freq: 350, type: 'triangle', duration: 0.1, volume: 0.09, delay: 0.08 });
  playTone({ freq: 250, type: 'sawtooth', duration: 0.15, volume: 0.06, delay: 0.16 });
}

// ─── Auto-attach hover sounds to buttons ─────────────────────────────────
// Call this once after mount to add hover SFX to all interactive elements.

let hoverListenersAttached = false;

export function attachHoverSounds(rootEl) {
  if (hoverListenersAttached) return;
  hoverListenersAttached = true;

  const selector = 'button, .sidebar-nav-item, select, .btn-xp';

  rootEl.addEventListener('mouseenter', (e) => {
    if (e.target.matches(selector) || e.target.closest(selector)) {
      sfxHover();
    }
  }, true);
}

if (typeof window !== 'undefined') {
  window.addEventListener('volume-change', (e) => {
    if (e.detail && e.detail.type === 'sfx') {
      setSfxVolume(e.detail.value);
    }
  });
}

