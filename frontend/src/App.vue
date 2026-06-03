<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue';
import { sfxHover, sfxClick } from './sounds';

const API_URL = (() => {
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
    return `${protocol}//${hostname}:3003`;
  }
  return `${protocol}//api-${hostname}`;
})();

const activeTrack = ref(null);
const isPlaying = ref(false);
const audioRef = ref(null);
const musicVolume = ref(parseFloat(localStorage.getItem('musicVolume') ?? '0.3'));
const isExpanded = ref(false);

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
    const res = await fetch(`${API_URL}/api/music/active`);
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
      } else if (!activeTrack.value || activeTrack.value.id !== track.id) {
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
  } catch (err) {
    console.error("Error fetching active music:", err);
  }
};

const togglePlay = () => {
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

const handleUserInteraction = () => {
  if (isPlaying.value && audioRef.value && audioRef.value.paused) {
    audioRef.value.play().catch(err => console.log("Bypass play failed:", err));
  }
};

const showMusicWidget = ref(localStorage.getItem('showMusicWidget') !== 'false');

const musicX = ref(parseFloat(localStorage.getItem('appMusicX') || '0'));
const musicY = ref(parseFloat(localStorage.getItem('appMusicY') || '0'));
const isDraggingMusic = ref(false);
const hasMoved = ref(false);
let startX = 0;
let startY = 0;
let initialX = 0;
let initialY = 0;

function onMusicDragStart(e) {
  if (e.target.closest('button') || e.target.closest('a')) return;
  
  isDraggingMusic.value = true;
  hasMoved.value = false;
  
  const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
  
  startX = clientX;
  startY = clientY;
  initialX = musicX.value;
  initialY = musicY.value;
  
  window.addEventListener(e.type.startsWith('touch') ? 'touchmove' : 'mousemove', onMusicDragMove, { passive: false });
  window.addEventListener(e.type.startsWith('touch') ? 'touchend' : 'mouseup', onMusicDragEnd);
  
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
  
  musicX.value = initialX + deltaX;
  musicY.value = initialY + deltaY;
  
  if (e.cancelable) {
    e.preventDefault();
  }
}

function onMusicDragEnd(e) {
  isDraggingMusic.value = false;
  localStorage.setItem('appMusicX', String(musicX.value));
  localStorage.setItem('appMusicY', String(musicY.value));
  
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
  const selector = 'button, .sidebar-nav-item, select, .btn-xp, a, .nav-item, .tab-btn, .start-btn';
  document.body.addEventListener('mouseenter', (e) => {
    if (e.target.matches && (e.target.matches(selector) || e.target.closest(selector))) {
      sfxHover();
    }
  }, true);

  // Global click SFX on all buttons
  document.body.addEventListener('click', (e) => {
    if (e.target.matches && (e.target.matches('button, .btn-xp, .sidebar-nav-item') || e.target.closest('button, .btn-xp, .sidebar-nav-item'))) {
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
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
  document.body.removeEventListener('click', handleUserInteraction);
  document.body.removeEventListener('touchstart', handleUserInteraction);
  window.removeEventListener('volume-change', handleVolumeChange);
  window.removeEventListener('music-widget-toggle', handleMusicToggleEvent);
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
        <audio ref="audioRef" loop></audio>
        <div class="widget-content">
          <div 
            class="cover-art" 
            :class="{ rotating: isPlaying }"
            :style="activeTrack.coverUrl ? { backgroundImage: `url(${API_URL}${activeTrack.coverUrl})` } : {}"
          >
            <div v-if="!activeTrack.coverUrl" class="cover-fallback">🎵</div>
          </div>
          <div class="track-info">
            <div class="track-status">{{ isPlaying ? 'TOCANDO' : 'PAUSADO' }}</div>
            <div class="track-title" :title="activeTrack.title">{{ activeTrack.title }}</div>
          </div>
          <button class="control-btn" @click.stop="togglePlay" :title="isPlaying ? 'Pausar' : 'Tocar'">
            <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
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
