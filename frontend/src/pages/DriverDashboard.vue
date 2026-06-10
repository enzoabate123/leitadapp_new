<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { io } from 'socket.io-client';
import L from 'leaflet';
import { adminLocation, adminSpeed, triggerAdminTrackingCheck } from '../utils/adminLocationService';
import { sfxSuccess, sfxError, sfxNavigate, sfxModalOpen, sfxModalClose } from '../sounds';

import LoginScreen from '../components/dashboard/LoginScreen.vue';
import HomeTab from '../components/dashboard/HomeTab.vue';
import ProfileTab from '../components/dashboard/ProfileTab.vue';
import EditHighlightsModal from '../components/dashboard/EditHighlightsModal.vue';
import AchievementsTab from '../components/dashboard/AchievementsTab.vue';
import RankingTab from '../components/dashboard/RankingTab.vue';
import SettingsTab from '../components/dashboard/SettingsTab.vue';

// Autenticação e API
import { API_URL } from '../utils/api';
import { safeParse } from '../utils/parse';

function getFullUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

const isAuthenticated = ref(false);
const token = ref(localStorage.getItem('token') || '');
const authMode = ref('login');
const authForm = ref({ username: '', password: '', email: '' });
const authError = ref('');
const userRole = ref('driver');

// Toasts
const toasts = ref([]);
let toastId = 0;
function showToast(msg, type = 'info') {
  const id = ++toastId;
  toasts.value.push({ id, msg });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);

  if (type === 'error' || msg.toLowerCase().includes('erro') || msg.toLowerCase().includes('falha') || msg.toLowerCase().includes('aviso')) {
    sfxError();
  } else if (type === 'success' || msg.includes('🏆') || msg.includes('+') || msg.includes('sucesso') || msg.includes('iniciada') || msg.includes('finalizada') || msg.toLowerCase().includes('salvo com sucesso')) {
    sfxSuccess();
  }
}

async function apiFetch(endpoint, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token.value) headers['Authorization'] = `Bearer ${token.value}`;
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchMe() {
  try {
    const data = await apiFetch('/api/me');
    if (data.error) return false;
    username.value = data.username;
    userId.value = data.id;
    userRole.value = data.role || 'driver';
    email.value = data.email || 'Não informado';
    points.value = data.totalPoints;
    level.value = data.level;
    achievementsCount.value = data.achievementCount;
    totalKm.value = data.totalDistanceKm || 0;
    totalHours.value = data.totalHours || 0;
    longestTripKm.value = data.longestTripKm || 0;
    longestTrip.value = data.longestTrip || null;
    totalPassengers.value = data.totalPassengers || 0;
    tripsCount.value = data.tripsCount || 0;
    bio.value = data.bio || '';
    avatarUrl.value = data.avatarUrl || '';
    bannerUrl.value = data.bannerUrl || '';
    bannerPositionY.value = data.bannerPositionY || '50%';
    profileTextColor.value = data.profileTextColor || '#ffffff';
    customTags.value = safeParse(data.customTags);
    highlightedAchievements.value = safeParse(data.highlightedAchievements);
    if (data.settings) {
      pushNotifications.value = data.settings.pushNotifications;
      pointsAlerts.value = data.settings.pointsAlerts;
      socialRanking.value = data.settings.socialRanking;
      publicProfile.value = data.settings.publicProfile;
      spotifyConnected.value = !!data.settings.spotifyConnected;
      
      if (data.settings.bgType) {
        appBgType.value = data.settings.bgType;
        localStorage.setItem('app-background', data.settings.bgType);
      }
      if (data.settings.customBgUrl !== undefined) {
        appCustomBgUrl.value = data.settings.customBgUrl;
        localStorage.setItem('app-background-custom', data.settings.customBgUrl);
      }
      applyBackground(appBgType.value, appCustomBgUrl.value);
    }
    fetchCustomLocations();
    return true;
  } catch (e) {
    return false;
  }
}

async function handleAuth(eventData) {
  try {
    authError.value = '';
    if (eventData) {
      authMode.value = eventData.mode;
      authForm.value = eventData.form;
    }
    const endpoint = authMode.value === 'login' ? '/api/login' : '/api/register';
    const payload = { username: authForm.value.username, password: authForm.value.password };
    if (authMode.value === 'register') payload.email = authForm.value.email;
    
    const data = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    token.value = data.token;
    localStorage.setItem('token', data.token);
    
    const success = await fetchMe();
    if (success) {
      isAuthenticated.value = true;
      await nextTick();
      initDashboard();
    }
  } catch (e) {
    try {
      const err = JSON.parse(e.message);
      authError.value = err.error || 'Erro na autenticação';
    } catch {
      authError.value = 'Erro na autenticação';
    }
  }
}

let previousUserRank = null;

async function fetchRanking() {
  try {
    const data = await apiFetch('/api/ranking');
    rankingList.value = data.map(d => ({ 
      pos: d.rank, 
      userId: d.userId,
      name: d.username, 
      pts: d.totalPoints,
      avatarUrl: d.avatarUrl,
      customTags: safeParse(d.customTags),
      tripsCount: d.tripsCount,
      totalDistance: d.totalDistance,
      active: d.userId === userId.value 
    }));

    // Detect rank changes for the logged in user
    const userRankObj = rankingList.value.find(r => r.userId === userId.value);
    if (userRankObj) {
      const currentRank = userRankObj.pos;
      if (previousUserRank !== null && previousUserRank !== currentRank) {
        if (socialRanking.value) {
          const improved = previousUserRank > currentRank; // e.g. 5º to 3º
          if (improved) {
            showToast(`📈 Subiu no Ranking! Você agora está em ${currentRank}º lugar!`, 'success');
          } else {
            showToast(`📉 Caiu no Ranking! Você agora está em ${currentRank}º lugar!`, 'info');
          }
        }
      }
      previousUserRank = currentRank;
    }
  } catch (e) {
    console.error(e);
  }
}

async function fetchAchievements() {
  try {
    const data = await apiFetch('/api/achievements');
    achievementsList.value = data;
    totalAchievements.value = data.length;
  } catch (e) {
    console.error(e);
  }
}

async function fetchAllUsers() {
  try {
    const data = await apiFetch('/api/passengers');
    allUsers.value = data;
  } catch (e) {
    console.error('Falha ao buscar usuários:', e);
  }
}


// Simulação e Tracking de Viagem
const tripActive = ref(false);
const tripStartTime = ref(0);
const tripDistance = ref(0);
let tripInterval = null;
let geolocationWatchId = null;

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste navegador'));
      return;
    }
    // Tenta obter com alta precisão primeiro
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        console.warn('Alta precisão falhou, tentando precisão padrão (Wi-Fi/Células)...', err);
        // Fallback para precisão padrão (evita erros em iPads Wi-Fi ou locais fechados)
        navigator.geolocation.getCurrentPosition(
          (posFallback) => resolve(posFallback),
          (errFallback) => reject(err),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 3000 }
        );
      },
      { enableHighAccuracy: true, timeout: 4000 }
    );
  });
}

function startTracking(useDeviceLocation) {
  if (tripInterval) clearInterval(tripInterval);
  if (geolocationWatchId != null) {
    navigator.geolocation.clearWatch(geolocationWatchId);
    geolocationWatchId = null;
  }
  
  if (useDeviceLocation && navigator.geolocation && userRole.value !== 'admin') {
    geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const speedMs = position.coords.speed;
        if (speedMs != null) {
          speed.value = Math.round(speedMs * 3.6);
          rpm.value = Math.round(1500 + speed.value * 20);
        }
        if (activeTrip.value) {
          activeTrip.value.currentLat = lat;
          activeTrip.value.currentLon = lon;
        }
        if (socket && socket.connected) {
          socket.emit('update-trip', {
            distanceKm: Number(tripDistance.value.toFixed(2)),
            speed: speed.value,
            rpm: rpm.value,
            battery: battery.value,
            currentLat: lat,
            currentLon: lon
          });
        }
      },
      (err) => {
        console.error('Erro de tracking de geolocalização:', err);
      },
      { enableHighAccuracy: false, maximumAge: 3000, timeout: 10000 }
    );
  }

  tripInterval = setInterval(() => {
    tripDistance.value += (speed.value / 3600);
    if (socket && socket.connected) {
      socket.emit('update-trip', {
        distanceKm: Number(tripDistance.value.toFixed(2)),
        speed: speed.value,
        rpm: rpm.value,
        battery: battery.value,
        currentLat: activeTrip.value ? activeTrip.value.currentLat : null,
        currentLon: activeTrip.value ? activeTrip.value.currentLon : null
      });
    }
  }, 1000);
}

function stopTracking() {
  if (tripInterval) {
    clearInterval(tripInterval);
    tripInterval = null;
  }
  if (geolocationWatchId != null) {
    navigator.geolocation.clearWatch(geolocationWatchId);
    geolocationWatchId = null;
  }
}

// Watch global admin location updates from the service and apply locally
watch(adminLocation, (newLoc) => {
  if (newLoc && newLoc.lat != null && newLoc.lon != null) {
    carLocation.value = newLoc;
    
    // Update active trip current location if we are in a trip
    if (tripActive.value && activeTrip.value) {
      activeTrip.value.currentLat = newLoc.lat;
      activeTrip.value.currentLon = newLoc.lon;
    }
  }
}, { deep: true });

watch(adminSpeed, (newSpeed) => {
  if (tripActive.value && activeTrip.value) {
    speed.value = newSpeed;
    rpm.value = Math.round(1500 + newSpeed * 20);
  }
});

function toggleTrip() {
  if (tripActive.value) {
    endTrip();
  } else {
    startTrip();
  }
}

function startTrip() {
  if (socket && socket.connected) {
    socket.emit('start-trip', {
      passengers: passengers.value
    });
  }
  tripActive.value = true;
  tripStartTime.value = Date.now();
  tripDistance.value = 0;
  startTracking(false);
}

async function endTrip() {
  tripActive.value = false;
  stopTracking();
  const durationMs = Date.now() - tripStartTime.value;
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  const durationSec = Math.round(durationMs / 1000);
  
  // Use OSRM calculated distance if available and larger than GPS recorded distance
  let distKm = Number(tripDistance.value.toFixed(2));
  if (activeTrip.value && activeTrip.value.routeDistanceKm && activeTrip.value.routeDistanceKm > 0) {
    distKm = Math.max(distKm, activeTrip.value.routeDistanceKm);
  }
  
  const tripPayload = {
    distanceKm: distKm,
    durationMin,
    durationSec,
    avgSpeed: speed.value,
    passengerCount: passengers.value.length,
    passengers: passengers.value.map(p => p.name),
    startLocation: startTripForm.value.departure || (activeTrip.value ? activeTrip.value.departure : null),
    endLocation: startTripForm.value.destination || (activeTrip.value ? activeTrip.value.destination : null),
    startLat: activeTrip.value ? activeTrip.value.startLat : null,
    startLon: activeTrip.value ? activeTrip.value.startLon : null,
    endLat: activeTrip.value ? activeTrip.value.endLat : null,
    endLon: activeTrip.value ? activeTrip.value.endLon : null,
    routeCoords: activeTrip.value ? JSON.stringify(activeTrip.value.routeCoords) : null
  };

  if (!navigator.onLine) {
    queueOfflineTrip(tripPayload);
    showToast('Sem conexão com a internet. Corrida salva offline!');
    if (socket && socket.connected) {
      socket.emit('end-trip');
    }
    activeTrip.value = null;
    return;
  }

  try {
    const data = await apiFetch('/api/trips', {
      method: 'POST',
      body: JSON.stringify(tripPayload)
    });
    
    if (pointsAlerts.value) {
      showToast(`Viagem finalizada! +${data.pointsGenerated} Pontos`);
    }
    
    if (socket && socket.connected) {
      socket.emit('end-trip');
    }
    
    activeTrip.value = null;
    await fetchMe();
    if (activePage.value === 'achievements') fetchAchievements();
    if (activePage.value === 'home' || activePage.value === 'ranking') fetchRanking();
  } catch (e) {
    console.error('Failed to post trip online, queuing offline:', e);
    queueOfflineTrip(tripPayload);
    showToast('Erro de rede. Corrida salva offline!');
    if (socket && socket.connected) {
      socket.emit('end-trip');
    }
    activeTrip.value = null;
  }
}

