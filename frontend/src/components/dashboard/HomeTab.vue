<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RankingRow from './RankingRow.vue';

const props = defineProps({
  tripActive: Boolean,
  activeTrip: Object,
  currentStreetName: String,
  remainingEtaMinutes: [Number, String],
  remainingDistanceKm: [Number, String],
  userRole: String,
  tripDistance: Number,
  isPlaying: Boolean,
  currentSong: String,
  currentArtist: String,
  passengers: Array,
  activeRankingList: Array,
  userId: [String, Number],
  tripStartTime: [Number, String],
  getFullUrl: Function,
  carLocation: Object
});

const emit = defineEmits([
  'open-start-trip-modal',
  'end-trip',
  'show-qr-code',
  'toggle-play',
  'open-public-profile'
]);

function getPassengerLiveStatus(pass) {
  if (!props.tripActive || !props.tripStartTime) return pass.status || '⚡ 0 Pontos';
  const elapsedSec = Math.max(0, Math.floor((Date.now() - props.tripStartTime) / 1000));
  const tripPoints = elapsedSec + Math.round(props.tripDistance * 1000);
  return `⚡ ${tripPoints} Pontos`;
}

const mapContainer = ref(null);
const map = ref(null);
let carMarker = null;
let departureMarker = null;
let destinationMarker = null;
let routeLine = null;
let stopMarkers = [];
let resizeObserver = null;

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getPointAlongPath(coords, distanceKm) {
  if (!coords || coords.length === 0) return null;
  if (coords.length === 1) return coords[0];
  
  let remainingDistance = distanceKm;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const segDist = calculateDistance(p1[0], p1[1], p2[0], p2[1]);
    
    if (remainingDistance <= segDist) {
      if (segDist === 0) return p1;
      const ratio = remainingDistance / segDist;
      const lat = p1[0] + (p2[0] - p1[0]) * ratio;
      const lon = p1[1] + (p2[1] - p1[1]) * ratio;
      return [lat, lon];
    }
    remainingDistance -= segDist;
  }
  return coords[coords.length - 1];
}

function updateCarMarkerPosition(startLat, startLon, endLat, endLon, currentDistance, routeCoords = []) {
  if (!map.value || !carMarker) return;

  let lat = startLat;
  let lon = startLon;

  if (props.activeTrip && props.activeTrip.currentLat != null && props.activeTrip.currentLon != null) {
    lat = props.activeTrip.currentLat;
    lon = props.activeTrip.currentLon;
  } else if (routeCoords && routeCoords.length > 0) {
    const point = getPointAlongPath(routeCoords, currentDistance);
    if (point) {
      lat = point[0];
      lon = point[1];
    }
  } else {
    const totalDist = calculateDistance(startLat, startLon, endLat, endLon);
    if (totalDist > 0) {
      const pct = Math.min(1, currentDistance / totalDist);
      lat = startLat + (endLat - startLat) * pct;
      lon = startLon + (endLon - startLon) * pct;
    }
  }

  carMarker.setLatLng([lat, lon]);
  
  if (props.activeTrip && props.activeTrip.currentLat != null && props.activeTrip.currentLon != null) {
    map.value.panTo([lat, lon]);
  }
}

