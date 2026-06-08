<script setup>
import { onMounted, onUnmounted, ref, nextTick, watch, computed } from 'vue';
import { sfxHover, sfxClick } from './sounds';

import { API_URL } from './utils/api';
import { initAdminLocationService } from './utils/adminLocationService';

const activeTrack = ref(null);
const isPlaying = ref(false);
const audioRef = ref(null);
const musicVolume = ref(parseFloat(localStorage.getItem('musicVolume') ?? '0.3'));
const isExpanded = ref(false);

const isDriver = ref(!!localStorage.getItem('token'));

const applyMusicVolume = () => {
  if (!audioRef.value) return;
  if (musicVolume.value < 0.01) {
    audioRef.value.volume = 0;
    audioRef.value.muted = true;
  } else {
    audioRef.value.muted = false;
    audioRef.value.volume = musicVolume.value * 0.5; // Scale max volume to 50%
  }
};

const handleVolumeChange = (e) => {
  if (e.detail && e.detail.type === 'music') {
    musicVolume.value = e.detail.value;
    applyMusicVolume();
  }
};

const fetchActiveTrack = async () => {
  try {
    const token = localStorage.getItem('token');
    isDriver.value = !!token;
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}/api/music/active`, { headers });
    if (res.ok) {
      const track = await res.json();
      if (!track) {
        if (activeTrack.value) {
          activeTrack.value = null;
          isPlaying.value = false;
          if (audioRef.value) {
            audioRef.value.pause();
            audioRef.value.src = '';
          }
        }
      } else {
        if (track.isSpotify) {
          if (audioRef.value && !audioRef.value.paused) {
            audioRef.value.pause();
          }
          activeTrack.value = track;
          isPlaying.value = track.isPlaying;
        } else {
          if (!activeTrack.value || activeTrack.value.id !== track.id || activeTrack.value.isSpotify) {
            const wasPlaying = activeTrack.value ? isPlaying.value : true;
            activeTrack.value = track;
            nextTick(() => {
              if (audioRef.value) {
                audioRef.value.src = `${API_URL}${track.audioUrl}`;
                applyMusicVolume();
                audioRef.value.load();
                if (wasPlaying) {
                  isPlaying.value = true;
                  audioRef.value.play().catch(err => {
                    console.log("Autoplay blocked, waiting for interaction:", err);
                  });
                } else {
                  isPlaying.value = false;
                }
              }
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Error fetching active music:", err);
  }
};

const togglePlay = async () => {
  if (activeTrack.value && activeTrack.value.isSpotify) {
    try {
      const headers = {};
      const token = localStorage.getItem('token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['Content-Type'] = 'application/json';
      }
      const action = isPlaying.value ? 'pause' : 'play';
      const res = await fetch(`${API_URL}/api/music/toggle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        isPlaying.value = !isPlaying.value;
        setTimeout(fetchActiveTrack, 500);
      }
    } catch (err) {
      console.error("Error toggling Spotify playback:", err);
    }
    return;
  }

  if (!audioRef.value) return;
  if (isPlaying.value) {
    audioRef.value.pause();
    isPlaying.value = false;
  } else {
    audioRef.value.play().then(() => {
      isPlaying.value = true;
    }).catch(err => {
      console.log("Play failed:", err);
    });
  }
};

const playNext = async () => {
  try {
    const headers = {};
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/api/music/next`, { method: 'POST', headers });
    if (res.ok) {
      const nextTrack = await res.json();
      if (activeTrack.value && nextTrack && activeTrack.value.id === nextTrack.id) {
        // Same track! Just restart it
        if (audioRef.value) {
          audioRef.value.currentTime = 0;
          audioRef.value.play().catch(err => console.log("Replay failed:", err));
        }
      } else {
        await fetchActiveTrack();
      }
    }
  } catch (err) {
    console.error("Error skipping music:", err);
  }
};

const playPrev = async () => {
  try {
    const headers = {};
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/api/music/prev`, { method: 'POST', headers });
    if (res.ok) {
      const prevTrack = await res.json();
      if (activeTrack.value && prevTrack && activeTrack.value.id === prevTrack.id) {
        if (audioRef.value) {
          audioRef.value.currentTime = 0;
          audioRef.value.play().catch(err => console.log("Replay failed:", err));
        }
      } else {
        await fetchActiveTrack();
      }
    }
  } catch (err) {
    console.error("Error backing music:", err);
  }
};

const handleAudioEnded = () => {
  if (activeTrack.value && activeTrack.value.autoplay) {
    playNext();
  }
};