const activePage = ref('home');
const showPublicProfile = ref(false);
const publicProfileData = ref(null);
const isLoadingProfile = ref(false);

async function openPublicProfile(uid) {
  isLoadingProfile.value = true;
  showPublicProfile.value = true;
  try {
    const data = await apiFetch(`/api/users/${uid}/profile`);
    if (data.error) throw new Error(data.error);
    publicProfileData.value = data;
    publicProfileData.value.customTags = safeParse(data.customTags);
    publicProfileData.value.highlightedAchievements = safeParse(data.highlightedAchievements);
  } catch (err) {
    showToast('Erro ao carregar perfil');
    showPublicProfile.value = false;
  } finally {
    isLoadingProfile.value = false;
  }
}

function closePublicProfile() {
  showPublicProfile.value = false;
  publicProfileData.value = null;
}

const publicProfileMapContainer = ref(null);
let publicProfileMap = null;
let publicProfileRouteLine = null;
let publicProfileStartMarker = null;
let publicProfileEndMarker = null;

async function renderPublicProfileMap(longestTrip) {
  await nextTick();
  if (!longestTrip || !publicProfileMapContainer.value) return;

  if (publicProfileMap) {
    publicProfileMap.remove();
    publicProfileMap = null;
  }

  await nextTick();

  publicProfileMap = L.map(publicProfileMapContainer.value, {
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
  }).addTo(publicProfileMap);

  const { startLat, startLon, endLat, endLon, routeCoords } = longestTrip;
  
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

  publicProfileStartMarker = L.marker(startCoords, { icon: startIcon }).addTo(publicProfileMap);
  publicProfileEndMarker = L.marker(endCoords, { icon: endIcon }).addTo(publicProfileMap);

  let pathPoints = [startCoords, endCoords];
  if (routeCoords) {
    pathPoints = safeParse(routeCoords, [startCoords, endCoords]);
  }

  publicProfileRouteLine = L.polyline(pathPoints, {
    color: '#ef4444',
    weight: 4,
    dashArray: '5, 5'
  }).addTo(publicProfileMap);

  publicProfileMap.fitBounds(pathPoints, { padding: [20, 20] });
}

watch(() => publicProfileData.value, async (newData) => {
  if (newData && newData.longestTrip) {
    await nextTick();
    renderPublicProfileMap(newData.longestTrip);
  } else {
    if (publicProfileMap) {
      publicProfileMap.remove();
      publicProfileMap = null;
    }
  }
}, { deep: true });



// Estado da Conexão WebSocket
const socketStatus = ref('Conectando...');
const lastPing = ref('-');

// Dados do Usuário
const username = ref('Carregando...');
const userTag = ref('0000');
const userId = ref('');
const email = ref('');
const points = ref(0);
const level = ref(1);

// Estatísticas do Usuário
const totalKm = ref(0);
const totalHours = ref(0);
const longestTripKm = ref(0);
const longestTrip = ref(null);
const totalPassengers = ref(0);
const tripsCount = ref(0);
const achievementsCount = ref(0);
const totalAchievements = ref(15);
const achievementsList = ref([]);

// Telemetria do Veículo
const speed = ref(0);
const rpm = ref(0);
const battery = ref(100);

// Dados do Tocador de Música (Admin sets this)
const currentSong = ref('Midnight City');
const currentArtist = ref('M83');
const isPlaying = ref(false);

// Passageiros
const passengers = ref([
  { name: 'Marina', role: 'Co-piloto', status: '⚡ 120 Pontos' },
  { name: 'Enzo', role: 'Traseiro Esq.', status: '💤 Silencioso' }
]);

// Ranking
const rankingList = ref([]);
const allUsers = ref([]);
const activeTrip = ref(null);
const isSyncingOffline = ref(false);

const activeSuggestions = ref({ field: null, index: null, list: [] });
let searchTimeout = null;

const newModalPassenger = ref({ name: '', role: '' });

const carLocation = ref({ lat: null, lon: null });

const availableUsersForPassengers = computed(() => {
  const list = allUsers.value.length > 0
    ? allUsers.value
    : rankingList.value.map(r => ({ id: r.userId, username: r.name, avatarUrl: r.avatarUrl }));

  const query = (newModalPassenger.value.name || '').toLowerCase().trim();

  return list
    .filter(u => u.username !== username.value)
    .filter(u => !query || u.username.toLowerCase().includes(query))
    .map(u => ({
      userId: u.id,
      name: u.username,
      avatarUrl: u.avatarUrl
    }));
});

const showUserSelectMenu = ref(false);
const userSelectContainer = ref(null);

const showQrCodeModal = ref(false);
const qrCodeJoinUrl = computed(() => `${window.location.origin}?joinTrip=${userId.value}`);

function copyJoinLink() {
  navigator.clipboard.writeText(qrCodeJoinUrl.value);
  showToast('Link de convite copiado!');
}

const showSeatSelectionModal = ref(false);
const selectedSeat = ref('Co-piloto 🧭');
const pendingJoinTripDriverId = ref(null);

function closeSeatSelection() {
  showSeatSelectionModal.value = false;
  const url = new URL(window.location);
  url.searchParams.delete('joinTrip');
  window.history.replaceState({}, document.title, url);
}

function confirmSeatSelection() {
  if (!pendingJoinTripDriverId.value) return;

  if (socket && socket.connected) {
    socket.emit('passenger-join-trip', {
      driverId: Number(pendingJoinTripDriverId.value),
      seat: selectedSeat.value,
      username: username.value
    });
  }

  showToast(`Pedido de entrada enviado como ${selectedSeat.value}!`);
  showSeatSelectionModal.value = false;

  const url = new URL(window.location);
  url.searchParams.delete('joinTrip');
  window.history.replaceState({}, document.title, url);
}

function handleAddressInput(query, field, index = null) {
  if (searchTimeout) clearTimeout(searchTimeout);
  
  if (!query || query.trim().length < 3) {
    activeSuggestions.value = { field: null, index: null, list: [] };
    return;
  }

  // 1. Filter local custom locations
  const normalizedQuery = query.toLowerCase().trim();
  const matchedCustom = customLocationsList.value.filter(loc => 
    loc.name.toLowerCase().includes(normalizedQuery) || 
    (loc.address && loc.address.toLowerCase().includes(normalizedQuery))
  ).map(loc => ({
    display_name: `⭐ ${loc.name} (${loc.address || 'Sem endereço'})`,
    lat: loc.latitude,
    lon: loc.longitude,
    isCustom: true
  }));

  searchTimeout = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'CommuteQuestDashboard/1.0'
        }
      });
      if (!res.ok) throw new Error('Nominatim suggestions fetch failed');
      const data = await res.json();
      const nominatimSuggestions = data.map(item => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon)
      }));

      // Combine custom locations first, then Nominatim suggestions, and deduplicate
      const combined = [...matchedCustom];
      for (const ns of nominatimSuggestions) {
        if (!combined.some(c => c.lat === ns.lat && c.lon === ns.lon)) {
          combined.push(ns);
        }
      }

      activeSuggestions.value = {
        field,
        index,
        list: combined.slice(0, 6)
      };
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      if (matchedCustom.length > 0) {
        activeSuggestions.value = {
          field,
          index,
          list: matchedCustom
        };
      }
    }
  }, 400);
}

function selectSuggestion(item) {
  if (activeSuggestions.value.field === 'departure') {
    startTripForm.value.departure = item.display_name;
    startTripForm.value.departureCoords = { lat: item.lat, lon: item.lon };
  } else if (activeSuggestions.value.field === 'destination') {
    startTripForm.value.destination = item.display_name;
    startTripForm.value.destinationCoords = { lat: item.lat, lon: item.lon };
  } else if (activeSuggestions.value.field === 'stop') {
    const idx = activeSuggestions.value.index;
    startTripForm.value.stops[idx].address = item.display_name;
    startTripForm.value.stops[idx].coords = { lat: item.lat, lon: item.lon };
  }
  activeSuggestions.value = { field: null, index: null, list: [] };
}

function addStop() {
  startTripForm.value.stops.push({ address: '', coords: null });
}

function removeStop(index) {
  startTripForm.value.stops.splice(index, 1);
}

const remainingDistanceKm = computed(() => {
  if (!activeTrip.value || !activeTrip.value.routeDistanceKm) return '0.00';
  const dist = activeTrip.value.routeDistanceKm - tripDistance.value;
  return Math.max(0, dist).toFixed(2);
});

const remainingEtaMinutes = computed(() => {
  if (!activeTrip.value || !activeTrip.value.routeDistanceKm || !activeTrip.value.etaMinutes) return 0;
  if (tripDistance.value >= activeTrip.value.routeDistanceKm) return 0;
  const ratio = (activeTrip.value.routeDistanceKm - tripDistance.value) / activeTrip.value.routeDistanceKm;
  const remMinutes = Math.round(activeTrip.value.etaMinutes * ratio);
  return Math.max(0, remMinutes);
});

const currentStreetName = computed(() => {
  if (!activeTrip.value) return 'Aguardando corrida...';
  const steps = activeTrip.value.routeSteps || [];
  if (steps.length === 0) {
    if (tripDistance.value >= (activeTrip.value.routeDistanceKm || 0) * 0.9) {
      return `Próximo a: ${activeTrip.value.destination}`;
    }
    return `Partida: ${activeTrip.value.departure}`;
  }

  let accum = 0;
  for (const step of steps) {
    accum += step.distanceKm;
    if (tripDistance.value <= accum) {
      return step.name ? step.name : 'Em trânsito...';
    }
  }
  return `Próximo a: ${activeTrip.value.destination}`;
});

const activeRankingList = computed(() => {
  if (!rankingList.value) return [];
  let list = rankingList.value.map(user => {
    let pts = user.pts;
    const isDriver = activeTrip.value && user.userId === activeTrip.value.driverId;
    const isPassenger = activeTrip.value && activeTrip.value.passengers && activeTrip.value.passengers.some(p => p.name === user.name);
    
    if (isDriver || isPassenger) {
      const elapsedSec = activeTrip.value.startTime
        ? Math.max(0, Math.floor((Date.now() - activeTrip.value.startTime) / 1000))
        : 0;
      pts += Math.round(activeTrip.value.distanceKm * 1000) + elapsedSec;
    }
    return { ...user, pts };
  });
  list.sort((a, b) => b.pts - a.pts);
  return list.map((user, index) => ({
    ...user,
    pos: index + 1
  }));
});