function updateMapRoute(startLat, startLon, endLat, endLon, currentDistance, routeCoords = [], keypoints = []) {
  if (!map.value) return;

  if (departureMarker) map.value.removeLayer(departureMarker);
  if (destinationMarker) map.value.removeLayer(destinationMarker);
  if (routeLine) map.value.removeLayer(routeLine);
  
  if (stopMarkers && stopMarkers.length > 0) {
    stopMarkers.forEach(m => map.value.removeLayer(m));
  }
  stopMarkers = [];

  const startIcon = L.divIcon({
    className: 'custom-route-marker start',
    html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🟢</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const endIcon = L.divIcon({
    className: 'custom-route-marker end',
    html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); font-weight: bold;">🏁</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const stopIcon = L.divIcon({
    className: 'custom-route-marker stop',
    html: '<div style="font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">📍</div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  departureMarker = L.marker([startLat, startLon], { icon: startIcon }).addTo(map.value);
  destinationMarker = L.marker([endLat, endLon], { icon: endIcon }).addTo(map.value);

  if (keypoints && keypoints.length > 2) {
    for (let i = 1; i < keypoints.length - 1; i++) {
      const kp = keypoints[i];
      const m = L.marker([kp[0], kp[1]], { icon: stopIcon }).addTo(map.value);
      stopMarkers.push(m);
    }
  }

  const pathPoints = routeCoords && routeCoords.length > 0
    ? routeCoords
    : [[startLat, startLon], [endLat, endLon]];

  routeLine = L.polyline(pathPoints, {
    color: '#3b82f6',
    weight: 4,
    dashArray: '5, 10'
  }).addTo(map.value);

  map.value.fitBounds(pathPoints, { padding: [50, 50] });

  updateCarMarkerPosition(startLat, startLon, endLat, endLon, currentDistance, routeCoords);
}

import { DEFAULT_COORDS } from '../../utils/geo';

function resetMap() {
  if (!map.value) return;

  if (departureMarker) { map.value.removeLayer(departureMarker); departureMarker = null; }
  if (destinationMarker) { map.value.removeLayer(destinationMarker); destinationMarker = null; }
  if (routeLine) { map.value.removeLayer(routeLine); routeLine = null; }

  if (stopMarkers && stopMarkers.length > 0) {
    stopMarkers.forEach(m => map.value.removeLayer(m));
  }
  stopMarkers = [];

  const initialCoords = (props.carLocation && props.carLocation.lat != null && props.carLocation.lon != null)
    ? [props.carLocation.lat, props.carLocation.lon]
    : DEFAULT_COORDS;

  if (carMarker) {
    carMarker.setLatLng(initialCoords);
  }

  map.value.setView(initialCoords, 15);
}



let lastStartLat = null;
let lastStartLon = null;
let lastEndLat = null;
let lastEndLon = null;
let lastKeypointsStr = '';

// Watchers for trip states to update Leaflet layers reactively
watch(() => props.activeTrip, (newTrip) => {
  if (newTrip) {
    const keypointsStr = JSON.stringify(newTrip.keypoints || []);
    if (
      newTrip.startLat !== lastStartLat || 
      newTrip.startLon !== lastStartLon || 
      newTrip.endLat !== lastEndLat || 
      newTrip.endLon !== lastEndLon || 
      keypointsStr !== lastKeypointsStr
    ) {
      lastStartLat = newTrip.startLat;
      lastStartLon = newTrip.startLon;
      lastEndLat = newTrip.endLat;
      lastEndLon = newTrip.endLon;
      lastKeypointsStr = keypointsStr;
      updateMapRoute(
        newTrip.startLat, 
        newTrip.startLon, 
        newTrip.endLat, 
        newTrip.endLon, 
        props.tripDistance, 
        newTrip.routeCoords || [], 
        newTrip.keypoints || []
      );
    } else {
      updateCarMarkerPosition(
        newTrip.startLat,
        newTrip.startLon,
        newTrip.endLat,
        newTrip.endLon,
        props.tripDistance,
        newTrip.routeCoords || []
      );
    }
  } else {
    lastStartLat = null;
    lastStartLon = null;
    lastEndLat = null;
    lastEndLon = null;
    lastKeypointsStr = '';
    resetMap();
  }
}, { deep: true });

watch(() => props.tripDistance, (newDist) => {
  if (props.activeTrip) {
    updateCarMarkerPosition(
      props.activeTrip.startLat,
      props.activeTrip.startLon,
      props.activeTrip.endLat,
      props.activeTrip.endLon,
      newDist,
      props.activeTrip.routeCoords || []
    );
  }
});

watch(() => props.carLocation, (newLoc) => {
  if (!props.tripActive && newLoc && newLoc.lat != null && newLoc.lon != null) {
    if (carMarker) {
      carMarker.setLatLng([newLoc.lat, newLoc.lon]);
      map.value.panTo([newLoc.lat, newLoc.lon]);
    }
  }
}, { deep: true });

onMounted(() => {
  if (mapContainer.value && !map.value) {
    const initialCoords = (props.carLocation && props.carLocation.lat != null && props.carLocation.lon != null)
      ? [props.carLocation.lat, props.carLocation.lon]
      : DEFAULT_COORDS;

    map.value = L.map(mapContainer.value, {
      zoomControl: false,
      attributionControl: false
    }).setView(initialCoords, 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map.value);

    const carIcon = L.divIcon({
      className: 'custom-map-marker',
      html: '<div style="font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8)); transform: translate(-14px, -14px);">🏎️</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    carMarker = L.marker(initialCoords, { icon: carIcon }).addTo(map.value);

    resizeObserver = new ResizeObserver(() => {
      if (map.value) {
        map.value.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainer.value);
  }

  // Draw route on mount if already active
  if (props.activeTrip) {
    updateMapRoute(
      props.activeTrip.startLat,
      props.activeTrip.startLon,
      props.activeTrip.endLat,
      props.activeTrip.endLon,
      props.tripDistance,
      props.activeTrip.routeCoords || [],
      props.activeTrip.keypoints || []
    );
  }
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (map.value) {
    map.value.remove();
    map.value = null;
  }
});
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <!-- Grid do Dashboard -->
    <div :class="['home-dashboard-grid', { 'has-active-trip': tripActive }]">
      <!-- 1. MAPA -->
      <div class="grid-item item-map">
        <div ref="mapContainer" class="map-container"></div>
        
        <!-- Floating street/ETA overlay -->
        <div v-if="tripActive && activeTrip" class="map-overlay">
          <div class="map-street">{{ currentStreetName }}</div>
          <div class="map-eta">Restam: {{ remainingEtaMinutes }} min • {{ remainingDistanceKm }} km</div>
        </div>

        <!-- Active Trip Route Overlay (for all users when active) -->
        <div v-if="activeTrip" class="map-route-overlay">
          <span class="route-label">🚀 CORRIDA ATIVA</span>
          <span class="route-path">{{ activeTrip.departure || 'Origem' }} ➔ {{ activeTrip.destination || 'Destino' }}</span>
        </div>

        <!-- Premium Floating Start/Stop Button (Admin only) -->
        <div v-if="userRole === 'admin'" class="map-floating-bottom">
          <button v-if="!tripActive" @click="$emit('open-start-trip-modal')" class="trip-btn start premium-floating-btn">
            <span class="btn-icon">▶</span> Iniciar Corrida
          </button>
          <button v-else @click="$emit('end-trip')" class="trip-btn stop premium-floating-btn">
            <span class="btn-icon">■</span> Parar ({{ tripDistance.toFixed(2) }}km)
          </button>
        </div>

        <!-- Premium Floating QR Code Widget Button (Admin only, visible when trip active) -->
        <div v-if="userRole === 'admin' && tripActive" class="map-floating-qr-widget">
          <button @click="$emit('show-qr-code')" class="qr-widget-btn" title="Exibir QR Code da Corrida">
            📱 QR
          </button>
        </div>
      </div>

      <!-- Passageiros Atuais (Quando Viagem Ativa) -->
      <div v-if="tripActive" class="grid-item item-current-passengers" style="justify-content: flex-start; overflow: hidden;">
        <span class="widget-label">PASSAGEIROS ATUAIS</span>
        <div class="passengers-list no-scroll" style="flex: 1; overflow-y: auto; margin-top: 4px;">
          <div v-for="pass in passengers" :key="pass.name" class="passenger-row" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 12px; background: rgba(0, 0, 0, 0.02); border: 1px solid rgba(0, 0, 0, 0.04); margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
              <div class="passenger-avatar" style="font-size: 14px;">👤</div>
              <div class="passenger-details">
                <p class="passenger-name" style="margin: 0; font-size: 11px; font-weight: 700; color: #334155;">{{ pass.name }}</p>
                <p class="passenger-role" style="margin: 0; font-size: 8px; color: #94a3b8; font-weight: 500;">{{ pass.role }}</p>
              </div>
            </div>
            <span class="passenger-status" style="font-size: 9px; font-weight: 700; color: #10b981;">{{ getPassengerLiveStatus(pass) }}</span>
          </div>
        </div>
      </div>

      <!-- 5. RANKING -->
      <div class="grid-item item-ranking" style="justify-content: flex-start; overflow: hidden; padding-bottom: 8px;">
        <span class="widget-label">RANKING DE CORRIDAS</span>
        <div class="ranking-layout no-scroll" style="flex: 1; overflow-y: auto; margin-top: 4px;">
          <RankingRow 
            v-for="rank in activeRankingList" 
            :key="rank.userId" 
            :rank="rank"
            :get-full-url="getFullUrl"
            :is-compact="true"
            @open-public-profile="$emit('open-public-profile', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