const handleUserInteraction = () => {
  if (isPlaying.value && audioRef.value && audioRef.value.paused) {
    audioRef.value.play().catch(err => console.log("Bypass play failed:", err));
  }
};

const showMusicWidget = ref(localStorage.getItem('showMusicWidget') !== 'false');

watch(showMusicWidget, (newVal) => {
  if (newVal) {
    activeTrack.value = null;
    nextTick(() => {
      fetchActiveTrack();
    });
  } else {
    isPlaying.value = false;
    if (audioRef.value) {
      audioRef.value.pause();
      audioRef.value.src = '';
    }
  }
});

const musicX = ref(parseFloat(localStorage.getItem('appMusicX') || '0'));
const musicY = ref(parseFloat(localStorage.getItem('appMusicY') || '0'));
const isDraggingMusic = ref(false);
const hasMoved = ref(false);

let targetX = musicX.value;
let targetY = musicY.value;
let currentX = musicX.value;
let currentY = musicY.value;
let vx = 0;
let vy = 0;
let startX = 0;
let startY = 0;
let initialX = 0;
let initialY = 0;
let animationFrameId = null;

const STIFFNESS = 0.08;
const DAMPING = 0.72;

function clampToScreen() {
  const widgetWidth = isExpanded.value ? 280 : 64;
  const widgetHeight = 64;
  const padding = 10;
  
  const minX = -20 + padding;
  const maxX = window.innerWidth - 20 - widgetWidth - padding;
  const minY = -(window.innerHeight - 20 - widgetHeight) + padding;
  const maxY = 20 - padding;
  
  if (targetX < minX) targetX = minX;
  if (targetX > maxX) targetX = maxX;
  if (targetY < minY) targetY = minY;
  if (targetY > maxY) targetY = maxY;
  
  currentX = targetX;
  currentY = targetY;
  musicX.value = currentX;
  musicY.value = currentY;
}

function updateSpring() {
  const widgetWidth = isExpanded.value ? 280 : 64;
  const widgetHeight = 64;
  const padding = 10;
  
  const minX = -20 + padding;
  const maxX = window.innerWidth - 20 - widgetWidth - padding;
  const minY = -(window.innerHeight - 20 - widgetHeight) + padding;
  const maxY = 20 - padding;

  const ax = (targetX - currentX) * STIFFNESS;
  const ay = (targetY - currentY) * STIFFNESS;
  
  vx = (vx + ax) * DAMPING;
  vy = (vy + ay) * DAMPING;
  
  currentX += vx;
  currentY += vy;
  
  // Boundary check and bounce
  if (currentX < minX) {
    currentX = minX;
    vx = -vx * 0.5;
    targetX = minX;
  } else if (currentX > maxX) {
    currentX = maxX;
    vx = -vx * 0.5;
    targetX = maxX;
  }
  
  if (currentY < minY) {
    currentY = minY;
    vy = -vy * 0.5;
    targetY = minY;
  } else if (currentY > maxY) {
    currentY = maxY;
    vy = -vy * 0.5;
    targetY = maxY;
  }
  
  musicX.value = currentX;
  musicY.value = currentY;
  
  if (!isDraggingMusic.value && Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01 && Math.abs(currentX - targetX) < 0.01 && Math.abs(currentY - targetY) < 0.01) {
    currentX = targetX;
    currentY = targetY;
    musicX.value = currentX;
    musicY.value = currentY;
    vx = 0;
    vy = 0;
    animationFrameId = null;
    localStorage.setItem('appMusicX', String(targetX));
    localStorage.setItem('appMusicY', String(targetY));
    return;
  }
  
  animationFrameId = requestAnimationFrame(updateSpring);
}

function startSpringLoop() {
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(updateSpring);
  }
}

function onMusicDragStart(e) {
  if (e.target.closest('button') || e.target.closest('a')) return;
  
  isDraggingMusic.value = true;
  hasMoved.value = false;
  
  const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
  
  startX = clientX;
  startY = clientY;
  initialX = targetX;
  initialY = targetY;
  
  window.addEventListener(e.type.startsWith('touch') ? 'touchmove' : 'mousemove', onMusicDragMove, { passive: false });
  window.addEventListener(e.type.startsWith('touch') ? 'touchend' : 'mouseup', onMusicDragEnd);
  
  startSpringLoop();
  
  if (!e.type.startsWith('touch')) {
    e.preventDefault();
  }
}