const displayedPoints = computed(() => {
  const currentUser = activeRankingList.value.find(u => u.userId === Number(userId.value) || u.name === username.value);
  return currentUser ? currentUser.pts : points.value;
});

// Modal de Config
const showStartTripModal = ref(false);
const startTripForm = ref({
  departure: '',
  departureCoords: null,
  destination: '',
  destinationCoords: null,
  stops: [], // array of { address: '', coords: null }
  passengers: [],
  useDeviceLocation: false
});
const savedPresets = ref([]);
const newPresetName = ref('');
const customLocationsList = ref([]);

async function fetchCustomLocations() {
  if (!token.value) return;
  try {
    customLocationsList.value = await apiFetch('/api/custom-locations');
  } catch (err) {
    console.error('Error fetching custom locations:', err);
  }
}

async function addCustomLocation(loc) {
  try {
    await apiFetch('/api/custom-locations', {
      method: 'POST',
      body: JSON.stringify(loc)
    });
    showToast('Localização personalizada adicionada!');
    await fetchCustomLocations();
  } catch (err) {
    showToast('Erro ao salvar localização');
  }
}

async function deleteCustomLocation(id) {
  if (!confirm('Deseja excluir esta localização personalizada?')) return;
  try {
    await apiFetch(`/api/custom-locations/${id}`, {
      method: 'DELETE'
    });
    showToast('Localização personalizada removida');
    await fetchCustomLocations();
  } catch (err) {
    showToast('Erro ao remover localização');
  }
}

function loadPresets() {
  const data = localStorage.getItem('commute-presets');
  if (data) {
    try {
      savedPresets.value = JSON.parse(data);
    } catch (_) {
      savedPresets.value = [];
    }
  } else {
    savedPresets.value = [
      {
        id: 'preset-1',
        name: 'Trabalho Diário',
        departure: 'Residência Enzo',
        departureCoords: null,
        destination: 'Sede Commute Quest',
        destinationCoords: null,
        stops: [],
        passengers: [
          { name: 'Marina', role: 'Co-piloto 🧭', status: '⚡ 120 Pontos' },
          { name: 'Enzo', role: 'Traseiro Esq. 🚗', status: '💤 Silencioso' }
        ]
      }
    ];
    localStorage.setItem('commute-presets', JSON.stringify(savedPresets.value));
  }
}

function saveCurrentAsPreset() {
  if (!newPresetName.value.trim()) {
    showToast('Insira um nome para o preset');
    return;
  }
  const preset = {
    id: 'preset-' + Date.now(),
    name: newPresetName.value.trim(),
    departure: startTripForm.value.departure,
    departureCoords: startTripForm.value.departureCoords,
    destination: startTripForm.value.destination,
    destinationCoords: startTripForm.value.destinationCoords,
    stops: JSON.parse(JSON.stringify(startTripForm.value.stops || [])),
    passengers: [...startTripForm.value.passengers]
  };
  savedPresets.value.push(preset);
  localStorage.setItem('commute-presets', JSON.stringify(savedPresets.value));
  newPresetName.value = '';
  showToast('Preset salvo com sucesso!');
}

function selectPreset(preset) {
  startTripForm.value.departure = preset.departure;
  startTripForm.value.departureCoords = preset.departureCoords || null;
  startTripForm.value.destination = preset.destination;
  startTripForm.value.destinationCoords = preset.destinationCoords || null;
  startTripForm.value.stops = preset.stops ? JSON.parse(JSON.stringify(preset.stops)) : [];
  startTripForm.value.passengers = [...preset.passengers];
  showToast(`Preset "${preset.name}" carregado!`);
}

function deletePreset(presetId) {
  savedPresets.value = savedPresets.value.filter(p => p.id !== presetId);
  localStorage.setItem('commute-presets', JSON.stringify(savedPresets.value));
  showToast('Preset removido');
}

function addModalPassenger() {
  if (newModalPassenger.value.name.trim() && newModalPassenger.value.role.trim()) {
    startTripForm.value.passengers.push({
      name: newModalPassenger.value.name.trim(),
      role: newModalPassenger.value.role.trim(),
      status: '⚡ 0 Pontos'
    });
    newModalPassenger.value.name = '';
    newModalPassenger.value.role = '';
  }
}

function removeModalPassenger(index) {
  startTripForm.value.passengers.splice(index, 1);
}

function openStartTripModal() {
  loadPresets();
  startTripForm.value.departure = '';
  startTripForm.value.departureCoords = null;
  startTripForm.value.destination = '';
  startTripForm.value.destinationCoords = null;
  startTripForm.value.stops = [];
  startTripForm.value.passengers = [];
  newPresetName.value = '';
  activeSuggestions.value = { field: null, index: null, list: [] };
  showStartTripModal.value = true;
}

function validateStartTripForm() {
  // Auto-add any passenger currently selected but not added via "+"
  if (newModalPassenger.value.name && newModalPassenger.value.role) {
    const nameExists = startTripForm.value.passengers.some(p => p.name === newModalPassenger.value.name);
    if (!nameExists) {
      startTripForm.value.passengers.push({
        name: newModalPassenger.value.name,
        role: newModalPassenger.value.role,
        status: '⚡ 0 Pontos'
      });
    }
    newModalPassenger.value = { name: '', role: '' };
  }

  if (!startTripForm.value.useDeviceLocation && navigator.geolocation) {
    const wantGps = confirm("Deseja utilizar a geolocalização em tempo real deste dispositivo para rastreamento da corrida no mapa?");
    if (wantGps) {
      startTripForm.value.useDeviceLocation = true;
    }
  }

  // Validação dos campos com base no modo de geolocalização
  if (startTripForm.value.useDeviceLocation) {
    if (!startTripForm.value.destination || !startTripForm.value.destination.trim()) {
      showToast('Informe o destino');
      return false;
    }
  } else {
    if (!startTripForm.value.departure || !startTripForm.value.departure.trim() || !startTripForm.value.destination || !startTripForm.value.destination.trim()) {
      showToast('Informe a partida e o destino');
      return false;
    }
  }
  return true;
}

async function resolveTripCoordinates() {
  let startLat = -23.55052;
  let startLon = -46.633308;
  let endLat = -23.55552;
  let endLon = -46.638308;

  // Resolve departure coords
  if (startTripForm.value.useDeviceLocation) {
    try {
      const pos = await getCurrentLocation();
      startLat = pos.coords.latitude;
      startLon = pos.coords.longitude;
      startTripForm.value.departureCoords = { lat: startLat, lon: startLon };
    } catch (err) {
      let extra = '';
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        extra = ' (O iOS/Safari exige conexão HTTPS segura para liberar o GPS em redes locais)';
      }
      showToast('Aviso: GPS não disponível' + extra + '. Usando geocodificação.');
      if (startTripForm.value.departureCoords) {
        startLat = startTripForm.value.departureCoords.lat;
        startLon = startTripForm.value.departureCoords.lon;
      } else {
        const startLoc = await geocodeAddress(startTripForm.value.departure);
        if (startLoc) {
          startLat = startLoc.lat;
          startLon = startLoc.lon;
        }
      }
    }
  } else if (startTripForm.value.departureCoords) {
    startLat = startTripForm.value.departureCoords.lat;
    startLon = startTripForm.value.departureCoords.lon;
  } else {
    const startLoc = await geocodeAddress(startTripForm.value.departure);
    if (startLoc) {
      startLat = startLoc.lat;
      startLon = startLoc.lon;
    } else {
      showToast('Aviso: Partida não encontrada. Usando localização padrão.');
    }
  }

  // Resolve destination coords
  if (startTripForm.value.destinationCoords) {
    endLat = startTripForm.value.destinationCoords.lat;
    endLon = startTripForm.value.destinationCoords.lon;
  } else {
    const endLoc = await geocodeAddress(startTripForm.value.destination);
    if (endLoc) {
      endLat = endLoc.lat;
      endLon = endLoc.lon;
    } else {
      showToast('Aviso: Destino não encontrado. Usando localização padrão.');
    }
  }

  // Compile coords list with stops
  const coordsList = [[startLat, startLon]];
  
  for (const stop of startTripForm.value.stops) {
    if (!stop.address.trim()) continue;
    let stopLat, stopLon;
    if (stop.coords) {
      stopLat = stop.coords.lat;
      stopLon = stop.coords.lon;
    } else {
      const stopLoc = await geocodeAddress(stop.address);
      if (stopLoc) {
        stopLat = stopLoc.lat;
        stopLon = stopLoc.lon;
      }
    }
    if (stopLat != null && stopLon != null) {
      coordsList.push([stopLat, stopLon]);
    }
  }
  
  coordsList.push([endLat, endLon]);

  return {
    startLat,
    startLon,
    endLat,
    endLon,
    coordsList
  };
}

async function confirmStartTrip() {
  if (!validateStartTripForm()) return;

  isGeocoding.value = true;
  showToast('Geocodificando endereços e calculando rota...');

  const { startLat, startLon, endLat, endLon, coordsList } = await resolveTripCoordinates();

  const routeData = await fetchOSRMRoute(coordsList);
  isGeocoding.value = false;
  
  passengers.value = [...startTripForm.value.passengers];
  
  const tripStartTimeValue = Date.now();
  
  activeTrip.value = {
    driverId: userId.value,
    passengers: passengers.value,
    departure: startTripForm.value.departure,
    destination: startTripForm.value.destination,
    startLat,
    startLon,
    endLat,
    endLon,
    routeCoords: routeData.routeCoords,
    keypoints: coordsList,
    etaMinutes: routeData.etaMinutes,
    routeDistanceKm: routeData.routeDistanceKm,
    routeSteps: routeData.routeSteps,
    startTime: tripStartTimeValue,
    useDeviceLocation: startTripForm.value.useDeviceLocation,
    currentLat: startLat,
    currentLon: startLon
  };

  if (socket && socket.connected) {
    socket.emit('start-trip', {
      passengers: passengers.value,
      departure: startTripForm.value.departure,
      destination: startTripForm.value.destination,
      startLat,
      startLon,
      endLat,
      endLon,
      routeCoords: routeData.routeCoords,
      keypoints: coordsList,
      etaMinutes: routeData.etaMinutes,
      routeDistanceKm: routeData.routeDistanceKm,
      routeSteps: routeData.routeSteps,
      startTime: tripStartTimeValue,
      useDeviceLocation: startTripForm.value.useDeviceLocation
    });
  }
  
  tripActive.value = true;
  tripStartTime.value = tripStartTimeValue;
  tripDistance.value = 0;
  
  startTracking(startTripForm.value.useDeviceLocation);
  
  showStartTripModal.value = false;
  showQrCodeModal.value = true;
  showToast('Corrida iniciada! Compartilhe o QR Code para conectar passageiros.');
}

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

const isGeocoding = ref(false);

