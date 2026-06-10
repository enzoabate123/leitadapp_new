<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import UserAvatar from './UserAvatar.vue';
import { API_URL } from '../../utils/api';


const props = defineProps({
  username: String,
  userTag: String,
  userId: String,
  avatarUrl: String,
  bannerUrl: String,
  bannerPositionY: String,
  profileTextColor: String,
  customTags: Array,
  isEditingProfile: Boolean,
  totalKm: Number,
  totalHours: Number,
  displayedPoints: Number,
  tripsCount: Number,
  totalPassengers: Number,
  longestTripKm: Number,
  highlightedAchievementsData: Array,
  getFullUrl: Function,
  longestTrip: Object,
  isOwnProfile: {
    type: Boolean,
    default: true
  },
  bio: String
});

const emit = defineEmits([
  'trigger-avatar-upload',
  'trigger-banner-upload',
  'start-banner-drag',
  'open-add-tag-modal',
  'edit-tag',
  'delete-tag',
  'open-highlights-modal',
  'select-trophy',
  'handle-trophy-hover',
  'reset-trophy-hover',
  'toggle-editing-profile',
  'update-text-color',
  'go-back-to-own-profile',
  'edit-bio'
]);

const profileMapContainer = ref(null);
const profileMap = ref(null);
let routeLine = null;
let startMarker = null;
let endMarker = null;

import { DEFAULT_COORDS } from '../../utils/geo';