function onMusicDragMove(e) {
  if (!isDraggingMusic.value) return;
  
  const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
  
  const deltaX = clientX - startX;
  const deltaY = clientY - startY;
  
  if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
    hasMoved.value = true;
  }
  
  let newTargetX = initialX + deltaX;
  let newTargetY = initialY + deltaY;
  
  // Constraint checks during drag move
  const widgetWidth = isExpanded.value ? 280 : 64;
  const widgetHeight = 64;
  const padding = 10;
  
  const minX = -20 + padding;
  const maxX = window.innerWidth - 20 - widgetWidth - padding;
  const minY = -(window.innerHeight - 20 - widgetHeight) + padding;
  const maxY = 20 - padding;
  
  if (newTargetX < minX) newTargetX = minX;
  if (newTargetX > maxX) newTargetX = maxX;
  if (newTargetY < minY) newTargetY = minY;
  if (newTargetY > maxY) newTargetY = maxY;
  
  targetX = newTargetX;
  targetY = newTargetY;
  
  startSpringLoop();
  
  if (e.cancelable) {
    e.preventDefault();
  }
}

function onMusicDragEnd(e) {
  isDraggingMusic.value = false;
  localStorage.setItem('appMusicX', String(targetX));
  localStorage.setItem('appMusicY', String(targetY));
  
  window.removeEventListener('mousemove', onMusicDragMove);
  window.removeEventListener('mouseup', onMusicDragEnd);
  window.removeEventListener('touchmove', onMusicDragMove);
  window.removeEventListener('touchend', onMusicDragEnd);
}

function handleWidgetClick(e) {
  if (hasMoved.value) {
    hasMoved.value = false;
    return;
  }
  isExpanded.value = !isExpanded.value;
}

const handleMusicToggleEvent = (e) => {
  showMusicWidget.value = e.detail;
};

let pollInterval = null;

onMounted(async () => {
  await nextTick();

  // Global hover SFX on all buttons/interactive elements
  const hoverSelector = 'button, .sidebar-nav-item, select, .btn-xp, a, .nav-item, .tab-btn, .start-btn, .settings-row, .ranking-row, .activity-row, .toggle, .preset-item, .trophy-close, .control-btn, .premium-floating-btn, .qr-widget-btn, .music-btn-compact, .suggestion-item, .ach-card';
  document.body.addEventListener('mouseenter', (e) => {
    if (e.target.matches && (e.target.matches(hoverSelector) || e.target.closest(hoverSelector))) {
      sfxHover();
    }
  }, true);

  // Global click SFX on all buttons
  const clickSelector = 'button, .btn-xp, .sidebar-nav-item, .nav-item, .tab-btn, .start-btn, select, a, .settings-row, .ranking-row, .activity-row, .toggle, .preset-item, .trophy-close, .control-btn, .premium-floating-btn, .qr-widget-btn, .music-btn-compact, .suggestion-item, .ach-card';
  document.body.addEventListener('click', (e) => {
    if (e.target.matches && (e.target.matches(clickSelector) || e.target.closest(clickSelector))) {
      sfxClick();
    }
  }, true);

  // Load active music
  fetchActiveTrack();
  pollInterval = setInterval(fetchActiveTrack, 5000);

  // Event listener to unlock audio autoplay on modern browsers
  document.body.addEventListener('click', handleUserInteraction);
  document.body.addEventListener('touchstart', handleUserInteraction);
  window.addEventListener('volume-change', handleVolumeChange);
  window.addEventListener('music-widget-toggle', handleMusicToggleEvent);
  window.addEventListener('resize', clampToScreen);
  window.addEventListener('spotify-status-change', fetchActiveTrack);
  
  // Watch if expanding pushes it off-screen, pull it back in
  watch(isExpanded, () => {
    nextTick(() => {
      clampToScreen();
      startSpringLoop();
    });
  });
  
  // Run initial clamp in case it was dragged out or screen loaded small
  clampToScreen();

  // Initialize admin location background updates
  initAdminLocationService();
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  document.body.removeEventListener('click', handleUserInteraction);
  document.body.removeEventListener('touchstart', handleUserInteraction);
  window.removeEventListener('volume-change', handleVolumeChange);
  window.removeEventListener('music-widget-toggle', handleMusicToggleEvent);
  window.removeEventListener('resize', clampToScreen);
  window.removeEventListener('spotify-status-change', fetchActiveTrack);
});
</script>