watch(() => startTripForm.value.useDeviceLocation, async (newVal) => {
  if (newVal) {
    if (isGeocoding.value || tripActive.value) return; // Skip if starting or already in a trip
    try {
      showToast('Obtendo localização atual do dispositivo...');
      const pos = await getCurrentLocation();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      startTripForm.value.departureCoords = { lat, lon };
      startTripForm.value.departure = `Localização Atual (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
      showToast('Localização obtida com sucesso!');
    } catch (err) {
      let msg = err.message;
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        msg = 'O iOS/Safari exige conexão HTTPS segura para liberar o GPS em redes locais. ' + err.message;
      }
      showToast('Não foi possível obter a localização do dispositivo: ' + msg);
      startTripForm.value.useDeviceLocation = false;
    }
  } else {
    if (startTripForm.value.departure && startTripForm.value.departure.startsWith('Localização Atual')) {
      startTripForm.value.departure = '';
      startTripForm.value.departureCoords = null;
    }
  }
});

import { geocodeAddress, fetchOSRMRoute as fetchRouteShared } from '../utils/routing';

async function fetchOSRMRoute(coordsList) {
  const data = await fetchRouteShared(coordsList, true);
  if (data) return data;

  // Fallback straight line
  let totalDist = 0;
  const routeCoords = [];
  for (let i = 0; i < coordsList.length - 1; i++) {
    const p1 = coordsList[i];
    const p2 = coordsList[i + 1];
    totalDist += calculateDistance(p1[0], p1[1], p2[0], p2[1]);
    routeCoords.push(p1);
  }
  routeCoords.push(coordsList[coordsList.length - 1]);
  
  return {
    routeCoords,
    etaMinutes: Math.max(5, Math.round((totalDist / 50) * 60)),
    routeDistanceKm: Number(totalDist.toFixed(2)),
    routeSteps: []
  };
}

function queueOfflineTrip(trip) {
  try {
    const queue = JSON.parse(localStorage.getItem('commute-offline-trips') || '[]');
    queue.push({
      ...trip,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
    });
    localStorage.setItem('commute-offline-trips', JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to queue offline trip:', err);
  }
}

async function syncOfflineTrips() {
  if (isSyncingOffline.value) return;
  if (!navigator.onLine) return;

  const queue = JSON.parse(localStorage.getItem('commute-offline-trips') || '[]');
  if (queue.length === 0) return;

  isSyncingOffline.value = true;
  showToast(`Sincronizando ${queue.length} corrida(s) salvas offline...`);

  const remainingQueue = [];

  for (const trip of queue) {
    try {
      let finalDistanceKm = trip.distanceKm;
      
      const startLoc = await geocodeAddress(trip.startLocation);
      const endLoc = await geocodeAddress(trip.endLocation);
      
      if (startLoc && endLoc) {
        const routeData = await fetchOSRMRoute([[startLoc.lat, startLoc.lon], [endLoc.lat, endLoc.lon]]);
        if (routeData && routeData.routeDistanceKm) {
          finalDistanceKm = routeData.routeDistanceKm;
        }
      }
      
      const payload = {
        distanceKm: finalDistanceKm,
        durationMin: trip.durationMin,
        durationSec: trip.durationSec,
        avgSpeed: trip.avgSpeed,
        passengerCount: trip.passengerCount,
        passengers: trip.passengers || [],
        startLocation: trip.startLocation,
        endLocation: trip.endLocation
      };

      await apiFetch('/api/trips', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Error syncing offline trip, keeping in queue:', err, trip);
      remainingQueue.push(trip);
    }
  }

  localStorage.setItem('commute-offline-trips', JSON.stringify(remainingQueue));
  isSyncingOffline.value = false;

  if (remainingQueue.length === 0) {
    showToast('Todas as corridas offline foram sincronizadas com sucesso!');
    await fetchMe();
    if (activePage.value === 'achievements') fetchAchievements();
    if (activePage.value === 'home' || activePage.value === 'ranking') fetchRanking();
  } else {
    showToast(`Algumas corridas não puderam ser sincronizadas. (${remainingQueue.length} restantes)`);
  }
}

let socket = null;
let teleInterval = null;

function initDashboard() {
  socket = io(API_URL, { auth: { token: token.value } });

  socket.on('connect', () => {
    socketStatus.value = 'Conectado';
    socket.emit('ping-dashboard', { device: 'Commute Quest Dashboard' });
  });

  socket.on('pong-dashboard', (data) => {
    lastPing.value = new Date(data.timestamp).toLocaleTimeString();
  });

  socket.on('disconnect', () => {
    socketStatus.value = 'Desconectado';
  });

  socket.on('achievement-unlocked', (ach) => {
    if (pushNotifications.value) {
      showToast(`🏆 Conquista desbloqueada: ${ach.title} ${ach.emoji}`);
    }
    fetchMe();
  });

  socket.on('current-trip-state', (data) => {
    if (data) {
      activeTrip.value = data;
      tripActive.value = true;
      tripDistance.value = data.distanceKm;
      speed.value = data.speed;
      rpm.value = data.rpm;
      battery.value = data.battery;
      passengers.value = data.passengers || [];
      
      if (data.driverId === userId.value) {
        tripStartTime.value = data.startTime || (Date.now() - (data.distanceKm / (data.speed / 3600)) * 1000);
        startTracking(data.useDeviceLocation);
      }
    } else {
      activeTrip.value = null;
      tripActive.value = false;
      tripDistance.value = 0;
      speed.value = 0;
      rpm.value = 1000;
      battery.value = 100;
      passengers.value = [];
    }
  });

  socket.on('trip-started', (data) => {
    activeTrip.value = data;
    tripActive.value = true;
    passengers.value = data.passengers || [];
    if (data.driverId !== userId.value) {
      tripDistance.value = 0;
    }
  });

  socket.on('trip-updated', (data) => {
    // Show toast for newly joined passengers
    if (data.passengers && data.passengers.length > passengers.value.length) {
      const oldNames = new Set(passengers.value.map(p => p.name));
      const newPass = data.passengers.filter(p => !oldNames.has(p.name));
      newPass.forEach(p => {
        showToast(`👤 ${p.name} entrou na corrida como ${p.role}!`);
      });
    }
    
    activeTrip.value = data;
    passengers.value = data.passengers || [];
    
    if (data.driverId !== userId.value) {
      tripDistance.value = data.distanceKm;
      speed.value = data.speed;
      rpm.value = data.rpm;
      battery.value = data.battery;
    }
  });

  socket.on('trip-ended', () => {
    activeTrip.value = null;
    tripActive.value = false;
    if (tripInterval) {
      clearInterval(tripInterval);
      tripInterval = null;
    }
  });

  // Tocador de Música events (sent from Admin CMS)
  socket.on('music-state-change', (data) => {
    currentSong.value = data.title || 'Sem título';
    currentArtist.value = data.artist || 'Sem artista';
    isPlaying.value = data.isPlaying;
  });

  socket.on('car-location-updated', (data) => {
    if (data && data.lat != null && data.lon != null) {
      carLocation.value = data;
    }
  });

  if (userRole.value === 'admin') {
    triggerAdminTrackingCheck();
  }

  fetchRanking();
  fetchAchievements();
  fetchAllUsers();
  fetchBackgrounds();
  fetchUserRequests();

  window.addEventListener('online', syncOfflineTrips);
  syncOfflineTrips();

  if (teleInterval) clearInterval(teleInterval);
  teleInterval = setInterval(() => {
    if (isPlaying.value) {
      speed.value = Math.max(60, Math.min(140, speed.value + Math.floor(Math.random() * 5) - 2));
      rpm.value = Math.max(2000, Math.min(4500, rpm.value + Math.floor(Math.random() * 100) - 48));
      battery.value = Math.max(10, Number((battery.value - 0.01).toFixed(2)));
    } else {
      speed.value = Math.max(0, speed.value - 5);
      rpm.value = Math.max(800, rpm.value - 150);
    }
  }, 3000);
}

function togglePlay() {
  if (socket && socket.connected) {
    socket.emit('toggle-music');
  }
}

// Configurações
const pushNotifications = ref(true);
const pointsAlerts = ref(true);
const socialRanking = ref(false);
const publicProfile = ref(true);
const spotifyConnected = ref(false);
const showMusicWidget = ref(localStorage.getItem('showMusicWidget') !== 'false');

const sfxVolume = ref(parseFloat(localStorage.getItem('sfxVolumeMultiplier') ?? '0.5'));
const musicVolume = ref(parseFloat(localStorage.getItem('musicVolume') ?? '0.3'));

function connectSpotify() {
  const frontendUrl = window.location.origin;
  window.location.href = `${API_URL}/api/spotify/login?token=${token.value}&frontend_url=${encodeURIComponent(frontendUrl)}`;
}

async function disconnectSpotify() {
  try {
    const data = await apiFetch('/api/spotify/disconnect', {
      method: 'POST'
    });
    if (data.error) {
      showToast(data.error);
    } else {
      showToast('Spotify desconectado com sucesso!');
      spotifyConnected.value = false;
      window.dispatchEvent(new CustomEvent('spotify-status-change'));
    }
  } catch (e) {
    console.error(e);
    showToast('Erro ao desconectar o Spotify');
  }
}

function updateVolume(type) {
  if (type === 'sfx') {
    localStorage.setItem('sfxVolumeMultiplier', sfxVolume.value.toString());
    window.dispatchEvent(new CustomEvent('volume-change', { detail: { type: 'sfx', value: sfxVolume.value } }));
  } else if (type === 'music') {
    localStorage.setItem('musicVolume', musicVolume.value.toString());
    window.dispatchEvent(new CustomEvent('volume-change', { detail: { type: 'music', value: musicVolume.value } }));
  }
}

async function toggleSetting(key) {
  if (key === 'showMusicWidget') {
    showMusicWidget.value = !showMusicWidget.value;
    localStorage.setItem('showMusicWidget', String(showMusicWidget.value));
    window.dispatchEvent(new CustomEvent('music-widget-toggle', { detail: showMusicWidget.value }));
    return;
  }
  let val = false;
  if (key === 'pushNotifications') { pushNotifications.value = !pushNotifications.value; val = pushNotifications.value; }
  if (key === 'pointsAlerts') { pointsAlerts.value = !pointsAlerts.value; val = pointsAlerts.value; }
  if (key === 'socialRanking') { socialRanking.value = !socialRanking.value; val = socialRanking.value; }
  if (key === 'publicProfile') { publicProfile.value = !publicProfile.value; val = publicProfile.value; }
  
  try {
    await apiFetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ [key]: val })
    });
  } catch (e) {
    console.error('Erro ao salvar configuração:', e);
  }
}

// Configurações de Fundo
const appBgType = ref(localStorage.getItem('app-background') || 'bliss');
const appCustomBgUrl = ref(localStorage.getItem('app-background-custom') || '');
const defaultBackgrounds = ref([]);

async function fetchBackgrounds() {
  try {
    const data = await apiFetch('/api/backgrounds');
    defaultBackgrounds.value = data;
    // Apply background again in case it finished loading after mount
    applyBackground(appBgType.value, appCustomBgUrl.value);
  } catch (e) {
    console.error('Erro ao carregar imagens de fundo:', e);
  }
}

import { defaultBackgrounds as defaultBackgroundsMap } from '../utils/backgrounds';

function applyBackground(bgType, customUrl = '') {
  if (bgType === 'stripes') {
    document.body.style.background = "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
  } else if (bgType === 'custom' && customUrl) {
    document.body.style.background = `url('${customUrl}') no-repeat center center fixed`;
    document.body.style.backgroundSize = 'cover';
  } else {
    // Look up in defaultBackgrounds
    const bg = defaultBackgrounds.value.find(b => b.key === bgType);
    if (bg && bg.url && bg.url !== 'stripes') {
      document.body.style.background = `url('${bg.url}') no-repeat center center fixed`;
      document.body.style.backgroundSize = 'cover';
    } else if (bg && bg.key === 'stripes') {
      document.body.style.background = "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
    } else {
      // Hardcoded fallback before backgrounds list is fetched or for guest
      const fallbackUrl = defaultBackgroundsMap[bgType];

      if (fallbackUrl) {
        document.body.style.background = `url('${fallbackUrl}') no-repeat center center fixed`;
        document.body.style.backgroundSize = 'cover';
      } else {
        document.body.style.background = "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
      }
    }
  }
}

async function changeBg() {
  localStorage.setItem('app-background', appBgType.value);
  if (appBgType.value === 'custom') {
    localStorage.setItem('app-background-custom', appCustomBgUrl.value);
  }
  applyBackground(appBgType.value, appCustomBgUrl.value);
  window.dispatchEvent(new Event('storage'));

  // Save to database settings
  try {
    await apiFetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        bgType: appBgType.value,
        customBgUrl: appCustomBgUrl.value
      })
    });
  } catch (e) {
    console.error('Erro ao salvar imagem de fundo no banco:', e);
  }
}

function handleStorageChange() {
  appBgType.value = localStorage.getItem('app-background') || 'bliss';
  appCustomBgUrl.value = localStorage.getItem('app-background-custom') || '';
  applyBackground(appBgType.value, appCustomBgUrl.value);
}

// Configurações de Perfil e Customização
const bio = ref('');
const avatarUrl = ref('');
const bannerUrl = ref('');
const bannerPositionY = ref('50%');
const profileTextColor = ref('#ffffff');
const customTags = ref([]);
const highlightedAchievements = ref([]);
const showHighlightsModal = ref(false);
const isEditingProfile = ref(false);
const showTrophyDetailsModal = ref(false);
const selectedTrophy = ref(null);

function selectTrophy(ach) {
  selectedTrophy.value = ach;
  showTrophyDetailsModal.value = true;
}

function handleTrophyHover(e) {
  if (!e || !e.currentTarget) return;
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const rotateX = ((centerY - y) / centerY) * 12;
  const rotateY = ((x - centerX) / centerX) * 12;
  
  card.style.transform = `perspective(300px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.06) translateY(-4px)`;
  card.style.boxShadow = `0 12px 24px rgba(0, 0, 0, 0.12)`;
}

function resetTrophyHover(e) {
  if (!e || !e.currentTarget) return;
  const card = e.currentTarget;
  card.style.transform = 'perspective(300px) rotateX(0deg) rotateY(0deg) scale(1) translateY(0)';
  card.style.boxShadow = '';
}

const highlightedAchievementsData = computed(() => {
  return highlightedAchievements.value.map(id => achievementsList.value.find(a => a.id === id)).filter(Boolean);
});

const viewedProfileUser = ref(null);

const profileUsername = computed(() => viewedProfileUser.value ? viewedProfileUser.value.username : username.value);
const profileUserTag = computed(() => {
  const idVal = viewedProfileUser.value ? String(viewedProfileUser.value.id) : String(userId.value);
  if (!idVal) return userTag.value;
  return idVal.padStart(4, '0').slice(-4);
});
const profileUserId = computed(() => viewedProfileUser.value ? String(viewedProfileUser.value.id) : userId.value);
const profileAvatarUrl = computed(() => viewedProfileUser.value ? viewedProfileUser.value.avatarUrl : avatarUrl.value);
const profileBannerUrl = computed(() => viewedProfileUser.value ? viewedProfileUser.value.bannerUrl : bannerUrl.value);
const profileBannerPositionY = computed(() => viewedProfileUser.value ? viewedProfileUser.value.bannerPositionY : bannerPositionY.value);
const profileTextColorVal = computed(() => viewedProfileUser.value ? viewedProfileUser.value.profileTextColor : profileTextColor.value);
const profileCustomTags = computed(() => viewedProfileUser.value ? viewedProfileUser.value.customTags : customTags.value);
const profileTotalKm = computed(() => viewedProfileUser.value ? viewedProfileUser.value.totalDistanceKm : totalKm.value);
const profileTotalHours = computed(() => viewedProfileUser.value ? viewedProfileUser.value.totalHours : totalHours.value);
const profileDisplayedPoints = computed(() => viewedProfileUser.value ? viewedProfileUser.value.totalPoints : displayedPoints.value);
const profileTripsCount = computed(() => viewedProfileUser.value ? viewedProfileUser.value.tripsCount : tripsCount.value);
const profileTotalPassengers = computed(() => viewedProfileUser.value ? viewedProfileUser.value.totalPassengers : totalPassengers.value);
const profileLongestTripKm = computed(() => viewedProfileUser.value ? viewedProfileUser.value.longestTripKm : longestTripKm.value);
const profileLongestTrip = computed(() => viewedProfileUser.value ? viewedProfileUser.value.longestTrip : longestTrip.value);
const profileHighlightedAchievementsData = computed(() => {
  if (viewedProfileUser.value) {
    const highlights = viewedProfileUser.value.highlightedAchievements || [];
    return highlights.map(id => achievementsList.value.find(a => a.id === id)).filter(Boolean);
  }
  return highlightedAchievementsData.value;
});

const profileBio = computed(() => viewedProfileUser.value ? viewedProfileUser.value.bio : bio.value);

const publicHighlightedAchievementsData = computed(() => {
  if (!publicProfileData.value || !publicProfileData.value.highlightedAchievements) return [];
  const highlights = publicProfileData.value.highlightedAchievements;
  return highlights.map(id => achievementsList.value.find(a => a.id === id)).filter(Boolean);
});

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

function getPublicBadgeStyle(ach, profileId) {
  const color = getRarityColor(ach.glowColor);
  const isWinner = ach.firstWinner && String(ach.firstWinner.id) === String(profileId);
  if (isWinner) {
    return {
      border: `2px solid ${color}`,
      background: `linear-gradient(135deg, ${color}15, ${color}28)`,
      boxShadow: `0 4px 12px ${color}30, 0 0 0 1.5px #fbbf24`, // gold ring for first winner
      cursor: 'pointer',
      width: '100%',
      height: '76px',
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
      height: '76px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      position: 'relative'
    };
  }
}

function viewFullProfile(profileUser) {
  viewedProfileUser.value = profileUser;
  activePage.value = 'profile';
  closePublicProfile();
}

const showTagModal = ref(false);
const editingTagIdx = ref(null);
const tagModalForm = ref({ text: '', color: '#3b82f6' });

function toggleEditingProfile() {
  isEditingProfile.value = !isEditingProfile.value;
}

const avatarInput = ref(null);
const bannerInput = ref(null);

function triggerAvatarUpload() {
  if (avatarInput.value) avatarInput.value.click();
}

function triggerBannerUpload() {
  if (bannerInput.value) bannerInput.value.click();
}

async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  const url = await uploadFile(file);
  if (url) {
    await saveProfileChanges({ avatarUrl: url });
  }
}