async function renderLongestTripRoute() {
  await nextTick();
  if (!props.longestTrip || !profileMapContainer.value) return;

  if (profileMap.value) {
    profileMap.value.remove();
    profileMap.value = null;
  }

  await nextTick();

  profileMap.value = L.map(profileMapContainer.value, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    touchZoom: false,
    keyboard: false
  }).setView(DEFAULT_COORDS, 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(profileMap.value);

  const { startLat, startLon, endLat, endLon, routeCoords } = props.longestTrip;

  if (startLat == null || startLon == null || endLat == null || endLon == null) return;

  const startCoords = [startLat, startLon];
  const endCoords = [endLat, endLon];

  // Draw start and end markers
  const startIcon = L.divIcon({
    className: 'profile-route-marker start',
    html: '<div style="font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🟢</div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  const endIcon = L.divIcon({
    className: 'profile-route-marker end',
    html: '<div style="font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🏁</div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  startMarker = L.marker(startCoords, { icon: startIcon }).addTo(profileMap.value);
  endMarker = L.marker(endCoords, { icon: endIcon }).addTo(profileMap.value);

  let pathPoints = [startCoords, endCoords];
  if (routeCoords) {
    try {
      pathPoints = typeof routeCoords === 'string' ? JSON.parse(routeCoords) : routeCoords;
    } catch (e) {
      console.error('Error parsing routeCoords in ProfileTab:', e);
    }
  }

  routeLine = L.polyline(pathPoints, {
    color: '#ef4444',
    weight: 4,
    dashArray: '5, 5'
  }).addTo(profileMap.value);

  profileMap.value.fitBounds(pathPoints, { padding: [20, 20] });
}
function getRarityColor(glowColor) {
  const colorMap = {
    cyan: '#06b6d4',      // ciano/cyan
    emerald: '#10b981',   // esmeralda
    purple: '#a855f7',    // roxo
    gold: '#f59e0b',      // ouro/gold
    yellow: '#eab308',    // amarelo
    rose: '#ec4899',      // rosa/rose
    green: '#22c55e',     // verde
  };
  return colorMap[glowColor] || '#3b82f6'; // fallback to blue
}

function getBadgeStyle(ach) {
  const color = getRarityColor(ach.glowColor);
  const isWinner = ach.firstWinner && String(ach.firstWinner.id) === String(props.userId);
  
  if (isWinner) {
    return {
      border: `2px solid ${color}`,
      background: `linear-gradient(135deg, ${color}15, ${color}28)`,
      boxShadow: `0 4px 12px ${color}30, 0 0 0 1.5px #fbbf24`, // gold ring for first winner
      cursor: 'pointer',
      width: '100%',
      height: '88px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      position: 'relative'
    };
  } else {
    return {
      border: `2px solid ${color}`,
      background: `linear-gradient(135deg, ${color}12, ${color}22)`,
      boxShadow: `0 4px 12px ${color}25`,
      cursor: 'pointer',
      width: '100%',
      height: '88px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      position: 'relative'
    };
  }
}

onMounted(() => {
  renderLongestTripRoute();
});

watch(() => props.longestTrip, () => {
  renderLongestTripRoute();
}, { deep: true });

onUnmounted(() => {
  if (profileMap.value) {
    profileMap.value.remove();
    profileMap.value = null;
  }
});

const showTripsModal = ref(false);
const tripsList = ref([]);
const isLoadingTrips = ref(false);

async function openTripsModal() {
  showTripsModal.value = true;
  isLoadingTrips.value = true;
  tripsList.value = [];
  try {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/users/${props.userId}/trips`, { headers });
    if (!res.ok) throw new Error('Falha ao buscar viagens');
    tripsList.value = await res.json();
  } catch (err) {
    console.error('Error fetching user trips:', err);
  } finally {
    isLoadingTrips.value = false;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>

<template>
  <div style="position: relative; height: 100%; display: flex; flex-direction: column;">
    <!-- Banner & Profile Identity (covers the top 33% of the glass container) -->
    <div 
      class="profile-banner-container" 
      style="position: relative; height: 33%; min-height: 180px; margin-top: -28px; margin-left: -28px; margin-right: -28px; border-radius: 36px 36px 0 0; overflow: hidden; display: flex; align-items: flex-end; justify-content: flex-start; padding: 20px; background-size: cover; background-position: center;"
      :style="bannerUrl ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.85) 100%), url(${getFullUrl(bannerUrl)})`, backgroundPositionY: bannerPositionY } : { backgroundColor: '#475569', backgroundImage: 'linear-gradient(135deg, #1e293b, #475569)' }"
    >
      <!-- Banner edit overlay (only when editing) -->
      <div 
        v-if="isEditingProfile" 
        @mousedown="$emit('start-banner-drag', $event)"
        class="banner-drag-overlay"
        style="position: absolute; inset: 0; border: 2px dashed #9333ea; border-radius: 36px 36px 0 0; color: #ffffff; cursor: ns-resize; z-index: 2; transition: background 0.2s;"
      >
        <div style="position: absolute; top: 16px; left: 50%; transform: translateX(-50%); pointer-events: none; font-weight: 800; font-size: 13px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;">
          ↕️ Clique e arraste em qualquer área livre para reposicionar
        </div>
        <button @click.stop="$emit('trigger-banner-upload')" class="banner-upload-btn" style="position: absolute; top: 12px; right: 64px; cursor: pointer; pointer-events: auto; background: #9333ea; border: none; padding: 6px 12px; border-radius: 8px; font-weight: 700; color: white; box-shadow: 0 2px 8px rgba(147, 51, 234, 0.4);">
          🖼️ Mudar Imagem
        </button>
      </div>

      <!-- Avatar & Name placed in the bottom-left corner of the banner -->
      <div class="profile-identity" style="position: relative; z-index: 3; align-items: flex-end; gap: 16px;">
        <div class="avatar-wrapper" :style="isEditingProfile ? { cursor: 'pointer' } : {}" @click="isEditingProfile ? $emit('trigger-avatar-upload') : null">
          <UserAvatar 
            :avatar-url="avatarUrl" 
            :get-full-url="getFullUrl" 
            size="84px" 
            border-radius="24px" 
            icon-size="40px" 
            :is-editable="isEditingProfile"
            style="box-shadow: 0 4px 10px rgba(0,0,0,0.3);"
          />
        </div>

        <!-- Details Container (semi-transparent black overlay box) -->
        <div class="profile-details-box" style="background: rgba(0, 0, 0, 0.45); padding: 8px 12px; border-radius: 12px; backdrop-filter: blur(8px); display: flex; flex-direction: column; gap: 4px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 2px;">
          <div class="username-row" style="margin: 0;">
            <h1 :style="{ color: profileTextColor || '#ffffff' }" style="font-size: 18px; font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,0.5); margin: 0; line-height: 1.2;">{{ username }}</h1>
          </div>
          <div class="id-badge-row" style="color: rgba(255,255,255,0.85); font-size: 10px; margin: 0; display: flex; gap: 6px; align-items: center; line-height: 1;">
            <span class="id-badge" style="background: rgba(255,255,255,0.2); padding: 1px 5px; border-radius: 4px;">ID: {{ userId }}</span>
          </div>
          <div class="profile-tags-wrapper" style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 2px;">
            <div 
              v-for="(tag, idx) in customTags" 
              :key="idx" 
              :style="{ backgroundColor: tag.color + '25', color: tag.color, borderColor: tag.color + '60', cursor: isEditingProfile ? 'pointer' : 'default' }"
              style="padding: 2px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; border: 1.1px solid; display: flex; align-items: center; gap: 4px; transition: all 0.2s;"
              @click="isEditingProfile ? $emit('edit-tag', idx) : null"
            >
              <span>{{ tag.text }}</span>
              <span v-if="isEditingProfile" @click.stop="$emit('delete-tag', idx)" style="cursor: pointer; font-size: 9px; background: rgba(0,0,0,0.2); border-radius: 50%; width: 11px; height: 11px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-left: 2px;">×</span>
            </div>
            <button v-if="isEditingProfile" @click="$emit('open-add-tag-modal')" style="padding: 2px 6px; border-radius: 8px; font-size: 9px; font-weight: bold; text-transform: uppercase; border: 1.5px dashed #9333ea; color: #9333ea; background: transparent; cursor: pointer; line-height: 1;">
              ➕ Tag
            </button>
          </div>
          <!-- Text Color picker when editing -->
          <div v-if="isEditingProfile" style="margin-top: 4px; display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 10px; font-weight: 600; color: #ffffff;">Cor do Texto:</label>
            <input type="color" :value="profileTextColor" @change="$emit('update-text-color', $event.target.value)" style="width: 20px; height: 20px; border: none; background: none; cursor: pointer; padding: 0;" />
          </div>
        </div>
      </div>
      <!-- Simple edit profile cog button in top right corner of the banner -->
      <button 
        v-if="isOwnProfile"
        @click.stop="$emit('toggle-editing-profile')" 
        :title="isEditingProfile ? 'Salvar Perfil' : 'Editar Perfil'"
        :style="{ background: isEditingProfile ? '#10b981' : 'rgba(255,255,255,0.25)', border: isEditingProfile ? '1.5px solid #10b981' : '1.5px solid rgba(255,255,255,0.45)' }"
        style="position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border-radius: 50%; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(8px); z-index: 10; transition: all 0.25s; box-shadow: 0 4px 12px rgba(0,0,0,0.15); outline: none;"
        class="banner-btn"
      >
        <span v-if="isEditingProfile" style="line-height: 1;">💾</span>
        <span v-else class="cog-icon" style="line-height: 1;">⚙️</span>
      </button>
      <button 
        v-else
        @click.stop="$emit('go-back-to-own-profile')" 
        title="Voltar ao meu Perfil"
        style="position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border-radius: 50%; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(8px); z-index: 10; transition: all 0.25s; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1.5px solid rgba(255,255,255,0.45); background: rgba(255,255,255,0.25); outline: none;"
        class="banner-btn"
      >
        🔙
      </button>
    </div>

    <div style="flex: 1; padding: 12px; display: flex; flex-direction: column; overflow-y: auto; gap: 12px;">
      <!-- Two Columns Layout: Map (Left) + Achievements & Stats (Right) -->
      <div style="display: flex; gap: 16px; align-items: flex-start; margin-top: 4px; flex-wrap: wrap;">
        <!-- Left Column: Map (Wide) -->
        <div style="flex: 1.4; display: flex; flex-direction: column; gap: 8px; min-width: 300px;">
          <h3 style="font-size: 11px; font-weight: 800; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
            🗺️ Rota da Maior Viagem
          </h3>
          <div v-if="longestTrip" style="position: relative; border-radius: 20px; overflow: hidden; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 4px 20px rgba(0,0,0,0.06); background: #f8fafc; display: flex; flex-direction: column;">
            <!-- Map container (Reduced height, aspect ratio 1.8 / 1 for better fit, non-interactive) -->
            <div ref="profileMapContainer" style="width: 100%; aspect-ratio: 1.8 / 1; min-height: 170px; z-index: 1; pointer-events: none;"></div>
          </div>
          <div v-else style="aspect-ratio: 1.8 / 1; min-height: 170px; text-align: center; border-radius: 20px; border: 1.5px dashed rgba(0,0,0,0.08); background: rgba(0,0,0,0.02); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 12px;">
            <span style="font-size: 20px;">📭</span>
            <p style="font-size: 10px; color: #94a3b8; font-weight: 600; margin: 0; line-height: 1.2;">Nenhuma corrida registrada.</p>
          </div>

          <!-- Biografia -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="font-size: 11px; font-weight: 800; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
                📖 Biografia
              </h3>
              <button v-if="isOwnProfile" style="font-size: 10px; color: #9333ea; border: none; background: none; cursor: pointer; font-weight: 700; padding: 0;" @click="$emit('edit-bio')">
                ✏️ Editar
              </button>
            </div>
            <div class="bio-box" style="padding: 12px; background: rgba(255, 255, 255, 0.45); border: 1px solid rgba(0,0,0,0.05); border-radius: 20px;">
              <p class="bio-text" style="color: #475569; font-style: italic; font-size: 12px; margin: 0; line-height: 1.4;">
                "{{ bio || 'Sem biografia disponível.' }}"
              </p>
            </div>
          </div>
        </div>

        <!-- Right Column: Achievements & Stats -->
        <div style="flex: 1.1; display: flex; flex-direction: column; gap: 12px; min-width: 280px;">
          <!-- Achievements Section -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="font-size: 11px; font-weight: 800; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
                🏆 Conquistas em Destaque
              </h3>
              <button v-if="isEditingProfile" style="font-size: 10px; color: #9333ea; border: none; background: none; cursor: pointer; font-weight: 700; padding: 0;" @click="$emit('open-highlights-modal')">
                ✏️ Editar
              </button>
            </div>
            
            <div style="padding: 10px; background: rgba(255,255,255,0.4); border: 1px solid rgba(0,0,0,0.05); border-radius: 20px; display: flex; align-items: center; justify-content: center; min-height: 100px; box-sizing: border-box; width: 100%;">
              <div class="badge-list" v-if="highlightedAchievementsData.length > 0" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%;">
                <div 
                  class="badge-item" 
                  v-for="ach in highlightedAchievementsData" 
                  :key="ach.id" 
                  @click="$emit('select-trophy', ach)"
                  @mousemove="$emit('handle-trophy-hover', $event)"
                  @mouseleave="$emit('reset-trophy-hover', $event)"
                  :style="getBadgeStyle(ach)"
                >
                  <div :style="{ color: getRarityColor(ach.glowColor) }" style="font-size: 2.1rem; position: relative; pointer-events: none; display: flex; align-items: center; justify-content: center;">
                    <span v-if="ach.firstWinner && String(ach.firstWinner.id) === String(userId)" style="position: absolute; top: -8px; right: -8px; font-size: 11px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); z-index: 2;">👑</span>
                    {{ ach.emoji || '🏆' }}
                  </div>
                </div>
              </div>
              <div v-else style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 100%;">
                <span style="font-size: 20px; color: #cbd5e1;">🏆</span>
                <p style="font-size: 11px; color: #94a3b8; font-style: italic; margin: 0; text-align: center;">Nenhum destaque selecionado.</p>
              </div>
            </div>
          </div>

          <!-- Statistics Section -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <h3 style="font-size: 11px; font-weight: 800; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; padding-left: 4px;">
              📊 Estatísticas Gerais
            </h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
              <!-- Km -->
              <div class="metric-card" style="min-width: 0; padding: 8px 4px;">
                <div class="metric-card-icon bg-blue-100" style="color: #2563eb;">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2;"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ totalKm.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">km</span></p>
                <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Distância</span>
              </div>
              <!-- Hours -->
              <div class="metric-card" style="min-width: 0; padding: 8px 4px;">
                <div class="metric-card-icon bg-emerald-100" style="color: #059669;">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ totalHours.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">h</span></p>
                <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Tempo</span>
              </div>
              <!-- Points -->
              <div class="metric-card" style="min-width: 0; padding: 8px 4px;">
                <div class="metric-card-icon bg-orange-100" style="color: #ea580c;">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ displayedPoints.toLocaleString('pt-BR') }}</p>
                <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Pontos</span>
              </div>
              <!-- Trips Count -->
              <div class="metric-card" style="min-width: 0; padding: 8px 4px; cursor: pointer;" @click="openTripsModal">
                <div class="metric-card-icon bg-purple-100" style="color: #7c3aed;">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                    <path d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M21 16V10a2 2 0 00-2-2h-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ tripsCount }}</p>
                <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Viagens</span>
              </div>
              <!-- Total Passengers -->
              <div class="metric-card" style="min-width: 0; padding: 8px 4px;">
                <div class="metric-card-icon bg-indigo-100" style="color: #4f46e5;">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ totalPassengers.toLocaleString('pt-BR') }}</p>
                <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Caronas</span>
              </div>
              <!-- Longest Trip -->
              <div class="metric-card" style="min-width: 0; padding: 8px 4px;">
                <div class="metric-card-icon bg-red-100" style="color: #dc2626;">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ longestTripKm.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">km</span></p>
                <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Maior Viagem</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal de Viagens -->
  <transition name="modal-fade">
    <div v-if="showTripsModal" class="trips-modal-overlay" @click.self="showTripsModal = false">
      <div class="trips-modal-card">
        <button class="trips-modal-close" @click="showTripsModal = false">✕</button>
        
        <h3 class="trips-modal-title">
          {{ isOwnProfile ? 'Suas Viagens' : `Viagens de ${username}` }}
        </h3>
        
        <div v-if="isLoadingTrips" class="trips-modal-loading">
          <div class="spinner"></div>
          <span>Carregando histórico...</span>
        </div>
        
        <div v-else-if="tripsList.length === 0" class="trips-modal-empty">
          <span class="empty-icon">🚗</span>
          <p>Nenhuma viagem registrada.</p>
        </div>
        
        <div v-else class="trips-modal-body">
          <div v-for="trip in tripsList" :key="trip.id" class="trip-item-card">
            <div class="trip-item-header">
              <span class="trip-item-name">{{ trip.name || `Corrida #${trip.id}` }}</span>
              <span class="trip-item-date">{{ formatDate(trip.createdAt) }}</span>
            </div>
            
            <div class="trip-item-route">
              <div class="route-node">
                <span class="node-bullet green">🟢</span>
                <div class="node-details">
                  <span class="node-label">Origem</span>
                  <span class="node-val">{{ trip.startLocation || 'Não informada' }}</span>
                </div>
              </div>
              
              <div v-if="trip.waypoints && trip.waypoints.length > 0" class="route-waypoints">
                <div v-for="(wp, wIdx) in trip.waypoints" :key="wIdx" class="route-node waypoint">
                  <span class="node-bullet orange">🟠</span>
                  <div class="node-details">
                    <span class="node-label">Parada {{ wIdx + 1 }}</span>
                    <span class="node-val">{{ wp }}</span>
                  </div>
                </div>
              </div>
              
              <div class="route-node">
                <span class="node-bullet red">🏁</span>
                <div class="node-details">
                  <span class="node-label">Destino</span>
                  <span class="node-val">{{ trip.endLocation || 'Não informado' }}</span>
                </div>
              </div>
            </div>
            
            <div class="trip-item-footer">
              <div class="participant-info">
                <span class="participant-title">Motorista:</span>
                <span class="participant-name">👤 {{ trip.driver }}</span>
              </div>
              <div v-if="trip.passengers && trip.passengers.length > 0" class="participant-info">
                <span class="participant-title">Caronas:</span>
                <div class="participant-names">
                  <span v-for="passenger in trip.passengers" :key="passenger" class="passenger-tag">
                    👤 {{ passenger }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.banner-drag-overlay {
  background: rgba(147, 51, 234, 0.15);
}
.banner-drag-overlay:hover {
  background: rgba(147, 51, 234, 0.25) !important;
}
.banner-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 16px rgba(0,0,0,0.25) !important;
}