<template>
  <router-view />
  
  <!-- Floating Glassmorphic Music Player Widget -->
  <div 
    class="music-widget-wrapper" 
    :style="{ transform: `translate3d(${musicX}px, ${musicY}px, 0)` }"
  >
    <transition name="fade-music">
      <div 
        v-if="activeTrack && showMusicWidget" 
        class="music-widget" 
        :class="{ expanded: isExpanded, dragging: isDraggingMusic }" 
        @mousedown="onMusicDragStart"
        @touchstart="onMusicDragStart"
        @click="handleWidgetClick"
      >
        <audio ref="audioRef" :loop="!activeTrack?.autoplay" @ended="handleAudioEnded"></audio>
        <div class="widget-content">
          <div 
            class="cover-art" 
            :class="{ rotating: isPlaying && !activeTrack.isSpotify }"
            :style="activeTrack.coverUrl ? { backgroundImage: `url(${activeTrack.coverUrl.startsWith('http') ? activeTrack.coverUrl : API_URL + activeTrack.coverUrl})` } : {}"
          >
            <div v-if="!activeTrack.coverUrl" class="cover-fallback">🎵</div>
          </div>
          <div class="track-info" style="max-width: 120px; overflow: hidden;">
            <div class="track-status">
              <span v-if="activeTrack.isSpotify" style="color: #1db954; font-weight: bold; display: flex; align-items: center; gap: 4px; font-size: 9px;">
                SPOTIFY 🟢 {{ isPlaying ? 'TOCANDO' : 'PAUSADO' }}
              </span>
              <span v-else>{{ isPlaying ? 'TOCANDO' : 'PAUSADO' }}</span>
            </div>
            <div class="track-title" :title="activeTrack.title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: bold;">
              {{ activeTrack.title }}
            </div>
            <div v-if="activeTrack.artist" style="font-size: 9px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;" :title="activeTrack.artist">
              {{ activeTrack.artist }}
            </div>
          </div>
          <div v-if="isDriver" class="control-buttons-group" style="display: flex; align-items: center; gap: 6px;">
            <button v-if="isExpanded" class="control-btn mini-control-btn" @click.stop="playPrev" title="Voltar Música" style="width: 20px; height: 20px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.15); border-radius: 50%;">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width: 10px; height: 10px; pointer-events: none;">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            <button class="control-btn" @click.stop="togglePlay" :title="isPlaying ? 'Pausar' : 'Tocar'">
              <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
            <button v-if="isExpanded" class="control-btn mini-control-btn" @click.stop="playNext" title="Próxima Música" style="width: 20px; height: 20px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.15); border-radius: 50%;">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width: 10px; height: 10px; pointer-events: none;">
                <path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.music-widget-wrapper {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 999999;
  pointer-events: none;
}

.music-widget {
  pointer-events: auto;
  width: 64px;
  height: 64px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 
              inset 0 1px 1px rgba(255, 255, 255, 0.5);
  padding: 11px;
  overflow: hidden;
  user-select: none;
  cursor: grab;
  animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
              padding 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
              background 0.3s, 
              transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), 
              box-shadow 0.3s;
}

.music-widget.dragging {
  cursor: grabbing;
  transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
              padding 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
              background 0.3s, 
              box-shadow 0.3s !important;
}

.music-widget:hover {
  background: rgba(255, 255, 255, 0.35);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2), 
              inset 0 1px 1px rgba(255, 255, 255, 0.6);
}

.music-widget:active:not(.dragging) {
  transform: scale(0.94);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 
              inset 0 1px 1px rgba(255, 255, 255, 0.4);
}

.music-widget.expanded {
  width: 280px;
  padding: 11px 14px;
}

.widget-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 252px;
  flex-shrink: 0;
}

.cover-art {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.8);
}

.cover-fallback {
  font-size: 18px;
}

.rotating {
  animation: spin 12s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.track-info {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.music-widget.expanded .track-info {
  opacity: 1;
  pointer-events: auto;
}

.track-status {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: rgba(99, 102, 241, 0.85);
  margin-bottom: 2px;
}

.track-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.control-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, opacity 0.3s ease;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
}

.music-widget.expanded .control-btn {
  opacity: 1;
  pointer-events: auto;
}

.control-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.5);
  background: linear-gradient(135deg, #4f46e5, #4338ca);
}

.control-btn:active {
  transform: scale(0.95);
}

.control-btn svg {
  width: 18px;
  height: 18px;
}

@keyframes slide-in {
  from {
    transform: translateY(20px) scale(0.95);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* Transição suave do tocador de música */
.fade-music-enter-active {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-music-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-music-enter-from,
.fade-music-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