async function uploadBanner(event) {
  const file = event.target.files[0];
  if (!file) return;
  const url = await uploadFile(file);
  if (url) {
    await saveProfileChanges({ bannerUrl: url });
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.value}`
      },
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro no upload');
    }
    const data = await res.json();
    return data.fileUrl;
  } catch (err) {
    showToast(err.message || 'Erro no upload');
    return null;
  }
}

function updateTextColor(color) {
  profileTextColor.value = color;
  saveProfileChanges({ profileTextColor: color });
}

function promptEditBio() {
  const newBio = prompt('Digite sua nova biografia:', bio.value);
  if (newBio !== null) {
    saveProfileChanges({ bio: newBio });
  }
}

function promptEditEmail() {
  const newEmail = prompt('Digite o seu novo e-mail:', email.value);
  if (newEmail !== null) {
    saveProfileChanges({ email: newEmail });
  }
}

function promptEditUsername() {
  const newUsername = prompt('Digite o seu novo nome de usuário:', username.value);
  if (newUsername !== null && newUsername.trim() !== '') {
    saveProfileChanges({ username: newUsername.trim() });
  }
}

const userRequests = ref([]);

async function fetchUserRequests() {
  try {
    const data = await apiFetch('/api/requests');
    if (!data.error) {
      userRequests.value = data;
    }
  } catch (e) {
    console.error('Erro ao buscar solicitações:', e);
  }
}

async function submitRequest({ type, details }) {
  try {
    const data = await apiFetch('/api/requests', {
      method: 'POST',
      body: JSON.stringify({ type, details })
    });
    if (data.error) {
      showToast(data.error);
    } else {
      showToast('Solicitação enviada com sucesso!');
      await fetchUserRequests();
    }
  } catch (e) {
    console.error('Erro ao enviar solicitação:', e);
    showToast('Erro ao enviar solicitação');
  }
}

async function saveProfileChanges(changes) {
  try {
    const data = await apiFetch('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(changes)
    });
    if (data.error) {
      showToast(data.error);
    } else {
      showToast('Perfil atualizado com sucesso!');
      if (changes.username !== undefined) username.value = data.user.username;
      if (changes.bio !== undefined) bio.value = data.user.bio || '';
      if (changes.avatarUrl !== undefined) avatarUrl.value = data.user.avatarUrl || '';
      if (changes.bannerUrl !== undefined) bannerUrl.value = data.user.bannerUrl || '';
      if (changes.bannerPositionY !== undefined) bannerPositionY.value = data.user.bannerPositionY || '50%';
      if (changes.profileTextColor !== undefined) profileTextColor.value = data.user.profileTextColor || '#ffffff';
      if (changes.customTags !== undefined) {
        customTags.value = safeParse(data.user.customTags);
      }
      if (changes.email !== undefined) email.value = data.user.email || 'Não informado';
    }
  } catch (e) {
    console.error(e);
    showToast('Erro ao atualizar perfil');
  }
}

function openAddTagModal() {
  editingTagIdx.value = null;
  tagModalForm.value = { text: '', color: '#3b82f6' };
  showTagModal.value = true;
}

function editTag(idx) {
  editingTagIdx.value = idx;
  tagModalForm.value = { ...customTags.value[idx] };
  showTagModal.value = true;
}

function deleteTag(idx) {
  customTags.value.splice(idx, 1);
  saveProfileChanges({ customTags: customTags.value });
}

function saveTag() {
  if (!tagModalForm.value.text.trim()) return;
  if (editingTagIdx.value !== null) {
    customTags.value[editingTagIdx.value] = { ...tagModalForm.value };
  } else {
    customTags.value.push({ ...tagModalForm.value });
  }
  showTagModal.value = false;
  saveProfileChanges({ customTags: customTags.value });
}

function openHighlightsModal() {
  showHighlightsModal.value = true;
}

function saveHighlights(newHighlights) {
  highlightedAchievements.value = newHighlights;
  showHighlightsModal.value = false;
  saveProfileChanges({ highlightedAchievements: highlightedAchievements.value });
}

// Dragging Banner
const isDraggingBanner = ref(false);
const dragStartY = ref(0);
const startBannerY = ref(50);

function startBannerDrag(e) {
  if (!isEditingProfile.value || !bannerUrl.value) return;
  if (e.target.closest('.banner-upload-btn')) return;
  
  isDraggingBanner.value = true;
  dragStartY.value = e.clientY;
  startBannerY.value = parseFloat(bannerPositionY.value) || 50;
  
  window.addEventListener('mousemove', onBannerDrag);
  window.addEventListener('mouseup', stopBannerDrag);
}

function onBannerDrag(e) {
  if (!isDraggingBanner.value) return;
  const deltaY = e.clientY - dragStartY.value;
  const percentChange = (deltaY / 200) * 100;
  let newY = startBannerY.value - percentChange;
  newY = Math.min(Math.max(newY, 0), 100);
  bannerPositionY.value = `${newY.toFixed(2)}%`;
}

async function stopBannerDrag() {
  if (!isDraggingBanner.value) return;
  isDraggingBanner.value = false;
  window.removeEventListener('mousemove', onBannerDrag);
  window.removeEventListener('mouseup', stopBannerDrag);
  
  await saveProfileChanges({ bannerPositionY: bannerPositionY.value });
}

// SFX and Navigation
function navigate(page) {
  sfxNavigate();
  activePage.value = page;
  if (page === 'profile') {
    viewedProfileUser.value = null;
  }
}

function handleLogout() {
  localStorage.removeItem('token');
  isAuthenticated.value = false;
  token.value = '';
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  window.removeEventListener('online', syncOfflineTrips);
  if (tripInterval) clearInterval(tripInterval);
  if (teleInterval) clearInterval(teleInterval);

  // Stop admin continuous tracking
  triggerAdminTrackingCheck();
}

onMounted(async () => {
  if (token.value) {
    const success = await fetchMe();
    if (success) {
      isAuthenticated.value = true;
      initDashboard();
    } else {
      localStorage.removeItem('token');
      token.value = '';
    }
  }

  // Handle Spotify URL queries
  const params = new URLSearchParams(window.location.search);
  const spotifySuccess = params.get('spotify_success');
  const spotifyError = params.get('spotify_error');
  if (spotifySuccess) {
    showToast('Spotify conectado com sucesso!');
    window.history.replaceState({}, document.title, window.location.pathname);
    window.dispatchEvent(new CustomEvent('spotify-status-change'));
  } else if (spotifyError) {
    showToast(`Erro ao conectar ao Spotify: ${spotifyError}`, 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Handle Join Trip from URL query
  const joinDriverId = params.get('joinTrip');
  if (joinDriverId) {
    pendingJoinTripDriverId.value = joinDriverId;
    showSeatSelectionModal.value = true;
  }

  window.addEventListener('storage', handleStorageChange);
});

onUnmounted(() => {
  if (socket) socket.disconnect();
  if (tripInterval) clearInterval(tripInterval);
  if (teleInterval) clearInterval(teleInterval);
  if (searchTimeout) clearTimeout(searchTimeout);
  window.removeEventListener('mousemove', onBannerDrag);
  window.removeEventListener('mouseup', stopBannerDrag);
  if (publicProfileMap) {
    publicProfileMap.remove();
    publicProfileMap = null;
  }
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('online', syncOfflineTrips);
});

// Modals to watch for SFX
const modalsToWatch = [
  { ref: showTrophyDetailsModal, name: 'showTrophyDetailsModal' },
  { ref: showTagModal, name: 'showTagModal' },
  { ref: showSeatSelectionModal, name: 'showSeatSelectionModal' },
  { ref: showQrCodeModal, name: 'showQrCodeModal' },
  { ref: showStartTripModal, name: 'showStartTripModal' },
  { ref: showPublicProfile, name: 'showPublicProfile' }
];

modalsToWatch.forEach(m => {
  watch(m.ref, (newVal) => {
    if (newVal) {
      sfxModalOpen();
    } else {
      sfxModalClose();
    }
  });
});
</script>

<template>
  <div v-if="!isAuthenticated">
    <LoginScreen
      :authError="authError"
      @submit-auth="handleAuth"
    />
  </div>

  <div class="ipad" v-else>
    <!-- Sidebar Navigation -->
    <aside class="sidebar">
      <button 
        :class="['nav-btn', activePage === 'home' ? 'active-home' : 'inactive']" 
        @click="navigate('home')" 
        title="Home"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
        </svg>
      </button>
      <button 
        :class="['nav-btn', activePage === 'profile' ? 'active-profile' : 'inactive']" 
        @click="navigate('profile')" 
        title="Perfil"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
        </svg>
      </button>
      <button 
        :class="['nav-btn', activePage === 'ranking' ? 'active-achievements' : 'inactive']" 
        @click="navigate('ranking')" 
        title="Ranking Global"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M19 3v4M5 11h14M9 11v4a3 3 0 006 0v-4M7 21h10M12 17v4" />
        </svg>
      </button>
      <button 
        :class="['nav-btn', activePage === 'achievements' ? 'active-achievements' : 'inactive']" 
        @click="navigate('achievements')" 
        title="Conquistas"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
        </svg>
      </button>
      <button 
        :class="['nav-btn', activePage === 'settings' ? 'active-settings' : 'inactive']" 
        @click="navigate('settings')" 
        title="Configurações"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
        </svg>
      </button>

      <!-- Botão de Admin para contas administrativas -->
      <router-link 
        v-if="userRole === 'admin'" 
        to="/admin" 
        class="nav-btn inactive" 
        title="Painel Admin"
        style="display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 16px; margin-top: 8px;"
      >
        🛠️
      </router-link>
    </aside>

    <!-- Main Content Panel -->
    <section class="glass no-scroll overflow-y-auto">
      <!-- Home Page -->
      <div :class="['page', activePage === 'home' ? 'active' : '']" id="page-home">
        <HomeTab
          :tripActive="tripActive"
          :activeTrip="activeTrip"
          :currentStreetName="currentStreetName"
          :remainingEtaMinutes="remainingEtaMinutes"
          :remainingDistanceKm="remainingDistanceKm"
          :userRole="userRole"
          :tripDistance="tripDistance"
          :isPlaying="isPlaying"
          :currentSong="currentSong"
          :currentArtist="currentArtist"
          :passengers="passengers"
          :activeRankingList="activeRankingList"
          :userId="userId"
          :speed="speed"
          :rpm="rpm"
          :battery="battery"
          :totalHours="totalHours"
          :tripStartTime="tripStartTime"
          :getFullUrl="getFullUrl"
          :carLocation="carLocation"
          @open-start-trip-modal="openStartTripModal"
          @end-trip="endTrip"
          @show-qr-code="showQrCodeModal = true"
          @toggle-play="togglePlay"
          @open-public-profile="openPublicProfile"
        />
      </div>

      <!-- Profile Page -->
      <div :class="['page', activePage === 'profile' ? 'active' : '']" id="page-profile" style="position: relative; height: 100%;">
        <ProfileTab
          :username="profileUsername"
          :userTag="profileUserTag"
          :userId="profileUserId"
          :avatarUrl="profileAvatarUrl"
          :bannerUrl="profileBannerUrl"
          :bannerPositionY="profileBannerPositionY"
          :profileTextColor="profileTextColorVal"
          :customTags="profileCustomTags"
          :isEditingProfile="isEditingProfile"
          :totalKm="profileTotalKm"
          :totalHours="profileTotalHours"
          :displayedPoints="profileDisplayedPoints"
          :tripsCount="profileTripsCount"
          :totalPassengers="profileTotalPassengers"
          :longestTripKm="profileLongestTripKm"
          :longestTrip="profileLongestTrip"
          :highlightedAchievementsData="profileHighlightedAchievementsData"
          :getFullUrl="getFullUrl"
          :isOwnProfile="viewedProfileUser === null"
          :bio="profileBio"
          @trigger-avatar-upload="triggerAvatarUpload"
          @trigger-banner-upload="triggerBannerUpload"
          @start-banner-drag="startBannerDrag"
          @open-add-tag-modal="openAddTagModal"
          @edit-tag="editTag"
          @delete-tag="deleteTag"
          @open-highlights-modal="openHighlightsModal"
          @select-trophy="selectTrophy"
          @handle-trophy-hover="handleTrophyHover"
          @reset-trophy-hover="resetTrophyHover"
          @toggle-editing-profile="toggleEditingProfile"
          @update-text-color="updateTextColor"
          @go-back-to-own-profile="viewedProfileUser = null"
          @edit-bio="promptEditBio"
        />
      </div>

      <!-- Achievements Page -->
      <div :class="['page', activePage === 'achievements' ? 'active' : '']" id="page-achievements">
        <AchievementsTab
          :achievementsList="achievementsList"
          :achievementsCount="achievementsCount"
          :totalAchievements="totalAchievements"
          :userId="userId"
          :level="level"
          :getFullUrl="getFullUrl"
          @select-trophy="selectTrophy"
          @handle-trophy-hover="handleTrophyHover"
          @reset-trophy-hover="resetTrophyHover"
          @open-public-profile="openPublicProfile"
        />
      </div>

      <!-- Ranking Page -->
      <div :class="['page', activePage === 'ranking' ? 'active' : '']" id="page-ranking">
        <RankingTab
          :activeRankingList="activeRankingList"
          :getFullUrl="getFullUrl"
          @open-public-profile="openPublicProfile"
        />
      </div>

      <!-- Settings Page -->
      <div :class="['page', activePage === 'settings' ? 'active' : '']" id="page-settings">
        <SettingsTab
          :userId="userId"
          :username="username"
          :email="email"
          :pushNotifications="pushNotifications"
          :pointsAlerts="pointsAlerts"
          :socialRanking="socialRanking"
          :publicProfile="publicProfile"
          :showMusicWidget="showMusicWidget"
          :requests="userRequests"
          :spotifyConnected="spotifyConnected"
          v-model:sfxVolume="sfxVolume"
          v-model:musicVolume="musicVolume"
          v-model:appBgType="appBgType"
          v-model:appCustomBgUrl="appCustomBgUrl"
          :defaultBackgrounds="defaultBackgrounds"
          :customLocations="customLocationsList"
          @toggle-setting="toggleSetting"
          @update-volume="updateVolume"
          @change-bg="changeBg"
          @prompt-edit-email="promptEditEmail"
          @prompt-edit-username="promptEditUsername"
          @submit-request="submitRequest"
          @connect-spotify="connectSpotify"
          @disconnect-spotify="disconnectSpotify"
          @logout="handleLogout"
          @add-custom-location="addCustomLocation"
          @delete-custom-location="deleteCustomLocation"
        />
      </div>
    </section>
  </div>

  <!-- Hidden Inputs for Uploads -->
  <input ref="avatarInput" type="file" accept="image/*" style="display: none" @change="uploadAvatar" />
  <input ref="bannerInput" type="file" accept="image/*" style="display: none" @change="uploadBanner" />

  <!-- Highlights Edit Modal -->
  <EditHighlightsModal
    :show="showHighlightsModal"
    :achievementsList="achievementsList"
    :initialHighlights="highlightedAchievements"
    @close="showHighlightsModal = false"
    @save="saveHighlights"
  />

  <!-- Tag Edit Modal -->
  <div v-if="showTagModal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);">
    <div class="glass" style="max-width: 380px; padding: 28px; display: flex; flex-direction: column; gap: 20px; background: rgba(255,255,255,0.95); box-shadow: 0 10px 25px rgba(0,0,0,0.15);">
      <h3 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0; font-family: 'Space Grotesk', sans-serif;">{{ editingTagIdx !== null ? 'Editar Tag' : 'Adicionar Nova Tag' }}</h3>
      
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">Texto da Tag</label>
        <input v-model="tagModalForm.text" type="text" placeholder="Ex: Eco Driver" style="padding: 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); font-size: 13px; outline: none; width: 100%; box-sizing: border-box;" maxLength="20" />
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">Cor da Tag</label>
        <div style="display: flex; gap: 12px; align-items: center; width: 100%;">
          <input v-model="tagModalForm.color" type="color" style="border: none; background: none; width: 44px; height: 36px; padding: 0; cursor: pointer; flex-shrink: 0;" />
          <input v-model="tagModalForm.color" type="text" style="flex: 1; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); font-size: 13px; outline: none; box-sizing: border-box;" />
        </div>
        <!-- Color presets -->
        <div style="display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
          <button v-for="c in ['#3b82f6', '#10b981', '#9333ea', '#f59e0b', '#ef4444', '#6366f1', '#ec4899']" :key="c" @click="tagModalForm.color = c" :style="{ backgroundColor: c }" style="width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid white; cursor: pointer; transition: transform 0.15s;" class="tag-preset-color-btn"></button>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; width: 100%;">
        <button @click="showTagModal = false" style="padding: 10px 20px; border-radius: 12px; border: 1.5px solid rgba(0,0,0,0.1); background: white; font-size: 13px; font-weight: 700; cursor: pointer; color: #475569;">Cancelar</button>
        <button @click="saveTag" style="padding: 10px 20px; border-radius: 12px; border: none; background: linear-gradient(135deg, #818cf8, #6366f1); color: white; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(99,102,241,0.35);">Salvar</button>
      </div>
    </div>
  </div>

  <!-- Modal de Configuração de Corrida -->
  <div v-if="showStartTripModal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(8px);">
    <div class="glass no-scroll" style="width: 100%; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 28px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15); padding: 28px; box-sizing: border-box; overflow: hidden;">
      
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif;">🏎️ Configurar Corrida</h2>
        <button @click="showStartTripModal = false" style="background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; padding: 4px;">✕</button>
      </div>

      <!-- Scrollable content - Two columns grid -->
      <div class="no-scroll" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px; padding-right: 4px; box-sizing: border-box;">
        
        <!-- Left Column: Route & Presets -->
        <div style="background: rgba(248, 250, 252, 0.65); border: 1px solid rgba(226, 232, 240, 0.8); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box;">
          <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Space Grotesk', sans-serif;">📍 Detalhes da Rota</h3>

          <!-- Presets Section -->
          <div>
            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; display: block;">Meus Presets</label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <div v-for="preset in savedPresets" :key="preset.id" style="display: flex; align-items: center; background: rgba(255, 255, 255, 0.8); border-radius: 10px; padding: 4px 10px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <span @click="selectPreset(preset)" style="font-size: 12px; font-weight: 600; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 4px;">📂 {{ preset.name }}</span>
                <button @click="deletePreset(preset.id)" style="background: none; border: none; color: #94a3b8; cursor: pointer; margin-left: 8px; padding: 2px; font-size: 12px;" class="delete-preset-btn">×</button>
              </div>
              <div v-if="savedPresets.length === 0" style="font-size: 12px; color: #94a3b8; font-style: italic;">Nenhum preset salvo.</div>
            </div>
          </div>

          <!-- GPS tracking checkbox -->
          <div style="display: flex; align-items: center; gap: 10px; background: rgba(16, 185, 129, 0.05); border: 1px dashed rgba(16, 185, 129, 0.25); padding: 12px 14px; border-radius: 14px;">
            <input 
              v-model="startTripForm.useDeviceLocation" 
              type="checkbox" 
              id="useDeviceLocation"
              style="width: 17px; height: 17px; accent-color: #10b981; cursor: pointer;"
            />
            <label for="useDeviceLocation" style="font-size: 12px; font-weight: 700; color: #065f46; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 4px; font-family: 'Space Grotesk', sans-serif;">
              📍 Usar GPS do dispositivo em tempo real
            </label>
          </div>

          <!-- Departure Address -->
          <div style="position: relative; display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Ponto de Partida</label>
            <input 
              v-model="startTripForm.departure" 
              @input="handleAddressInput($event.target.value, 'departure')"
              type="text" 
              placeholder="Endereço de partida ou coordenada..." 
              style="width: 100%; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(255, 255, 255, 0.9); font-size: 13px; outline: none; box-sizing: border-box; font-family: 'Space Grotesk', sans-serif;" 
            />
            <!-- Suggestions Dropdown -->
            <div v-if="activeSuggestions.field === 'departure' && activeSuggestions.list.length > 0" class="suggestions-dropdown">
              <div 
                v-for="(item, idx) in activeSuggestions.list" 
                :key="idx" 
                @click="selectSuggestion(item)"
                class="suggestion-item"
              >
                {{ item.display_name }}
              </div>
            </div>
          </div>

          <!-- Stops Section -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Paradas Intermediárias</label>
              <button @click="addStop" style="background: none; border: none; color: #3b82f6; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 2px; font-family: 'Space Grotesk', sans-serif;">➕ Add Parada</button>
            </div>
            
            <div v-for="(stop, index) in startTripForm.stops" :key="index" style="position: relative; display: flex; align-items: center; gap: 8px;">
              <input 
                v-model="stop.address" 
                @input="handleAddressInput($event.target.value, 'stop', index)"
                type="text" 
                placeholder="Endereço da parada..." 
                style="flex: 1; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(255, 255, 255, 0.9); font-size: 13px; outline: none; box-sizing: border-box; font-family: 'Space Grotesk', sans-serif;" 
              />
              <button @click="removeStop(index)" style="background: none; border: none; color: #ef4444; font-size: 16px; cursor: pointer; padding: 4px;">✕</button>
              
              <!-- Suggestions Dropdown -->
              <div v-if="activeSuggestions.field === 'stop' && activeSuggestions.index === index && activeSuggestions.list.length > 0" class="suggestions-dropdown">
                <div 
                  v-for="(item, idx) in activeSuggestions.list" 
                  :key="idx" 
                  @click="selectSuggestion(item)"
                  class="suggestion-item"
                >
                  {{ item.display_name }}
                </div>
              </div>
            </div>
          </div>

          <!-- Destination Address -->
          <div style="position: relative; display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Destino Final</label>
            <input 
              v-model="startTripForm.destination" 
              @input="handleAddressInput($event.target.value, 'destination')"
              type="text" 
              placeholder="Endereço de destino..." 
              style="width: 100%; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(255, 255, 255, 0.9); font-size: 13px; outline: none; box-sizing: border-box; font-family: 'Space Grotesk', sans-serif;" 
            />
            <!-- Suggestions Dropdown -->
            <div v-if="activeSuggestions.field === 'destination' && activeSuggestions.list.length > 0" class="suggestions-dropdown">
              <div 
                v-for="(item, idx) in activeSuggestions.list" 
                :key="idx" 
                @click="selectSuggestion(item)"
                class="suggestion-item"
              >
                {{ item.display_name }}
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Passengers & Presets Save -->
        <div style="background: rgba(248, 250, 252, 0.65); border: 1px solid rgba(226, 232, 240, 0.8); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; gap: 18px; justify-content: space-between; box-sizing: border-box;">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <h3 style="margin: 0; font-size: 14px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Space Grotesk', sans-serif;">👤 Passageiros & Assentos</h3>

            <!-- Add Passenger Section -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Adicionar Passageiro</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <div style="position: relative; flex: 1;">
                  <input 
                    v-model="newModalPassenger.name" 
                    type="text" 
                    placeholder="Buscar ou digitar nome..." 
                    style="width: 100%; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(255, 255, 255, 0.9); font-size: 13px; outline: none; box-sizing: border-box; font-family: 'Space Grotesk', sans-serif;"
                    @focus="showUserSelectMenu = true"
                    @blur="setTimeout(() => showUserSelectMenu = false, 200)"
                  />
                  <!-- Dropdown suggestions from global user accounts -->
                  <div v-if="showUserSelectMenu && availableUsersForPassengers.length > 0" ref="userSelectContainer" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #cbd5e1; border-radius: 14px; margin-top: 4px; max-height: 160px; overflow-y: auto; z-index: 20000; box-shadow: 0 10px 25px rgba(0,0,0,0.08);">
                    <div 
                      v-for="u in availableUsersForPassengers" 
                      :key="u.userId"
                      @mousedown="newModalPassenger.name = u.name"
                      style="padding: 10px 14px; font-size: 12px; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 10px;"
                      class="user-suggestion-item"
                    >
                      <img 
                        v-if="u.avatarUrl" 
                        :src="getFullUrl(u.avatarUrl)" 
                        style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;" 
                      />
                      <span v-else style="font-size: 14px;">👤</span>
                      <span style="font-weight: 600;">{{ u.name }}</span>
                    </div>
                  </div>
                </div>
                
                <select v-model="newModalPassenger.role" style="padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(255, 255, 255, 0.9); font-size: 13px; outline: none; cursor: pointer; font-family: 'Space Grotesk', sans-serif;">
                  <option value="" disabled selected>Assento</option>
                  <option value="Co-piloto 🧭">Co-piloto 🧭</option>
                  <option value="Traseiro Esq. 🚗">Traseiro Esq. 🚗</option>
                  <option value="Traseiro Dir. 🚗">Traseiro Dir. 🚗</option>
                  <option value="Traseiro Meio 🚗">Traseiro Meio 🚗</option>
                </select>
                
                <button @click="addModalPassenger" style="padding: 11px 18px; border-radius: 14px; border: none; background: #3b82f6; color: white; font-weight: 700; font-size: 15px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">+</button>
              </div>
            </div>

            <!-- Added Passengers List -->
            <div>
              <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: block;">Passageiros Confirmados ({{ startTripForm.passengers.length }})</label>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; max-height: 130px; overflow-y: auto; padding: 2px;">
                <div v-for="(pass, index) in startTripForm.passengers" :key="index" style="display: flex; align-items: center; gap: 6px; background: rgba(147, 51, 234, 0.06); border: 1px solid rgba(147, 51, 234, 0.15); color: #7c3aed; padding: 6px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; box-shadow: 0 1px 3px rgba(147, 51, 234, 0.05);">
                  <span>{{ pass.name }} <span style="opacity: 0.65; font-size: 10px; font-weight: 500;">({{ pass.role.replace(' 🧭','').replace(' 🚗','') }})</span></span>
                  <button @click="removeModalPassenger(index)" style="background: none; border: none; color: #7c3aed; cursor: pointer; font-size: 13px; font-weight: 700; padding: 0 2px; line-height: 1;">×</button>
                </div>
                <div v-if="startTripForm.passengers.length === 0" style="font-size: 12px; color: #94a3b8; font-style: italic;">Nenhum passageiro adicionado ainda.</div>
              </div>
            </div>
          </div>

          <!-- Save Current settings as Preset -->
          <div style="background: rgba(255,255,255,0.45); border: 1px solid rgba(226, 232, 240, 0.7); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; margin-top: auto;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Space Grotesk', sans-serif;">💾 Salvar Preset de Rota</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input 
                v-model="newPresetName" 
                type="text" 
                placeholder="Nome do preset (ex: Trabalho)..." 
                style="flex: 1; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.25); background: white; font-size: 12px; outline: none; font-family: 'Space Grotesk', sans-serif;" 
              />
              <button @click="saveCurrentAsPreset" style="padding: 10px 16px; border-radius: 12px; border: 1px solid #3b82f6; background: transparent; color: #3b82f6; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s;" class="save-preset-btn">Salvar</button>
            </div>
          </div>
        </div>

      </div>

      <!-- Action Footer -->
      <div style="display: flex; gap: 14px; justify-content: flex-end; margin-top: 24px; border-top: 1px solid rgba(226, 232, 240, 0.6); padding-top: 18px;">
        <button @click="showStartTripModal = false" style="padding: 12px 26px; border-radius: 99px; border: none; background: #f1f5f9; color: #475569; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-family: 'Space Grotesk', sans-serif;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">Cancelar</button>
        <button @click="confirmStartTrip" style="padding: 12px 32px; border-radius: 99px; border: none; background: #10b981; color: white; font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25); transition: all 0.2s; font-family: 'Space Grotesk', sans-serif;" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">🚀 Iniciar Viagem</button>
      </div>

    </div>
  </div>

  <!-- QR Code Share Dialog -->
  <div v-if="showQrCodeModal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);">
    <div class="glass" style="max-width: 360px; width: 90%; padding: 28px; display: flex; flex-direction: column; align-items: center; gap: 20px; background: rgba(255,255,255,0.95); box-shadow: 0 10px 25px rgba(0,0,0,0.15); text-align: center;">
      <h3 style="font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; font-family: 'Space Grotesk', sans-serif;">Conectar Passageiro</h3>
      <p style="font-size: 13px; color: #64748b; margin: 0;">Peça para os co-pilotos escanearem o código abaixo para se juntarem a corrida e ganharem Pontos!</p>
      
      <!-- QR Image canvas fallback -->
      <div style="padding: 16px; background: white; border-radius: 16px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center;">
        <img :src="`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrCodeJoinUrl)}`" alt="QR Code de Convite" style="width: 160px; height: 160px; display: block;" />
      </div>

      <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
        <button @click="copyJoinLink" style="width: 100%; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(59, 130, 246, 0.2); background: rgba(59, 130, 246, 0.05); color: #3b82f6; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;" class="copy-join-link-btn">📋 Copiar Link de Convite</button>
        <button @click="showQrCodeModal = false" style="width: 100%; padding: 12px; border-radius: 12px; border: none; background: #3b82f6; color: white; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.3);">Concluído</button>
      </div>
    </div>
  </div>

  <!-- Seat Selection Modal for Passengers -->
  <div v-if="showSeatSelectionModal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);">
    <div class="glass" style="max-width: 360px; width: 90%; padding: 28px; display: flex; flex-direction: column; gap: 20px; background: rgba(255,255,255,0.95); box-shadow: 0 10px 25px rgba(0,0,0,0.15);">
      <h3 style="font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; font-family: 'Space Grotesk', sans-serif;">Entrar na Corrida</h3>
      <p style="font-size: 13px; color: #64748b; margin: 0;">Você foi convidado para se juntar à corrida ativa! Escolha o seu assento no veículo:</p>
      
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <label style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Assento</label>
        <select v-model="selectedSeat" style="width: 100%; padding: 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: white; font-size: 14px; outline: none; cursor: pointer;">
          <option value="Co-piloto 🧭">Co-piloto 🧭</option>
          <option value="Traseiro Esq. 🚗">Traseiro Esq. 🚗</option>
          <option value="Traseiro Dir. 🚗">Traseiro Dir. 🚗</option>
          <option value="Traseiro Meio 🚗">Traseiro Meio 🚗</option>
        </select>
      </div>

      <div style="display: flex; gap: 10px; width: 100%; margin-top: 6px;">
        <button @click="closeSeatSelection" style="flex: 1; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(0,0,0,0.1); background: white; font-size: 13px; font-weight: 700; cursor: pointer; color: #64748b;">Recusar</button>
        <button @click="confirmSeatSelection" style="flex: 1; padding: 12px; border-radius: 12px; border: none; background: #10b981; color: white; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(16,185,129,0.35);">Confirmar Entrada</button>
      </div>
    </div>
  </div>

  <!-- Trophy Details Zoom Modal -->
  <transition name="trophy-zoom">
    <div v-if="showTrophyDetailsModal && selectedTrophy" class="trophy-details-overlay" @click.self="showTrophyDetailsModal = false">
      <div class="trophy-details-card" :style="selectedTrophy.firstWinner?.id === userId ? { border: '2px solid #fbbf24', background: 'linear-gradient(to bottom, #fffbeb, #fef3c7)' } : {}">
        <button class="trophy-close" @click="showTrophyDetailsModal = false">✕</button>

        <div class="trophy-emoji-large" :style="{ color: selectedTrophy.glowColor || '#eab308' }">
          <span v-if="selectedTrophy.firstWinner?.id === userId" class="modal-crown">👑</span>
          {{ selectedTrophy.emoji || '🏆' }}
        </div>
        
        <h3 class="trophy-title" :style="selectedTrophy.firstWinner?.id === userId ? { color: '#b45309' } : {}">
          {{ selectedTrophy.title || selectedTrophy.name }}
        </h3>
        
        <p class="trophy-desc">{{ selectedTrophy.description }}</p>

        <div v-if="selectedTrophy.firstWinner" class="trophy-first-winner-badge">
          👑 Primeiro a conquistar: <span class="first-winner-name">{{ selectedTrophy.firstWinner.username }}</span>
        </div>
      </div>
    </div>
  </transition>

  <!-- Public Profile Modal -->
  <div v-if="showPublicProfile" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);">
    <div v-if="isLoadingProfile" style="color: white; font-weight: bold; font-size: 16px;">Carregando perfil...</div>
    <div v-else-if="publicProfileData" class="glass public-profile-modal" style="max-width: 750px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 32px; display: flex; flex-direction: column; gap: 24px; background: rgba(255,255,255,0.95); box-shadow: 0 12px 30px rgba(0,0,0,0.2); position: relative;">
      
      <!-- Close button -->
      <button @click="closePublicProfile" style="position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 16px; background: rgba(0,0,0,0.1); border: none; font-size: 14px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; font-weight: bold;">✕</button>

      <!-- View Full Profile button -->
      <button @click="viewFullProfile(publicProfileData)" style="position: absolute; top: 16px; left: 16px; width: 32px; height: 32px; border-radius: 16px; background: rgba(255,255,255,0.85); border: 1px solid rgba(0,0,0,0.15); font-size: 14px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; font-weight: bold;" title="Ver Perfil Completo">👤</button>

      <!-- Banner & Profile Identity (nested to guarantee background coverage on stacked mobile layouts) -->
      <div 
        class="profile-banner-container" 
        style="position: relative; margin-top: -32px; margin-left: -32px; margin-right: -32px; border-radius: 28px 28px 0 0; overflow: hidden; display: flex; align-items: flex-end; justify-content: flex-start; padding: 24px; min-height: 180px; z-index: 1; background-size: cover; background-position: center;"
        :style="publicProfileData.bannerUrl ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.85) 100%), url(${getFullUrl(publicProfileData.bannerUrl)})`, backgroundPositionY: publicProfileData.bannerPositionY || '50%' } : { backgroundColor: '#475569', backgroundImage: 'linear-gradient(135deg, #1e293b, #475569)' }"
      >
        <!-- Profile Identity inside the banner -->
        <div class="profile-identity" style="position: relative; z-index: 3; align-items: flex-end; gap: 16px; width: 100%;">
          <div class="avatar-wrapper">
            <div class="avatar-box" style="position: relative; overflow: hidden; border: none; border-radius: 24px; width: 96px; height: 96px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); background: #f1f5f9;">
              <img v-if="publicProfileData.avatarUrl" :src="getFullUrl(publicProfileData.avatarUrl)" style="width: 100%; height: 100%; object-fit: cover;" />
              <svg v-else fill="currentColor" viewBox="0 0 24 24" style="width: 48px; height: 48px; color: #94a3b8;">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          </div>
          
          <div class="profile-details-box" style="background: rgba(0, 0, 0, 0.45); padding: 10px 16px; border-radius: 16px; backdrop-filter: blur(8px); display: flex; flex-direction: column; gap: 4px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 2px;">
            <div class="username-row" style="margin: 0; display: flex; align-items: center; flex-wrap: wrap;">
              <h1 :style="{ color: publicProfileData.profileTextColor || '#ffffff' }" style="font-size: 22px; font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,0.5); margin: 0; line-height: 1.2;">{{ publicProfileData.username }}</h1>
              <span class="id-badge" style="color: #ffffff; background: rgba(255,255,255,0.2); padding: 1px 5px; border-radius: 4px; font-size: 10px; margin-left: 8px;">ID: {{ publicProfileData.id }}</span>
            </div>
            
            <div class="profile-tags-wrapper" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px;">
              <div 
                v-for="(tag, idx) in publicProfileData.customTags" 
                :key="idx" 
                :style="{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '40' }"
                style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1.5px solid; display: flex; align-items: center; gap: 6px;"
              >
                <span>{{ tag.text }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Content sections (Bio and Achievements) positioned correctly below the banner -->
      <div style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
        <!-- Bio -->
        <div>
          <h2 class="profile-section-title">Biografia</h2>
          <div class="bio-box" style="padding: 12px; background: rgba(0,0,0,0.03); border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
            <p class="bio-text" style="color: #475569; font-style: italic;">"{{ publicProfileData.bio || 'Sem biografia disponível.' }}"</p>
          </div>
        </div>

        <!-- Conquistas em Destaque (Perfil Público) -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <h2 class="profile-section-title">Conquistas em Destaque</h2>
          <div style="padding: 10px; background: rgba(255,255,255,0.4); border: 1px solid rgba(0,0,0,0.05); border-radius: 20px; display: flex; align-items: center; justify-content: center; min-height: 96px; box-sizing: border-box; width: 100%;">
            <div class="badge-list public-highlights-grid" v-if="publicHighlightedAchievementsData.length > 0">
              <div 
                class="badge-item" 
                v-for="ach in publicHighlightedAchievementsData" 
                :key="ach.id"
                @mousemove="handleTrophyHover"
                @mouseleave="resetTrophyHover"
                :style="getPublicBadgeStyle(ach, publicProfileData.id)"
              >
                <div :style="{ color: getRarityColor(ach.glowColor) }" style="font-size: 1.8rem; position: relative; pointer-events: none; display: flex; align-items: center; justify-content: center;">
                  <span v-if="ach.firstWinner && String(ach.firstWinner.id) === String(publicProfileData.id)" style="position: absolute; top: -6px; right: -6px; font-size: 9px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); z-index: 2;">👑</span>
                  {{ ach.emoji || '🏆' }}
                </div>
              </div>
            </div>
            <div v-else style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 100%;">
              <span style="font-size: 20px; color: #cbd5e1;">🏆</span>
              <p style="font-style: italic; font-size: 11px; color: #94a3b8; margin: 0;">Nenhuma conquista em destaque.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Toasts -->
  <div v-if="toasts.length > 0" style="position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 12px; z-index: 9999;">
    <div v-for="t in toasts" :key="t.id" style="background: rgba(15, 23, 42, 0.9); color: white; padding: 14px 20px; border-radius: 12px; font-size: 14px; font-weight: 500; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      {{ t.msg }}
    </div>
  </div>
</template>

<style>
@import "../styles/dashboard.css";

.tag-preset-color-btn:hover {
  transform: scale(1.15);
}
.delete-preset-btn:hover {
  color: #ef4444 !important;
}
.user-suggestion-item:hover {
  background-color: #f1f5f9;
}
.save-preset-btn:hover {
  background: #3b82f6 !important;
  color: white !important;
}
.copy-join-link-btn:hover {
  background: rgba(59, 130, 246, 0.1) !important;
}
</style>
