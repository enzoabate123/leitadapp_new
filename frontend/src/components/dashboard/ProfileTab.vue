<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  }
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
  'go-back-to-own-profile'
]);

const profileMapContainer = ref(null);
const profileMap = ref(null);
let routeLine = null;
let startMarker = null;
let endMarker = null;

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
  }).setView([-23.55052, -46.633308], 12);

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
function getBadgeStyle(ach) {
  const isWinner = ach.firstWinner && String(ach.firstWinner.id) === String(props.userId);
  if (isWinner) {
    return {
      border: '1.5px solid #fbbf24',
      background: 'linear-gradient(to bottom, #fffbeb, #fef3c7)',
      boxShadow: '0 4px 12px rgba(251, 191, 36, 0.15)',
      cursor: 'pointer',
      width: '100%',
      height: '88px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px'
    };
  } else {
    return {
      cursor: 'pointer',
      width: '100%',
      height: '88px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      border: '1px solid rgba(0,0,0,0.05)',
      background: 'rgba(255,255,255,0.7)'
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
</script>

<template>
  <div style="position: relative; height: 100%; display: flex; flex-direction: column;">
    <!-- Banner & Profile Identity (covers the top 33% of the glass container) -->
    <div class="profile-banner-container" style="position: relative; height: 33%; min-height: 180px; margin-top: -28px; margin-left: -28px; margin-right: -28px; border-radius: 36px 36px 0 0; overflow: hidden; display: flex; align-items: flex-end; justify-content: flex-start; padding: 20px;">
      <!-- Profile Banner Background -->
      <div 
        v-if="bannerUrl" 
        style="position: absolute; inset: 0; background-size: cover; z-index: 0; pointer-events: none;"
        :style="{ backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.85) 100%), url(${getFullUrl(bannerUrl)})`, backgroundPositionX: 'center', backgroundPositionY: bannerPositionY }"
      ></div>

      <!-- Banner edit overlay (only when editing) -->
      <div 
        v-if="isEditingProfile" 
        @mousedown="$emit('start-banner-drag', $event)"
        style="position: absolute; inset: 0; background: rgba(147, 51, 234, 0.15); border: 2px dashed #9333ea; border-radius: 36px 36px 0 0; color: #ffffff; cursor: ns-resize; z-index: 2; transition: background 0.2s;"
        onmouseover="this.style.background='rgba(147, 51, 234, 0.25)'"
        onmouseout="this.style.background='rgba(147, 51, 234, 0.15)'"
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
          <div class="avatar-box" style="position: relative; overflow: hidden; border: none; border-radius: 24px; width: 84px; height: 84px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); background: #f1f5f9;">
            <img v-if="avatarUrl" :src="getFullUrl(avatarUrl)" style="width: 100%; height: 100%; object-fit: cover;" />
            <svg v-else fill="currentColor" viewBox="0 0 24 24" style="width: 40px; height: 40px; color: #94a3b8;">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
            <div v-if="isEditingProfile" style="position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">
              <span>📷</span>
              <span>Alterar</span>
            </div>
          </div>
        </div>

        <!-- Details Container (semi-transparent black overlay box) -->
        <div style="background: rgba(0, 0, 0, 0.45); padding: 8px 12px; border-radius: 12px; backdrop-filter: blur(8px); display: flex; flex-direction: column; gap: 4px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 2px;">
          <div class="username-row" style="margin: 0;">
            <h1 :style="{ color: profileTextColor || '#ffffff' }" style="font-size: 18px; font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,0.5); margin: 0; line-height: 1.2;">{{ username }}#{{ userTag }}</h1>
          </div>
          <div class="id-badge-row" style="color: rgba(255,255,255,0.85); font-size: 10px; margin: 0; display: flex; gap: 6px; align-items: center; line-height: 1;">
            <span class="id-badge" style="background: rgba(255,255,255,0.2); padding: 1px 5px; border-radius: 4px;">ID: {{ userId }}</span>
            <span>•</span>
            <span>Out 2023</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 2px;">
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
        onmouseover="this.style.transform='scale(1.08)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.25)';"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)';"
      >
        <span v-if="isEditingProfile" style="line-height: 1;">💾</span>
        <span v-else class="cog-icon" style="line-height: 1;">⚙️</span>
      </button>
      <button 
        v-else
        @click.stop="$emit('go-back-to-own-profile')" 
        title="Voltar ao meu Perfil"
        style="position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border-radius: 50%; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(8px); z-index: 10; transition: all 0.25s; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1.5px solid rgba(255,255,255,0.45); background: rgba(255,255,255,0.25); outline: none;"
        onmouseover="this.style.transform='scale(1.08)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.25)';"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)';"
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
                  <div :style="{ color: ach.glowColor || '#eab308' }" style="font-size: 2.1rem; position: relative; pointer-events: none; display: flex; align-items: center; justify-content: center;">
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
              <div class="metric-card" style="min-width: 0; padding: 8px 4px;">
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
</template>