/* Modal de Histórico de Viagens */
.trips-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
}
.trips-modal-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  color: #1e293b;
  border-radius: 28px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  padding: 28px 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.trips-modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  border: none;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #475569;
  transition: all 0.2s;
}
.trips-modal-close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #0f172a;
}
.trips-modal-title {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 20px 0;
  text-align: center;
}
.trips-modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 0;
  font-weight: 600;
  color: #64748b;
  font-size: 13px;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(147, 51, 234, 0.1);
  border-top-color: #9333ea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.trips-modal-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: #94a3b8;
}
.empty-icon {
  font-size: 32px;
}
.trips-modal-empty p {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.trips-modal-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
}
.trips-modal-body::-webkit-scrollbar {
  width: 6px;
}
.trips-modal-body::-webkit-scrollbar-track {
  background: transparent;
}
.trips-modal-body::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.1);
  border-radius: 3px;
}
.trips-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0,0,0,0.2);
}
.trip-item-card {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
}
.trip-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.trip-item-name {
  font-weight: 800;
  font-size: 14px;
  color: #0f172a;
}
.trip-item-date {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
  white-space: nowrap;
}
.trip-item-route {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 4px;
  border-left: 2px dashed #cbd5e1;
  margin-left: 8px;
}
.route-node {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  position: relative;
  margin-left: -9px;
}
.route-node.waypoint {
  margin-top: 2px;
  margin-bottom: 2px;
}
.node-bullet {
  font-size: 12px;
  line-height: 1;
  background: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.node-details {
  display: flex;
  flex-direction: column;
  text-align: left;
}
.node-label {
  font-size: 8px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1;
  margin-bottom: 2px;
}
.node-val {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  line-height: 1.2;
}
.trip-item-footer {
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.participant-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.participant-title {
  font-weight: 700;
  color: #64748b;
  min-width: 65px;
  text-align: left;
}
.participant-name {
  font-weight: 600;
  color: #334155;
}
.participant-names {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.passenger-tag {
  background: rgba(15, 23, 42, 0.05);
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 600;
  color: #475569;
  font-size: 10px;
}

/* Modal Fade Transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
