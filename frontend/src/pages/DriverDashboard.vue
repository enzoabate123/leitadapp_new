<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { io } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { sfxSuccess, sfxError, sfxNavigate, sfxModalOpen, sfxModalClose } from '../sounds';

// Autenticação e API
const API_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

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
    totalPassengers.value = data.totalPassengers || 0;
    tripsCount.value = data.tripsCount || 0;
    bio.value = data.bio || '';
    avatarUrl.value = data.avatarUrl || '';
    bannerUrl.value = data.bannerUrl || '';
    bannerPositionY.value = data.bannerPositionY || '50%';
    profileTextColor.value = data.profileTextColor || '#ffffff';
    try {
      customTags.value = typeof data.customTags === 'string' ? JSON.parse(data.customTags || '[]') : (data.customTags || []);
    } catch (_) {
      customTags.value = [];
    }
    try {
      highlightedAchievements.value = typeof data.highlightedAchievements === 'string' ? JSON.parse(data.highlightedAchievements || '[]') : (data.highlightedAchievements || []);
    } catch (_) {
      highlightedAchievements.value = [];
    }
    if (data.settings) {
      pushNotifications.value = data.settings.pushNotifications;
      xpAlerts.value = data.settings.xpAlerts;
      socialRanking.value = data.settings.socialRanking;
      publicProfile.value = data.settings.publicProfile;
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function handleAuth() {
  try {
    authError.value = '';
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

async function fetchRanking() {
  try {
    const data = await apiFetch('/api/ranking');
    rankingList.value = data.map(d => ({ 
      pos: d.rank, 
      userId: d.userId,
      name: d.username, 
      pts: d.totalPoints,
      avatarUrl: d.avatarUrl,
      customTags: typeof d.customTags === 'string' && d.customTags.length > 0 ? JSON.parse(d.customTags) : [],
      tripsCount: d.tripsCount,
      totalDistance: d.totalDistance,
      active: d.userId === userId.value 
    }));
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

async function toggleSetting(key) {
  let val = false;
  if (key === 'pushNotifications') { pushNotifications.value = !pushNotifications.value; val = pushNotifications.value; }
  if (key === 'xpAlerts') { xpAlerts.value = !xpAlerts.value; val = xpAlerts.value; }
  if (key === 'socialRanking') { socialRanking.value = !socialRanking.value; val = socialRanking.value; }
  if (key === 'publicProfile') { publicProfile.value = !publicProfile.value; val = publicProfile.value; }
  
  try {
    await apiFetch('/api/settings', { method: 'POST', body: JSON.stringify({ [key]: val }) });
  } catch (e) {
    console.error(e);
  }
}

// Simulação de Viagem
const tripActive = ref(false);
const tripStartTime = ref(0);
const tripDistance = ref(0);
let tripInterval = null;

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
  if (tripInterval) clearInterval(tripInterval);
  tripInterval = setInterval(() => {
    tripDistance.value += (speed.value / 3600); // speed is km/h, increment per second
    if (socket && socket.connected) {
      socket.emit('update-trip', {
        distanceKm: Number(tripDistance.value.toFixed(2)),
        speed: speed.value,
        rpm: rpm.value,
        battery: battery.value
      });
    }
  }, 1000);
}

async function endTrip() {
  tripActive.value = false;
  clearInterval(tripInterval);
  const durationMs = Date.now() - tripStartTime.value;
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  const durationSec = Math.round(durationMs / 1000);
  const distKm = Number(tripDistance.value.toFixed(2));
  
  const tripPayload = {
    distanceKm: distKm,
    durationMin,
    durationSec,
    avgSpeed: speed.value,
    passengerCount: passengers.value.length,
    startLocation: startTripForm.value.departure || (activeTrip.value ? activeTrip.value.departure : null),
    endLocation: startTripForm.value.destination || (activeTrip.value ? activeTrip.value.destination : null)
  };

  if (!navigator.onLine) {
    queueOfflineTrip(tripPayload);
    showToast('Sem conexão com a internet. Corrida salva offline!');
    if (socket && socket.connected) {
      socket.emit('end-trip');
    }
    resetMap();
    activeTrip.value = null;
    return;
  }

  try {
    const data = await apiFetch('/api/trips', {
      method: 'POST',
      body: JSON.stringify(tripPayload)
    });
    
    showToast(`Viagem finalizada! +${data.xpEarned} XP`);
    
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
    resetMap();
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
    if (publicProfileData.value.customTags) {
      publicProfileData.value.customTags = typeof data.customTags === 'string' ? JSON.parse(data.customTags) : data.customTags;
    }
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

// Estado da Conexão WebSocket
const socketStatus = ref('Conectando...');
const lastPing = ref('-');

// Dados do Usuário
const username = ref('Carregando...');
const userTag = ref('0000');
const userId = ref('');
const email = ref('');
const points = ref(0);
const nextLevelPoints = ref(1000);
const level = ref(1);

// Estatísticas do Usuário
const totalKm = ref(0);
const totalHours = ref(0);
const longestTripKm = ref(0);
const totalPassengers = ref(0);
const tripsCount = ref(0);
const achievementsCount = ref(0);
const totalAchievements = ref(15);
const achievementsList = ref([]);

// Telemetria do Veículo
const speed = ref(85);
const rpm = ref(2800);
const battery = ref(92);

// Dados do Painel / Música
const currentSong = ref('Midnight City');
const currentArtist = ref('M83');
const isPlaying = ref(true);

// Passageiros
const passengers = ref([
  { name: 'Marina', role: 'Co-piloto', status: '⚡ 120 XP' },
  { name: 'Enzo', role: 'Traseiro Esq.', status: '💤 Silencioso' }
]);
const showAddPassengerForm = ref(false);
const newPassengerName = ref('');
const newPassengerRole = ref('');

function addPassenger() {
  if (newPassengerName.value.trim() && newPassengerRole.value.trim()) {
    passengers.value.push({
      name: newPassengerName.value.trim(),
      role: newPassengerRole.value.trim(),
      status: '⚡ 0 XP'
    });
    newPassengerName.value = '';
    newPassengerRole.value = '';
    showAddPassengerForm.value = false;
  }
}

function removePassenger(index) {
  passengers.value.splice(index, 1);
}

// Ranking
const rankingList = ref([]);
const activeTrip = ref(null);
const isSyncingOffline = ref(false);

const activeSuggestions = ref({ field: null, index: null, list: [] });
let searchTimeout = null;

const availableUsersForPassengers = computed(() => {
  if (!rankingList.value) return [];
  return rankingList.value.filter(u => u.name !== username.value);
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
      activeSuggestions.value = {
        field,
        index,
        list: data.map(item => ({
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon)
        }))
      };
    } catch (err) {
      console.error('Error fetching suggestions:', err);
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
  passengers: []
});
const newModalPassenger = ref({ name: '', role: '' });
const savedPresets = ref([]);
const newPresetName = ref('');

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
        destination: 'Sede Commute Quest',
        stops: [],
        passengers: [
          { name: 'Marina', role: 'Co-piloto 🧭', status: '⚡ 120 XP' },
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
    destination: startTripForm.value.destination,
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
  startTripForm.value.departureCoords = null;
  startTripForm.value.destination = preset.destination;
  startTripForm.value.destinationCoords = null;
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
      status: '⚡ 0 XP'
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

async function confirmStartTrip() {
  // Auto-add any passenger currently selected but not added via "+"
  if (newModalPassenger.value.name && newModalPassenger.value.role) {
    const nameExists = startTripForm.value.passengers.some(p => p.name === newModalPassenger.value.name);
    if (!nameExists) {
      startTripForm.value.passengers.push({
        name: newModalPassenger.value.name,
        role: newModalPassenger.value.role,
        status: '⚡ 0 XP'
      });
    }
    newModalPassenger.value = { name: '', role: '' };
  }

  if (!startTripForm.value.departure.trim() || !startTripForm.value.destination.trim()) {
    showToast('Informe a partida e o destino');
    return;
  }

  isGeocoding.value = true;
  showToast('Geocodificando endereços e calculando rota...');

  let startLat = -23.55052;
  let startLon = -46.633308;
  let endLat = -23.55552;
  let endLon = -46.638308;

  // Resolve departure coords
  if (startTripForm.value.departureCoords) {
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
    startTime: tripStartTimeValue
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
      startTime: tripStartTimeValue
    });
  }
  
  tripActive.value = true;
  tripStartTime.value = tripStartTimeValue;
  tripDistance.value = 0;

  updateMapRoute(startLat, startLon, endLat, endLon, 0, routeData.routeCoords, coordsList);
  
  if (tripInterval) clearInterval(tripInterval);
  tripInterval = setInterval(() => {
    tripDistance.value += (speed.value / 3600);
    updateCarMarkerPosition(startLat, startLon, endLat, endLon, tripDistance.value, routeData.routeCoords);
    
    if (socket && socket.connected) {
      socket.emit('update-trip', {
        distanceKm: Number(tripDistance.value.toFixed(2)),
        speed: speed.value,
        rpm: rpm.value,
        battery: battery.value
      });
    }
  }, 1000);
  
  showStartTripModal.value = false;
  showQrCodeModal.value = true;
  showToast('Corrida iniciada! Compartilhe o QR Code para conectar passageiros.');
}

function getPassengerLiveStatus(pass) {
  if (!tripActive.value || !tripStartTime.value) return pass.status || '⚡ 0 XP';
  const elapsedSec = Math.max(0, Math.floor((Date.now() - tripStartTime.value) / 1000));
  const tripXP = elapsedSec + Math.round(tripDistance.value * 1000);
  return `⚡ ${tripXP} XP`;
}

// Configurações
const pushNotifications = ref(true);
const xpAlerts = ref(true);
const socialRanking = ref(false);
const publicProfile = ref(true);

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
      let fallbackUrl = '';
      if (bgType === 'bliss') {
        fallbackUrl = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80';
      } else if (bgType === 'aqua') {
        fallbackUrl = 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1920&q=80';
      } else if (bgType === 'space') {
        fallbackUrl = 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=1920&q=80';
      } else if (bgType === 'sunset') {
        fallbackUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80';
      }

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
const pendingHighlights = ref([]);
const isEditingProfile = ref(false);
const showTrophyDetailsModal = ref(false);
const selectedTrophy = ref(null);

function selectTrophy(ach) {
  selectedTrophy.value = ach;
  showTrophyDetailsModal.value = true;
}

function handleTrophyHover(e) {
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
  const card = e.currentTarget;
  card.style.transform = 'perspective(300px) rotateX(0deg) rotateY(0deg) scale(1) translateY(0)';
  card.style.boxShadow = '';
}

const highlightedAchievementsData = computed(() => {
  return highlightedAchievements.value.map(id => achievementsList.value.find(a => a.id === id)).filter(Boolean);
});

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

function promptEditBio() {
  const newBio = prompt('Digite a sua biografia:', bio.value);
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
      if (changes.bio !== undefined) bio.value = data.user.bio || '';
      if (changes.avatarUrl !== undefined) avatarUrl.value = data.user.avatarUrl || '';
      if (changes.bannerUrl !== undefined) bannerUrl.value = data.user.bannerUrl || '';
      if (changes.bannerPositionY !== undefined) bannerPositionY.value = data.user.bannerPositionY || '50%';
      if (changes.profileTextColor !== undefined) profileTextColor.value = data.user.profileTextColor || '#ffffff';
      if (changes.customTags !== undefined) {
        customTags.value = typeof data.user.customTags === 'string' ? JSON.parse(data.user.customTags || '[]') : (data.user.customTags || []);
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
  pendingHighlights.value = [...highlightedAchievements.value];
  showHighlightsModal.value = true;
}

function toggleHighlight(achId) {
  const idx = pendingHighlights.value.indexOf(achId);
  if (idx === -1) {
    if (pendingHighlights.value.length < 3) {
      pendingHighlights.value.push(achId);
    }
  } else {
    pendingHighlights.value.splice(idx, 1);
  }
}

function confirmHighlights() {
  highlightedAchievements.value = [...pendingHighlights.value];
  showHighlightsModal.value = false;
  saveProfileChanges({ highlightedAchievements: highlightedAchievements.value });
}

// Referências do Mapa
const mapContainer = ref(null);
const map = ref(null);
let carMarker = null;
let departureMarker = null;
let destinationMarker = null;
let routeLine = null;
const totalRouteDistance = ref(0);
const isGeocoding = ref(false);

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

async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CommuteQuestDashboard/1.0'
      }
    });
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
  } catch (err) {
    console.error('Geocoding error:', err);
  }
  return null;
}

let stopMarkers = [];

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

async function fetchOSRMRoute(coordsList) {
  try {
    const formattedPoints = coordsList.map(pt => `${pt[1]},${pt[0]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${formattedPoints}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM request failed');
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const routeCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const etaMinutes = Math.round(route.duration / 60);
      const routeDistanceKm = Number((route.distance / 1000).toFixed(2));
      
      const steps = [];
      if (route.legs && route.legs.length > 0) {
        for (const leg of route.legs) {
          if (leg.steps) {
            for (const step of leg.steps) {
              steps.push({
                name: step.name || '',
                distanceKm: step.distance / 1000
              });
            }
          }
        }
      }
      
      return {
        routeCoords,
        etaMinutes,
        routeDistanceKm,
        routeSteps: steps
      };
    }
  } catch (err) {
    console.error('OSRM Routing error, falling back to straight line:', err);
  }
  
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

function updateMapRoute(startLat, startLon, endLat, endLon, currentDistance, routeCoords = [], keypoints = []) {
  if (!map.value) return;

  if (departureMarker) map.value.removeLayer(departureMarker);
  if (destinationMarker) map.value.removeLayer(destinationMarker);
  if (routeLine) map.value.removeLayer(routeLine);
  
  if (stopMarkers && stopMarkers.length > 0) {
    stopMarkers.forEach(m => map.value.removeLayer(m));
  }
  stopMarkers = [];

  totalRouteDistance.value = calculateDistance(startLat, startLon, endLat, endLon);

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

  // Plot intermediate stop markers if they exist
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

function updateCarMarkerPosition(startLat, startLon, endLat, endLon, currentDistance, routeCoords = []) {
  if (!map.value || !carMarker) return;

  let lat = startLat;
  let lon = startLon;

  if (routeCoords && routeCoords.length > 0) {
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
}

function resetMap() {
  if (!map.value) return;

  if (departureMarker) { map.value.removeLayer(departureMarker); departureMarker = null; }
  if (destinationMarker) { map.value.removeLayer(destinationMarker); destinationMarker = null; }
  if (routeLine) { map.value.removeLayer(routeLine); routeLine = null; }

  if (stopMarkers && stopMarkers.length > 0) {
    stopMarkers.forEach(m => map.value.removeLayer(m));
  }
  stopMarkers = [];

  if (carMarker) {
    carMarker.setLatLng([-23.55052, -46.633308]);
  }

  map.value.setView([-23.55052, -46.633308], 15);
}

let socket = null;
let teleInterval = null;
let resizeObserver = null;

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
    showToast(`🏆 Conquista desbloqueada: ${ach.title} ${ach.emoji}`);
    fetchMe();
  });

  socket.on('current-trip-state', (data) => {
    activeTrip.value = data;
    tripActive.value = true;
    tripDistance.value = data.distanceKm;
    speed.value = data.speed;
    rpm.value = data.rpm;
    battery.value = data.battery;
    passengers.value = data.passengers || [];
    
    if (data.startLat != null && data.startLon != null && data.endLat != null && data.endLon != null) {
      setTimeout(() => {
        updateMapRoute(data.startLat, data.startLon, data.endLat, data.endLon, data.distanceKm, data.routeCoords || [], data.keypoints || []);
      }, 500);
    }
    
    if (data.driverId === userId.value) {
      tripStartTime.value = data.startTime || (Date.now() - (data.distanceKm / (data.speed / 3600)) * 1000);
      if (tripInterval) clearInterval(tripInterval);
      tripInterval = setInterval(() => {
        tripDistance.value += (speed.value / 3600);
        if (data.startLat != null && data.startLon != null && data.endLat != null && data.endLon != null) {
          updateCarMarkerPosition(data.startLat, data.startLon, data.endLat, data.endLon, tripDistance.value, data.routeCoords || []);
        }
        if (socket && socket.connected) {
          socket.emit('update-trip', {
            distanceKm: Number(tripDistance.value.toFixed(2)),
            speed: speed.value,
            rpm: rpm.value,
            battery: battery.value
          });
        }
      }, 1000);
    }
  });

  socket.on('trip-started', (data) => {
    activeTrip.value = data;
    tripActive.value = true;
    passengers.value = data.passengers || [];
    if (data.driverId !== userId.value) {
      tripDistance.value = 0;
    }
    if (data.startLat != null && data.startLon != null && data.endLat != null && data.endLon != null) {
      updateMapRoute(data.startLat, data.startLon, data.endLat, data.endLon, 0, data.routeCoords || [], data.keypoints || []);
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
      if (data.startLat != null && data.startLon != null && data.endLat != null && data.endLon != null) {
        updateCarMarkerPosition(data.startLat, data.startLon, data.endLat, data.endLon, data.distanceKm, data.routeCoords || []);
      }
    }
  });

  socket.on('trip-ended', () => {
    activeTrip.value = null;
    tripActive.value = false;
    if (tripInterval) {
      clearInterval(tripInterval);
      tripInterval = null;
    }
    resetMap();
  });

  fetchRanking();
  fetchAchievements();
  fetchBackgrounds();

  window.addEventListener('online', syncOfflineTrips);
  syncOfflineTrips();

  if (teleInterval) clearInterval(teleInterval);
  teleInterval = setInterval(() => {
    if (isPlaying.value) {
      speed.value = Math.max(60, Math.min(140, speed.value + Math.floor(Math.random() * 5) - 2));
      rpm.value = Math.max(2000, Math.min(4500, rpm.value + Math.floor(Math.random() * 200) - 100));
    }
  }, 1000);

  if (mapContainer.value && !map.value) {
    map.value = L.map(mapContainer.value, {
      zoomControl: false,
      attributionControl: false
    }).setView([-23.55052, -46.633308], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map.value);

    const carIcon = L.divIcon({
      className: 'custom-map-marker',
      html: '<div style="font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8)); transform: translate(-14px, -14px);">🏎️</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    carMarker = L.marker([-23.55052, -46.633308], { icon: carIcon }).addTo(map.value);

    resizeObserver = new ResizeObserver(() => {
      if (map.value) {
        map.value.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainer.value);
  }
}

function closeSelectDropdown(e) {
  if (userSelectContainer.value && !userSelectContainer.value.contains(e.target)) {
    showUserSelectMenu.value = false;
  }
}

onMounted(async () => {
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('click', closeSelectDropdown);
  applyBackground(appBgType.value, appCustomBgUrl.value);
  
  // Check for join parameter on mount
  const urlParams = new URLSearchParams(window.location.search);
  const joinTripDriverId = urlParams.get('joinTrip');
  if (joinTripDriverId) {
    pendingJoinTripDriverId.value = joinTripDriverId;
    showSeatSelectionModal.value = true;
  }

  if (token.value) {
    const success = await fetchMe();
    if (success) {
      isAuthenticated.value = true;
      await nextTick();
      initDashboard();
    } else {
      token.value = '';
      localStorage.removeItem('token');
    }
  }
});

function cleanupDashboard() {
  if (socket) socket.disconnect();
  if (teleInterval) clearInterval(teleInterval);
  if (tripInterval) clearInterval(tripInterval);
  if (resizeObserver) resizeObserver.disconnect();
  window.removeEventListener('online', syncOfflineTrips);
  window.removeEventListener('click', closeSelectDropdown);
  if (map.value) {
    map.value.remove();
    map.value = null;
  }
}

onUnmounted(() => {
  cleanupDashboard();
  window.removeEventListener('storage', handleStorageChange);
});

function navigate(page) {
  activePage.value = page;
  if (page === 'home' || page === 'ranking') fetchRanking();
  if (page === 'achievements') fetchAchievements();
}

function togglePlay() {
  isPlaying.value = !isPlaying.value;
}

function handleLogout() {
  cleanupDashboard();
  localStorage.removeItem('token');
  token.value = '';
  isAuthenticated.value = false;
  activePage.value = 'home';
}
// Banner Drag Logic
const isDraggingBanner = ref(false);
const dragStartY = ref(0);
const startBannerY = ref(0);

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

// SFX watches
watch(activePage, () => {
  sfxNavigate();
});

// Watch modals to play open/close sounds
const modalsToWatch = [
  { ref: showHighlightsModal, name: 'showHighlightsModal' },
  { ref: showTagModal, name: 'showTagModal' },
  { ref: showTrophyDetailsModal, name: 'showTrophyDetailsModal' },
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
  <div v-if="!isAuthenticated" class="glass login-screen" style="max-width: 400px; margin: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; gap: 20px;">
    <h1 class="title-main" style="text-align: center;">{{ authMode === 'login' ? 'Bem-vindo de volta' : 'Criar Conta' }}</h1>
    <p class="subtitle-meta" style="text-align: center; margin-bottom: 20px;">{{ authMode === 'login' ? 'Entre para continuar' : 'Junte-se à jornada' }}</p>
    
    <form @submit.prevent="handleAuth" style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">Usuário</label>
        <input v-model="authForm.username" type="text" required placeholder="Ex: Astrea" style="padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 14px; outline: none; transition: all 0.2s; width: 100%; box-sizing: border-box;" />
      </div>
      <div v-if="authMode === 'register'" style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">E-mail</label>
        <input v-model="authForm.email" type="email" required placeholder="astrea@email.com" style="padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 14px; outline: none; transition: all 0.2s; width: 100%; box-sizing: border-box;" />
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">Senha</label>
        <input v-model="authForm.password" type="password" required placeholder="••••••••" style="padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 14px; outline: none; transition: all 0.2s; width: 100%; box-sizing: border-box;" />
      </div>

      <p v-if="authError" style="color: #ef4444; font-size: 13px; font-weight: 500; text-align: center; margin: 0;">{{ authError }}</p>

      <button type="submit" style="margin-top: 10px; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; font-weight: 700; font-size: 16px; cursor: pointer; transition: opacity 0.2s; width: 100%;">
        {{ authMode === 'login' ? 'Entrar' : 'Registrar' }}
      </button>
    </form>

    <p style="margin-top: 24px; font-size: 13px; color: #64748b; text-align: center;">
      {{ authMode === 'login' ? 'Não tem uma conta?' : 'Já possui uma conta?' }}
      <span @click="authMode = authMode === 'login' ? 'register' : 'login'" style="color: #3b82f6; font-weight: 600; cursor: pointer; margin-left: 4px;">
        {{ authMode === 'login' ? 'Registre-se' : 'Faça login' }}
      </span>
    </p>
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

      <!-- ===== HOME PAGE (Grid 3x3) ===== -->
      <div :class="['page', activePage === 'home' ? 'active' : '']" id="page-home">
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
                <button v-if="!tripActive" @click="openStartTripModal" class="trip-btn start premium-floating-btn">
                  <span class="btn-icon">▶</span> Iniciar Corrida
                </button>
                <button v-else @click="endTrip" class="trip-btn stop premium-floating-btn">
                  <span class="btn-icon">■</span> Parar ({{ tripDistance.toFixed(2) }}km)
                </button>
              </div>

              <!-- Premium Floating QR Code Widget Button (Admin only, visible when trip active) -->
              <div v-if="userRole === 'admin' && tripActive" class="map-floating-qr-widget">
                <button @click="showQrCodeModal = true" class="qr-widget-btn" title="Exibir QR Code da Corrida">
                  📱 QR
                </button>
              </div>

              <!-- Premium Floating Music Widget (Admin only) -->
              <div v-if="userRole === 'admin'" class="map-floating-music">
                <div class="music-content-compact">
                  <div class="music-disc-compact" :class="{ spinning: isPlaying }">🎵</div>
                  <div class="music-info-compact">
                    <p class="song-title-compact">{{ currentSong }}</p>
                    <p class="artist-name-compact">{{ currentArtist }}</p>
                  </div>
                  <button class="music-btn-compact" @click="togglePlay">
                    <span v-if="isPlaying">⏸️</span>
                    <span v-else>▶️</span>
                  </button>
                </div>
                <div class="music-progress-compact">
                  <div class="music-progress-bar-compact" :style="{ width: isPlaying ? '45%' : '20%' }"></div>
                </div>
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
                <div 
                  v-for="rank in activeRankingList" 
                  :key="rank.userId" 
                  @click="openPublicProfile(rank.userId)"
                  :class="['ranking-row', rank.active ? 'active-user' : '']"
                >
                  <!-- Left side: Position + Avatar + Name & Tags -->
                  <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                    <!-- Position -->
                    <span style="font-weight: 800; font-size: 13px; color: #64748b; width: 28px; text-align: center; flex-shrink: 0;">{{ rank.pos }}º</span>
                    
                    <!-- Avatar -->
                    <div style="width: 34px; height: 34px; border-radius: 10px; overflow: hidden; background: #e2e8f0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1.5px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                      <img v-if="rank.avatarUrl" :src="getFullUrl(rank.avatarUrl)" style="width: 100%; height: 100%; object-fit: cover;" />
                      <span v-else style="color: #94a3b8; font-size: 14px;">👤</span>
                    </div>

                    <!-- Name and Tags -->
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                      <span style="font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1;">{{ rank.name }}</span>
                      <!-- Tags -->
                      <div v-if="rank.customTags && rank.customTags.length > 0" style="display: flex; gap: 4px; flex-shrink: 0; align-items: center;">
                        <span 
                          v-for="(tag, idx) in rank.customTags.slice(0, 1)" 
                          :key="idx" 
                          :style="{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '30' }" 
                          style="padding: 2px 6px; border-radius: 6px; font-size: 9px; font-weight: 700; border: 0.5px solid; white-space: nowrap; line-height: 1;"
                        >
                          {{ tag.text }}
                        </span>
                        <span v-if="rank.customTags.length > 1" style="font-size: 9px; color: #94a3b8; font-weight: bold; line-height: 1;">+{{ rank.customTags.length - 1 }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Right side: Total Points -->
                  <div style="display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; margin-left: 8px; line-height: 1.1;">
                    <span style="font-size: 14px; font-weight: 800; color: #10b981;">{{ rank.pts.toLocaleString('pt-BR') }}</span>
                    <span style="font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div :class="['page', activePage === 'profile' ? 'active' : '']" id="page-profile" style="position: relative; height: 100%;">
        <!-- Hidden file inputs for uploads -->
        <input type="file" ref="avatarInput" @change="uploadAvatar" accept="image/*" style="display: none;" />
        <input type="file" ref="bannerInput" @change="uploadBanner" accept="image/*" style="display: none;" />

        <!-- Banner & Profile Identity (covers the top 33% of the glass container) -->
        <div style="position: relative; height: 33%; min-height: 180px; margin-top: -28px; margin-left: -28px; margin-right: -28px; border-radius: 36px 36px 0 0; overflow: hidden; display: flex; align-items: flex-end; justify-content: flex-start; padding: 20px;">
          <!-- Profile Banner Background -->
          <div 
            v-if="bannerUrl" 
            style="position: absolute; inset: 0; background-size: cover; z-index: 0; pointer-events: none;"
            :style="{ backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.85) 100%), url(${getFullUrl(bannerUrl)})`, backgroundPositionX: 'center', backgroundPositionY: bannerPositionY }"
          ></div>

          <!-- Banner edit overlay (only when editing) -->
          <div 
            v-if="isEditingProfile" 
            @mousedown="startBannerDrag"
            style="position: absolute; inset: 0; background: rgba(147, 51, 234, 0.15); border: 2px dashed #9333ea; border-radius: 36px 36px 0 0; color: #ffffff; cursor: ns-resize; z-index: 2; transition: background 0.2s;"
            onmouseover="this.style.background='rgba(147, 51, 234, 0.25)'"
            onmouseout="this.style.background='rgba(147, 51, 234, 0.15)'"
          >
            <div style="position: absolute; top: 16px; left: 50%; transform: translateX(-50%); pointer-events: none; font-weight: 800; font-size: 13px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 6px;">
              ↕️ Clique e arraste em qualquer área livre para reposicionar
            </div>
            <button @click.stop="triggerBannerUpload" class="banner-upload-btn" style="position: absolute; top: 12px; right: 12px; cursor: pointer; pointer-events: auto; background: #9333ea; border: none; padding: 6px 12px; border-radius: 8px; font-weight: 700; color: white; box-shadow: 0 2px 8px rgba(147, 51, 234, 0.4);">
              🖼️ Mudar Imagem
            </button>
          </div>

          <!-- Avatar & Name placed in the bottom-left corner of the banner -->
          <div class="profile-identity" style="position: relative; z-index: 3; align-items: flex-end; gap: 16px;">
            <div class="avatar-wrapper" :style="isEditingProfile ? { cursor: 'pointer' } : {}" @click="isEditingProfile ? triggerAvatarUpload() : null">
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
                  @click="isEditingProfile ? editTag(idx) : null"
                >
                  <span>{{ tag.text }}</span>
                  <span v-if="isEditingProfile" @click.stop="deleteTag(idx)" style="cursor: pointer; font-size: 9px; background: rgba(0,0,0,0.2); border-radius: 50%; width: 11px; height: 11px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-left: 2px;">×</span>
                </div>
                <button v-if="isEditingProfile" @click="openAddTagModal" style="padding: 2px 6px; border-radius: 8px; font-size: 9px; font-weight: bold; text-transform: uppercase; border: 1.5px dashed #9333ea; color: #9333ea; background: transparent; cursor: pointer; line-height: 1;">
                  ➕ Tag
                </button>
              </div>
              <!-- Text Color picker when editing -->
              <div v-if="isEditingProfile" style="margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                <label style="font-size: 10px; font-weight: 600; color: #ffffff;">Cor do Texto:</label>
                <input type="color" v-model="profileTextColor" @change="saveProfileChanges({ profileTextColor })" style="width: 20px; height: 20px; border: none; background: none; cursor: pointer; padding: 0;" />
              </div>
            </div>
          </div>
        </div>

        <!-- Scrollable content area below the banner (bottom 2/3) -->
        <div style="flex: 1; padding: 20px 12px; margin-left: -12px; margin-right: -12px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;">
          <!-- Global Metrics Grid (3 columns) -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 4px;">
            <!-- Km -->
            <div class="metric-card">
              <div class="metric-card-icon bg-blue-100" style="color: #2563eb;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ totalKm.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">km</span></p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Distância</span>
            </div>
            <!-- Hours -->
            <div class="metric-card">
              <div class="metric-card-icon bg-emerald-100" style="color: #059669;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ totalHours.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">h</span></p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Tempo</span>
            </div>
            <!-- Points -->
            <div class="metric-card">
              <div class="metric-card-icon bg-orange-100" style="color: #ea580c;">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ displayedPoints.toLocaleString('pt-BR') }}</p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Pontos</span>
            </div>
            <!-- Trips Count -->
            <div class="metric-card">
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
            <div class="metric-card">
              <div class="metric-card-icon bg-indigo-100" style="color: #4f46e5;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ totalPassengers.toLocaleString('pt-BR') }}</p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Caronas</span>
            </div>
            <!-- Longest Trip -->
            <div class="metric-card">
              <div class="metric-card-icon bg-red-100" style="color: #dc2626;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ longestTripKm.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">km</span></p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Maior Viagem</span>
            </div>
          </div>

          <!-- Badges (Destaques) -->
          <div class="driver-profile-body" style="padding-top: 0;">
            <div style="width: 100%; display: flex; flex-direction: column; gap: 24px;">
              <div>
                <div v-if="isEditingProfile" class="flex justify-end items-center" style="margin-bottom:12px">
                  <button class="profile-section-title" style="margin-bottom:0; color:#9333ea; border:none; background:none; cursor:pointer" @click="openHighlightsModal">✏️ Editar Destaques</button>
                </div>
                <div class="badge-list" v-if="highlightedAchievementsData.length > 0" style="flex-wrap: wrap;">
                  <div 
                    class="badge-item" 
                    v-for="ach in highlightedAchievementsData" 
                    :key="ach.id" 
                    @click="selectTrophy(ach)"
                    @mousemove="handleTrophyHover"
                    @mouseleave="resetTrophyHover"
                    :style="ach.firstWinner?.id === userId ? { border: '1.5px solid #fbbf24', background: 'linear-gradient(to bottom, #fffbeb, #fef3c7)', boxShadow: '0 4px 12px rgba(251, 191, 36, 0.15)', cursor: 'pointer', width: '88px', height: '88px' } : { cursor: 'pointer', width: '88px', height: '88px' }"
                  >
                    <div :style="{ color: ach.glowColor || '#eab308' }" style="font-size: 2rem; position: relative; pointer-events: none;">
                      <span v-if="ach.firstWinner?.id === userId" style="position: absolute; top: -8px; right: -12px; font-size: 14px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); z-index: 2;">👑</span>
                      {{ ach.emoji || '🏆' }}
                    </div>
                  </div>
                </div>
                <p v-else style="font-size: 12px; color: #94a3b8; font-style: italic;">Nenhum destaque selecionado.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Floating Edit Button in the bottom-right corner -->
        <div style="position: absolute; bottom: 24px; right: 24px; z-index: 100;">
          <button @click="toggleEditingProfile" :style="{ background: isEditingProfile ? '#10b981' : '#3b82f6', transform: 'scale(1)' }" style="padding: 12px 24px; border-radius: 9999px; border: 1.5px solid rgba(255,255,255,0.5); color: white; font-weight: 700; font-size: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.25); cursor: pointer; display: flex; align-items: center; gap: 8px; outline: none; transition: all 0.22s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            <span v-if="isEditingProfile">💾 Concluir Edição</span>
            <span v-else>✏️ Editar Perfil</span>
          </button>
        </div>
      </div>

      <!-- ===== ACHIEVEMENTS PAGE ===== -->
      <div :class="['page', activePage === 'achievements' ? 'active' : '']" id="page-achievements">
        <div class="flex flex-col h-full gap-5">
          <!-- Header -->
          <div class="achievements-header">
            <div class="achievements-title-block">
              <div class="achievements-icon-box">👑</div>
              <div>
                <h1 class="title-main">Galeria de Prêmios</h1>
                <p style="color:#64748b; font-size:14px; font-weight:500">Colecione todos os selos!</p>
              </div>
            </div>
            <div class="achievements-progress-meta">
              <span class="profile-section-title" style="margin-bottom:0">Nível {{ level }}</span>
              <div class="achievements-progress-bar">
                <div class="progress-fill" style="width:80%"></div>
              </div>
            </div>
          </div>

          <!-- Achievements Grid -->
          <div class="grid grid-cols-5 gap-4 flex-1 overflow-y-auto no-scroll" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; padding: 12px; margin: -12px -12px -12px -12px;">
            <div 
              v-for="ach in achievementsList" 
              :key="ach.id" 
              :class="['ach-card', ach.unlocked ? 'unlocked' : 'locked']"
              style="position: relative;"
            >
              <div v-if="ach.firstWinner" @click.stop="openPublicProfile(ach.firstWinner.id)" class="first-winner-badge" style="position: absolute; top: -12px; right: -12px; z-index: 10; display: flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.98); padding: 4px 8px; border-radius: 20px; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4); border: 2px solid #fbbf24; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <img v-if="ach.firstWinner.avatarUrl" :src="getFullUrl(ach.firstWinner.avatarUrl)" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid #fbbf24;" />
                <span style="font-size: 9px; font-weight: 800; color: #b45309; text-transform: uppercase;">{{ ach.firstWinner.username }}</span>
                <span style="font-size: 10px;">👑</span>
              </div>
              <div class="ach-icon-wrapper">
                <div v-if="ach.unlocked && ach.glowColor" :class="['ach-glow', ach.glowColor]"></div>
                <span class="ach-emoji">{{ ach.emoji || '❓' }}</span>
                <div class="ach-star-badge" v-if="ach.unlocked">⭐</div>
              </div>
              <h3 class="ach-title">{{ ach.title }}</h3>
              <p class="ach-desc">{{ ach.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== RANKING PAGE ===== -->
      <div :class="['page', activePage === 'ranking' ? 'active' : '']" id="page-ranking">
        <div class="flex flex-col h-full gap-5">
          <!-- Header -->
          <div class="achievements-header">
            <div class="achievements-title-block">
              <div class="achievements-icon-box" style="background-color: #fef08a;">🏆</div>
              <div>
                <h1 class="title-main">Ranking Global</h1>
                <p style="color:#64748b; font-size:14px; font-weight:500">Veja quem são os melhores motoristas</p>
              </div>
            </div>
          </div>

          <!-- Ranking List -->
          <div class="flex-1 overflow-y-auto no-scroll" style="display: flex; flex-direction: column; gap: 8px; padding: 12px; margin: -12px -12px -12px -12px;">
            <div 
              v-for="user in activeRankingList" 
              :key="user.userId"
              @click="openPublicProfile(user.userId)"
              :class="['activity-row', user.active ? 'active-user' : '']"
              style="cursor: pointer; transition: all 0.2s;"
              onmouseover="this.style.transform='scale(1.01)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)';"
              onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
            >
              <div style="font-weight: 800; font-size: 16px; color: #64748b; width: 28px; text-align: center;">
                {{ user.pos }}º
              </div>
              <div class="activity-avatar">
                <img v-if="user.avatarUrl" :src="getFullUrl(user.avatarUrl)" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;" />
                <span v-else style="background: #e2e8f0; width: 100%; height: 100%; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #94a3b8;">
                  <svg fill="currentColor" viewBox="0 0 24 24" style="width: 20px; height: 20px;">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </span>
              </div>
              <div class="activity-info" style="display: flex; flex-direction: column; justify-content: center;">
                <span class="activity-title" :style="{ color: user.active ? '#2563eb' : '#334155' }">{{ user.name }}</span>
                <div style="display: flex; gap: 6px; margin-top: 4px;">
                  <span v-for="(tag, idx) in user.customTags.slice(0, 2)" :key="idx" :style="{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '40' }" style="padding: 2px 6px; border-radius: 6px; font-size: 9px; font-weight: 700; border: 1px solid;">
                    {{ tag.text }}
                  </span>
                  <span v-if="user.customTags.length > 2" style="font-size: 9px; color: #94a3b8; font-weight: bold; align-self: center;">+{{ user.customTags.length - 2 }}</span>
                </div>
              </div>
              
              <!-- Stats -->
              <div style="display: flex; gap: 16px; align-items: center;">
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                  <span style="font-size: 13px; font-weight: 700; color: #1e293b;">{{ user.tripsCount }}</span>
                  <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">Viagens</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                  <span style="font-size: 13px; font-weight: 700; color: #1e293b;">{{ user.totalDistance.toFixed(1) }}</span>
                  <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">km</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; min-width: 60px;">
                  <span class="activity-xp text-emerald-500" style="font-size: 14px;">+{{ user.pts }}</span>
                  <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">Pontos</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== SETTINGS PAGE ===== -->
      <div :class="['page', activePage === 'settings' ? 'active' : '']" id="page-settings">
        <div class="flex flex-col h-full gap-5">
          <!-- Header -->
          <div class="flex items-center gap-4">
            <div class="settings-header-icon" style="display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.1); width: 48px; height: 48px; border-radius: 12px; color: #3b82f6;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 24px; height: 24px;">
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31-2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
              </svg>
            </div>
            <div>
              <h1 class="title-main">Configurações</h1>
              <p style="color:#64748b; font-size:14px; font-weight:500">Ajuste sua experiência</p>
            </div>
          </div>

          <!-- Settings Sections -->
          <div class="flex-1 overflow-y-auto no-scroll flex flex-col gap-5" style="padding: 12px; margin: -12px -12px -12px -12px;">
            <!-- Conta -->
            <div>
              <p class="profile-section-title" style="padding-left:4px">Conta</p>
              <div class="flex flex-col gap-2">
                <div class="settings-row" style="cursor: default;">
                  <div class="settings-item-left">
                    <div class="settings-icon-box bg-blue-100">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                      </svg>
                    </div>
                    <div>
                      <p class="settings-label">Identificador (ID)</p>
                      <p class="settings-desc">{{ userId }}</p>
                    </div>
                  </div>
                </div>
                <div class="settings-row" @click="promptEditEmail" style="cursor: pointer;">
                  <div class="settings-item-left">
                    <div class="settings-icon-box bg-indigo-100">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                      </svg>
                    </div>
                    <div>
                      <p class="settings-label">E-mail</p>
                      <p class="settings-desc">{{ email }}</p>
                    </div>
                  </div>
                  <svg class="settings-row-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
              </div>
            </div>

            <!-- Notificações -->
            <div>
              <p class="profile-section-title" style="padding-left:4px">Notificações</p>
              <div class="flex flex-col gap-2">
                <div class="settings-row">
                  <div class="settings-item-left">
                    <div class="settings-icon-box bg-orange-100">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                      </svg>
                    </div>
                    <div>
                      <p class="settings-label">Notificações push</p>
                      <p class="settings-desc">Conquistas e eventos</p>
                    </div>
                  </div>
                  <div 
                    :class="['toggle', pushNotifications ? 'on' : 'off']" 
                    @click="toggleSetting('pushNotifications')"
                  >
                    <div class="toggle-knob"></div>
                  </div>
                </div>
                <div class="settings-row">
                  <div class="settings-item-left">
                    <div class="settings-icon-box bg-emerald-100">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                      </svg>
                    </div>
                    <div>
                      <p class="settings-label">Alertas de XP</p>
                      <p class="settings-desc">Quando ganhar pontos</p>
                    </div>
                  </div>
                  <div 
                    :class="['toggle', xpAlerts ? 'on' : 'off']" 
                    @click="toggleSetting('xpAlerts')"
                  >
                    <div class="toggle-knob"></div>
                  </div>
                </div>
                <div class="settings-row">
                  <div class="settings-item-left">
                    <div class="settings-icon-box bg-purple-100">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                      </svg>
                    </div>
                    <div>
                      <p class="settings-label">Ranking social</p>
                      <p class="settings-desc">Atualizações do placar</p>
                    </div>
                  </div>
                  <div 
                    :class="['toggle', socialRanking ? 'on' : 'off']" 
                    @click="toggleSetting('socialRanking')"
                  >
                    <div class="toggle-knob"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Personalização -->
            <div>
              <p class="profile-section-title" style="padding-left:4px">Personalização</p>
              <div class="flex flex-col gap-2">
                <div class="settings-row" style="align-items: flex-start; padding: 18px;">
                  <div class="settings-item-left" style="width: 100%; display: flex; flex-direction: column; gap: 8px; align-items: flex-start;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <div class="settings-icon-box bg-purple-100" style="background-color: #f3e8ff; color: #9333ea;">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
                          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                        </svg>
                      </div>
                      <div>
                        <p class="settings-label">Imagem de Fundo</p>
                        <p class="settings-desc">Escolha a imagem para o fundo do aplicativo</p>
                      </div>
                    </div>
                    
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                      <select v-model="appBgType" @change="changeBg" style="width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 13px; outline: none; cursor: pointer; transition: all 0.2s;">
                        <option v-for="bg in defaultBackgrounds" :key="bg.key" :value="bg.key">{{ bg.title }}</option>
                        <option value="custom">Inserir Link Personalizado...</option>
                      </select>
                      
                      <div v-if="appBgType === 'custom'" style="width: 100%; display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 11px; font-weight: 600; color: #475569;">URL da Imagem:</label>
                        <input v-model="appCustomBgUrl" @input="changeBg" type="text" placeholder="https://exemplo.com/imagem.jpg" style="width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 13px; outline: none; box-sizing: border-box;" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Privacidade -->
            <div>
              <p class="profile-section-title" style="padding-left:4px">Privacidade</p>
              <div class="flex flex-col gap-2">
                <div class="settings-row">
                  <div class="settings-item-left">
                    <div class="settings-icon-box bg-slate-100">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                      </svg>
                    </div>
                    <div>
                      <p class="settings-label">Perfil público</p>
                      <p class="settings-desc">Outros motoristas podem ver</p>
                    </div>
                  </div>
                  <div 
                    :class="['toggle', publicProfile ? 'on' : 'off']" 
                    @click="toggleSetting('publicProfile')"
                  >
                    <div class="toggle-knob"></div>
                  </div>
                </div>
                <div class="settings-row cursor-pointer hover:bg-red-50" @click="handleLogout">
                  <div class="settings-item-left">
                    <div class="settings-icon-box bg-red-100">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                      </svg>
                    </div>
                    <div>
                      <p class="settings-label text-red-400">Sair da conta</p>
                      <p class="settings-desc">Encerrar sessão atual</p>
                    </div>
                  </div>
                  <svg class="settings-row-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </section>
  </div>
  <!-- Highlights Edit Modal -->
  <div v-if="showHighlightsModal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);">
    <div class="glass" style="max-width: 480px; width: 90%; padding: 28px; display: flex; flex-direction: column; gap: 20px; background: rgba(255,255,255,0.95); box-shadow: 0 10px 25px rgba(0,0,0,0.15);">
      <h2 style="font-weight: 800; font-size: 20px; color: #1e293b; margin: 0;">Editar Destaques</h2>
      <p style="font-size: 14px; color: #64748b; margin: 0;">Selecione até 3 conquistas desbloqueadas para exibir no seu perfil.</p>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; max-height: 40vh; overflow-y: auto; padding: 4px;">
        <div 
          v-for="ach in achievementsList.filter(a => a.unlocked)" 
          :key="ach.id"
          @click="toggleHighlight(ach.id)"
          :style="{
            border: pendingHighlights.includes(ach.id) ? `2px solid ${ach.glowColor || '#3b82f6'}` : '2px solid transparent',
            background: pendingHighlights.includes(ach.id) ? `${ach.glowColor}15` : 'rgba(0,0,0,0.03)',
            opacity: (!pendingHighlights.includes(ach.id) && pendingHighlights.length >= 3) ? '0.5' : '1',
            cursor: (!pendingHighlights.includes(ach.id) && pendingHighlights.length >= 3) ? 'not-allowed' : 'pointer'
          }"
          style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 8px; border-radius: 16px; transition: all 0.2s;"
        >
          <div style="font-size: 28px; margin-bottom: 8px;">{{ ach.emoji || '🏆' }}</div>
          <span style="font-size: 11px; font-weight: 700; text-align: center; color: #334155; line-height: 1.2;">{{ ach.title || ach.name }}</span>
        </div>
        <div v-if="achievementsList.filter(a => a.unlocked).length === 0" style="grid-column: 1 / -1; text-align: center; color: #64748b; font-size: 14px; padding: 20px 0;">
          Você ainda não desbloqueou nenhuma conquista.
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;">
        <button @click="showHighlightsModal = false" style="padding: 10px 16px; border-radius: 99px; font-size: 14px; font-weight: 700; color: #64748b; border: none; background: rgba(0,0,0,0.05); cursor: pointer;">Cancelar</button>
        <button @click="confirmHighlights" style="padding: 10px 20px; border-radius: 99px; font-size: 14px; font-weight: 700; color: white; border: none; background: #3b82f6; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">Salvar Destaques</button>
      </div>
    </div>
  </div>

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
          <button v-for="c in ['#3b82f6', '#10b981', '#9333ea', '#f59e0b', '#ef4444', '#6366f1', '#ec4899']" :key="c" @click="tagModalForm.color = c" :style="{ backgroundColor: c }" style="width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid white; cursor: pointer; transition: transform 0.15s;" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"></button>
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
    <div class="glass no-scroll" style="width: 100%; max-width: 520px; max-height: 85vh; display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 28px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15); padding: 24px; box-sizing: border-box; overflow: hidden;">
      
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">🏎️ Configurar Corrida</h2>
        <button @click="showStartTripModal = false" style="background: none; border: none; font-size: 18px; color: #64748b; cursor: pointer; padding: 4px;">✕</button>
      </div>

      <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; padding-right: 4px;" class="no-scroll">
        <!-- Rota -->
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Rota</h4>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <!-- Partida -->
            <div style="position: relative;">
              <input v-model="startTripForm.departure" @input="handleAddressInput(startTripForm.departure, 'departure')" placeholder="📍 Local de Partida (Ex: Residência Enzo)" style="width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 12px; outline: none; background: white; font-weight: 500; box-sizing: border-box;" />
              <!-- Suggestions Dropdown -->
              <div v-if="activeSuggestions.field === 'departure' && activeSuggestions.list.length > 0" class="suggestions-dropdown">
                <div v-for="item in activeSuggestions.list" :key="item.display_name" @click="selectSuggestion(item)" class="suggestion-item">
                  {{ item.display_name }}
                </div>
              </div>
            </div>

            <!-- Paradas intermediárias -->
            <div v-for="(stop, idx) in startTripForm.stops" :key="idx" style="position: relative; display: flex; gap: 6px; align-items: center;">
              <div style="position: relative; flex: 1;">
                <input v-model="stop.address" @input="handleAddressInput(stop.address, 'stop', idx)" placeholder="🛑 Parada Intermediária" style="width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 12px; outline: none; background: white; font-weight: 500; box-sizing: border-box;" />
                <div v-if="activeSuggestions.field === 'stop' && activeSuggestions.index === idx && activeSuggestions.list.length > 0" class="suggestions-dropdown">
                  <div v-for="item in activeSuggestions.list" :key="item.display_name" @click="selectSuggestion(item)" class="suggestion-item">
                    {{ item.display_name }}
                  </div>
                </div>
              </div>
              <button @click="removeStop(idx)" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; font-weight: bold; font-size: 14px;">✕</button>
            </div>

            <!-- Botão Adicionar Parada -->
            <button @click="addStop" style="align-self: flex-start; background: none; border: none; color: #2563eb; cursor: pointer; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px; padding: 4px;">
              ➕ Adicionar Parada
            </button>

            <!-- Destino -->
            <div style="position: relative;">
              <input v-model="startTripForm.destination" @input="handleAddressInput(startTripForm.destination, 'destination')" placeholder="🏁 Destino (Ex: Sede Commute Quest)" style="width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid #cbd5e1; font-size: 12px; outline: none; background: white; font-weight: 500; box-sizing: border-box;" />
              <!-- Suggestions Dropdown -->
              <div v-if="activeSuggestions.field === 'destination' && activeSuggestions.list.length > 0" class="suggestions-dropdown">
                <div v-for="item in activeSuggestions.list" :key="item.display_name" @click="selectSuggestion(item)" class="suggestion-item">
                  {{ item.display_name }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Passageiros -->
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Passageiros</h4>
          
          <!-- Lista Atual -->
          <div v-if="startTripForm.passengers.length > 0" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
            <span v-for="(pass, index) in startTripForm.passengers" :key="index" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.15); color: #2563eb; padding: 4px 10px; border-radius: 99px; font-size: 10px; font-weight: 700;">
              👤 {{ pass.name }} ({{ pass.role }})
              <button @click="removeModalPassenger(index)" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; line-height: 1;">×</button>
            </span>
          </div>
          <p v-else style="margin: 0 0 8px 0; font-size: 11px; color: #64748b; font-style: italic;">Nenhum passageiro adicionado (eles podem entrar via QR Code também).</p>

          <!-- Input passageiros -->
          <div style="display: flex; gap: 6px; align-items: center;">
            <!-- Custom Select for Passengers Name -->
            <div ref="userSelectContainer" style="position: relative; flex: 1;">
              <div 
                @click="showUserSelectMenu = !showUserSelectMenu" 
                style="display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 11px; background: white; font-weight: 500; height: 32px; box-sizing: border-box; cursor: pointer; user-select: none; color: #1e293b;"
              >
                <!-- Render selected user avatar if selected -->
                <div v-if="newModalPassenger.name" style="display: flex; align-items: center; gap: 6px; width: 100%; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <!-- Avatar or default profile icon -->
                    <div style="width: 18px; height: 18px; border-radius: 50%; overflow: hidden; background: #f1f5f9; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.05);">
                      <img 
                        v-if="availableUsersForPassengers.find(u => u.name === newModalPassenger.name)?.avatarUrl" 
                        :src="getFullUrl(availableUsersForPassengers.find(u => u.name === newModalPassenger.name).avatarUrl)" 
                        style="width: 100%; height: 100%; object-fit: cover;" 
                      />
                      <span v-else style="font-size: 8px; font-weight: 700; color: #64748b;">{{ newModalPassenger.name.slice(0,2).toUpperCase() }}</span>
                    </div>
                    <span style="color: #1e293b;">{{ newModalPassenger.name }}</span>
                  </div>
                  <span style="color: #64748b; font-size: 8px;">▼</span>
                </div>
                <div v-else style="display: flex; align-items: center; justify-content: space-between; width: 100%; color: #64748b;">
                  <span>Selecionar Usuário</span>
                  <span style="color: #64748b; font-size: 8px;">▼</span>
                </div>
              </div>

              <!-- Dropdown Menu Options -->
              <div 
                v-if="showUserSelectMenu" 
                style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #cbd5e1; border-radius: 10px; margin-top: 4px; max-height: 180px; overflow-y: auto; z-index: 10005; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); box-sizing: border-box;"
              >
                <div 
                  v-for="user in availableUsersForPassengers" 
                  :key="user.userId" 
                  @click="newModalPassenger.name = user.name; showUserSelectMenu = false"
                  style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 11px; color: #1e293b; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;"
                  onmouseover="this.style.background='#f8fafc'"
                  onmouseout="this.style.background='white'"
                >
                  <!-- Avatar/photo or fallback -->
                  <div style="width: 20px; height: 20px; border-radius: 50%; overflow: hidden; background: #f1f5f9; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;">
                    <img v-if="user.avatarUrl" :src="getFullUrl(user.avatarUrl)" style="width: 100%; height: 100%; object-fit: cover;" />
                    <span v-else style="font-size: 9px; font-weight: 700; color: #64748b;">{{ user.name.slice(0,2).toUpperCase() }}</span>
                  </div>
                  <span style="font-weight: 600; color: #1e293b;">{{ user.name }}</span>
                </div>
                <div v-if="availableUsersForPassengers.length === 0" style="padding: 10px; font-size: 10px; color: #64748b; text-align: center; font-style: italic;">
                  Nenhum usuário disponível
                </div>
              </div>
            </div>
            <select v-model="newModalPassenger.role" style="flex: 1; padding: 8px 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 11px; outline: none; background: white; font-weight: 500; height: 32px; box-sizing: border-box;">
              <option value="" disabled selected>Selecionar Assento</option>
              <option v-for="role in ['Co-piloto 🧭', 'Traseiro Esquerdo 🚗', 'Traseiro Direito 🚗', 'Traseiro Central 🚗']" :key="role" :value="role">
                {{ role }}
              </option>
            </select>
            <button @click="addModalPassenger" style="padding: 0 12px; border-radius: 10px; border: none; background: #2563eb; color: white; font-weight: bold; cursor: pointer; font-size: 11px; height: 32px; display: flex; align-items: center; justify-content: center;">+</button>
          </div>
        </div>

        <!-- Presets -->
        <div style="border-top: 1px solid rgba(0,0,0,0.06); padding-top: 14px;">
          <h4 style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Presets Salvos</h4>
          
          <!-- Lista Presets -->
          <div v-if="savedPresets.length > 0" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
            <div v-for="preset in savedPresets" :key="preset.id" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.02); padding: 6px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.04);">
              <span @click="selectPreset(preset)" style="font-size: 11px; font-weight: 600; color: #334155; cursor: pointer; flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                📂 {{ preset.name }} <span style="font-size: 9px; color: #64748b; font-weight: normal; margin-left: 4px;">({{ preset.departure }} ➔ {{ preset.destination }})</span>
              </span>
              <button @click="deletePreset(preset.id)" style="background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; font-weight: bold;">✕</button>
            </div>
          </div>
          <p v-else style="margin: 0 0 12px 0; font-size: 11px; color: #64748b; font-style: italic;">Nenhum preset salvo.</p>

          <!-- Salvar Preset Atual -->
          <div style="display: flex; gap: 6px;">
            <input v-model="newPresetName" placeholder="Nome para o novo preset" style="flex: 1; padding: 8px 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 11px; outline: none; box-sizing: border-box;" />
            <button @click="saveCurrentAsPreset" style="padding: 0 12px; border-radius: 10px; border: 1px solid #10b981; background: rgba(16, 185, 129, 0.08); color: #10b981; font-weight: bold; cursor: pointer; font-size: 11px; white-space: nowrap; display: flex; align-items: center; justify-content: center;">💾 Salvar</button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 14px; margin-top: 14px;">
        <button @click="showStartTripModal = false" style="padding: 10px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: white; color: #475569; font-size: 12px; font-weight: 700; cursor: pointer;">Cancelar</button>
        <button @click="confirmStartTrip" style="padding: 10px 20px; border-radius: 12px; border: none; background: linear-gradient(135deg, #10b981, #059669); color: white; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(16,185,129,0.3);">▶ Iniciar Viagem</button>
      </div>
    </div>
  </div>

  <!-- Modal de QR Code para Compartilhar Corrida -->
  <div v-if="showQrCodeModal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10001; backdrop-filter: blur(8px);">
    <div class="glass" style="width: 100%; max-width: 360px; background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 24px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15); padding: 24px; text-align: center; box-sizing: border-box; position: relative;">
      <button @click="showQrCodeModal = false" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 16px; color: #64748b; cursor: pointer;">✕</button>
      
      <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: #1e293b;">📱 Conectar Passageiros</h3>
      <p style="margin: 0 0 16px 0; font-size: 11px; color: #64748b;">Escaneie o QR Code abaixo com a câmera do celular para entrar nesta corrida e selecionar seu assento.</p>
      
      <div style="display: flex; justify-content: center; margin-bottom: 16px;">
        <img :src="`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeJoinUrl)}`" alt="QR Code" style="width: 200px; height: 200px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 8px 16px rgba(0,0,0,0.05);" />
      </div>

      <div style="background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 10px; margin-bottom: 16px; word-break: break-all;">
        <code style="font-size: 9px; color: #475569;">{{ qrCodeJoinUrl }}</code>
      </div>

      <div style="display: flex; gap: 8px;">
        <button @click="copyJoinLink" style="flex: 1; padding: 10px; border-radius: 12px; border: 1px solid #cbd5e1; background: white; color: #334155; font-size: 11px; font-weight: 700; cursor: pointer;">📋 Copiar Link</button>
        <button @click="showQrCodeModal = false" style="flex: 1; padding: 10px; border-radius: 12px; border: none; background: #2563eb; color: white; font-size: 11px; font-weight: 700; cursor: pointer;">Fechar</button>
      </div>
    </div>
  </div>

  <!-- Modal de Seleção de Assento / Cargo para Passageiro -->
  <transition name="trophy-zoom">
    <div v-if="showSeatSelectionModal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(8px);">
      <div class="glass" style="width: 100%; max-width: 400px; background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 24px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15); padding: 24px; text-align: center; box-sizing: border-box;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 800; color: #1e293b;">💺 Escolha seu Assento</h3>
        <p style="margin: 0 0 20px 0; font-size: 12px; color: #64748b;">Selecione onde você deseja se sentar no veículo para esta viagem.</p>
        
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
          <button v-for="seat in ['Co-piloto 🧭', 'Traseiro Esquerdo 🚗', 'Traseiro Direito 🚗', 'Traseiro Central 🚗']" :key="seat" @click="selectedSeat = seat" :style="{ padding: '12px', borderRadius: '12px', border: selectedSeat === seat ? '2px solid #2563eb' : '1px solid #cbd5e1', background: selectedSeat === seat ? 'rgba(37, 99, 235, 0.05)' : 'white', color: selectedSeat === seat ? '#2563eb' : '#334155', fontWeight: '700', fontSize: '12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease' }">
            {{ seat }}
          </button>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button @click="closeSeatSelection" style="padding: 10px 16px; border-radius: 12px; border: 1px solid #cbd5e1; background: white; color: #64748b; font-size: 12px; font-weight: 700; cursor: pointer;">Cancelar</button>
          <button @click="confirmSeatSelection" style="padding: 10px 20px; border-radius: 12px; border: none; background: #2563eb; color: white; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.2);">Confirmar Assento</button>
        </div>
      </div>
    </div>
  </transition>

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
    <div v-else-if="publicProfileData" class="glass" style="max-width: 750px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 32px; display: flex; flex-direction: column; gap: 24px; background: rgba(255,255,255,0.95); box-shadow: 0 12px 30px rgba(0,0,0,0.2); position: relative;">
      
      <!-- Close button -->
      <button @click="closePublicProfile" style="position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 16px; background: rgba(0,0,0,0.1); border: none; font-size: 14px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; font-weight: bold;">✕</button>

      <div 
        v-if="publicProfileData.bannerUrl" 
        style="position: absolute; top: 0; left: 0; right: 0; height: 180px; background-size: cover; border-radius: 36px 36px 0 0; z-index: 0;"
        :style="{ backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 70%), url(${getFullUrl(publicProfileData.bannerUrl)})`, backgroundPositionX: 'center', backgroundPositionY: publicProfileData.bannerPositionY || '50%' }"
      ></div>

      <div style="position: relative; z-index: 1; margin-top: 80px;">
        <div class="profile-header">
          <div class="profile-identity" style="align-items: flex-end; gap: 16px;">
            <div class="avatar-wrapper">
              <div class="avatar-box" style="position: relative; overflow: hidden; border: none; border-radius: 24px; width: 96px; height: 96px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); background: #f1f5f9;">
                <img v-if="publicProfileData.avatarUrl" :src="getFullUrl(publicProfileData.avatarUrl)" style="width: 100%; height: 100%; object-fit: cover;" />
                <svg v-else fill="currentColor" viewBox="0 0 24 24" style="width: 48px; height: 48px; color: #94a3b8;">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            </div>
            <div style="background: rgba(0, 0, 0, 0.45); padding: 10px 16px; border-radius: 16px; backdrop-filter: blur(8px); display: flex; flex-direction: column; gap: 4px; border: 1px solid rgba(255,255,255,0.1);">
              <div class="username-row" style="margin: 0;">
                <h1 :style="{ color: publicProfileData.profileTextColor || '#ffffff' }" style="font-size: 22px; font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,0.5); margin: 0; line-height: 1.2;">{{ publicProfileData.username }}</h1>
                <span class="id-badge" style="color: #ffffff; background: rgba(255,255,255,0.2); padding: 1px 5px; border-radius: 4px; font-size: 10px; margin-left: 8px;">ID: {{ publicProfileData.id }}</span>
              </div>
              
              <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px;">
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

        <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 24px;">
          <!-- Bio -->
          <div>
            <h2 class="profile-section-title">Biografia</h2>
            <div class="bio-box" style="padding: 12px; background: rgba(0,0,0,0.03); border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
              <p class="bio-text" style="color: #475569; font-style: italic;">"{{ publicProfileData.bio || 'Sem biografia disponível.' }}"</p>
            </div>
          </div>

          <!-- Stats Grid -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <!-- Km -->
            <div class="metric-card">
              <div class="metric-card-icon bg-blue-100" style="color: #2563eb;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ (publicProfileData.totalDistanceKm || 0).toLocaleString('pt-BR') }}<span class="metric-card-val-unit">km</span></p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Distância</span>
            </div>
            <!-- Hours -->
            <div class="metric-card">
              <div class="metric-card-icon bg-emerald-100" style="color: #059669;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ (publicProfileData.totalHours || 0).toLocaleString('pt-BR') }}<span class="metric-card-val-unit">h</span></p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Tempo</span>
            </div>
            <!-- Points -->
            <div class="metric-card">
              <div class="metric-card-icon bg-orange-100" style="color: #ea580c;">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ (publicProfileData.totalPoints || 0).toLocaleString('pt-BR') }}</p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Pontos</span>
            </div>
            <!-- Trips Count -->
            <div class="metric-card">
              <div class="metric-card-icon bg-purple-100" style="color: #7c3aed;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  <path d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M21 16V10a2 2 0 00-2-2h-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ publicProfileData.tripsCount || 0 }}</p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Viagens</span>
            </div>
            <!-- Total Passengers -->
            <div class="metric-card">
              <div class="metric-card-icon bg-indigo-100" style="color: #4f46e5;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ (publicProfileData.totalPassengers || 0).toLocaleString('pt-BR') }}</p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Caronas</span>
            </div>
            <!-- Longest Trip -->
            <div class="metric-card">
              <div class="metric-card-icon bg-red-100" style="color: #dc2626;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                </svg>
              </div>
              <p class="metric-card-val">{{ (publicProfileData.longestTripKm || 0).toLocaleString('pt-BR') }}<span class="metric-card-val-unit">km</span></p>
              <span style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Maior Viagem</span>
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

<style scoped>
/* Grid 3x3 para o Dashboard */
.home-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 16px;
  flex: 1;
}

.grid-item {
  background: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: all 0.25s;
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(0,0,0,0.02);
}
.grid-item:hover {
  background: white;
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(0,0,0,0.05);
}

/* Widgets específicos */
.item-map {
  grid-column: span 2;
  grid-row: span 2;
  padding: 0;
  border-color: rgba(0, 0, 0, 0.05);
  box-shadow: none;
  position: relative;
}

.item-speed {
  grid-column: 3;
  grid-row: 1;
}

.item-music {
  grid-column: 3;
  grid-row: 2;
}

.item-passengers {
  grid-column: 1;
  grid-row: 3;
}

.item-ranking {
  grid-column: span 2;
  grid-row: 3;
}

/* Detalhes internos do Mapa */
.map-container {
  width: 100%;
  height: 100%;
  border-radius: 24px;
  background: #111827;
  z-index: 1;
}
.map-overlay {
  position: absolute;
  top: 14px;
  left: 14px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 12px;
  border-radius: 12px;
  color: #fff;
  z-index: 10;
}
.map-street {
  font-size: 12px;
  font-weight: 700;
}
.map-eta {
  font-size: 9px;
  color: #94a3b8;
}

/* Widgets Gerais */
.widget-label {
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

/* Velocidade */
.widget-main-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.widget-main-value .number {
  font-size: 38px;
  font-weight: 800;
  color: #1e293b;
  line-height: 1;
}
.widget-main-value .unit {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}
.speed-bar-container {
  height: 6px;
  background-color: #f1f5f9;
  border-radius: 3px;
  margin: 6px 0;
  overflow: hidden;
}
.speed-bar-progress {
  height: 100%;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.widget-subtext {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
}

/* Tocando agora */
.music-content {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}
.music-disc {
  width: 32px;
  height: 32px;
  background-color: #f1f5f9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
.music-disc.spinning {
  animation: spin 6s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.music-info {
  min-width: 0;
  flex: 1;
}
.song-title {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist-name {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 500;
}
.music-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.music-btn {
  background: #3b82f6;
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.music-progress {
  flex: 1;
  height: 4px;
  background-color: #f1f5f9;
  border-radius: 2px;
  overflow: hidden;
}
.music-progress-bar {
  height: 100%;
  background-color: #3b82f6;
}

/* Passageiros */
.passengers-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.passenger-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.7);
}
.passenger-avatar {
  font-size: 14px;
}
.passenger-details {
  flex: 1;
}
.passenger-name {
  font-size: 11px;
  font-weight: 700;
  color: #334155;
}
.passenger-role {
  font-size: 8px;
  color: #94a3b8;
  font-weight: 500;
}
.passenger-status {
  font-size: 9px;
  font-weight: 700;
  color: #10b981;
}

/* Ranking */
.ranking-layout {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ranking-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 12px;
  margin-bottom: 2px;
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid transparent;
  color: #475569;
}
.ranking-row:hover {
  background-color: rgba(59, 130, 246, 0.05);
  border-color: rgba(59, 130, 246, 0.12);
}
.ranking-row.active-user {
  background-color: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.2);
  font-weight: 700;
}
.ranking-row.active-user span {
  color: #2563eb !important;
}
.ranking-position {
  width: 24px;
}
.ranking-name {
  flex: 1;
}
.ranking-points {
  font-variant-numeric: tabular-nums;
}

/* Modal de Detalhes do Troféu */
.trophy-details-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
}
.trophy-details-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 28px;
  width: 90%;
  max-width: 400px;
  padding: 32px 24px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  border: 1px solid rgba(255,255,255,0.6);
}
.trophy-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0,0,0,0.05);
  border: none;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}
.trophy-close:hover {
  background: rgba(0,0,0,0.15);
}
.trophy-emoji-large {
  font-size: 4rem;
  margin-bottom: 16px;
  position: relative;
}
.modal-crown {
  position: absolute;
  top: -16px;
  right: -20px;
  font-size: 24px;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.25));
}
.trophy-title {
  font-size: 20px;
  font-weight: 800;
  color: #1e293b;
  margin: 0 0 10px 0;
}
.trophy-desc {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin: 0 0 20px 0;
}
.trophy-first-winner-badge {
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: #b45309;
  font-size: 11px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.first-winner-name {
  font-weight: 800;
  text-decoration: underline;
}

/* Transição Vue Zoom */
.trophy-zoom-enter-active, .trophy-zoom-leave-active {
  transition: all 0.3s ease;
}
.trophy-zoom-enter-active .trophy-details-card {
  animation: trophy-bounce-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.trophy-zoom-leave-active .trophy-details-card {
  animation: trophy-bounce-out 0.25s ease forwards;
}
.trophy-zoom-enter-from, .trophy-zoom-leave-to {
  opacity: 0;
}

@keyframes trophy-bounce-in {
  0% { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes trophy-bounce-out {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.7); opacity: 0; }
}

/* Layout customizado para a página inicial */
.home-dashboard-grid .item-map {
  grid-column: span 2;
  grid-row: span 3;
}
.home-dashboard-grid:not(.has-active-trip) .item-ranking {
  grid-column: 3;
  grid-row: span 3;
}

/* Layout quando a viagem está ativa */
.home-dashboard-grid .item-current-passengers {
  grid-column: 3;
  grid-row: 1;
}
.home-dashboard-grid.has-active-trip .item-ranking {
  grid-column: 3;
  grid-row: 2 / span 2;
}

/* Overlays Flutuantes no Mapa */
.map-floating-bottom {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}
.premium-floating-btn {
  padding: 10px 24px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.premium-floating-btn.start {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.8));
}
.premium-floating-btn.start:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.4);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95));
}
.premium-floating-btn.stop {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.8));
}
.premium-floating-btn.stop:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(239, 68, 68, 0.4);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95));
}
.btn-icon {
  font-size: 10px;
}

.map-route-overlay {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 16px;
  border-radius: 99px;
  color: white;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
}
.route-label {
  font-size: 8px;
  font-weight: 800;
  background: #2563eb;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.route-path {
  font-size: 11px;
  font-weight: 700;
}

.map-floating-music {
  position: absolute;
  top: 14px;
  right: 14px;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 10px 14px;
  width: 200px;
  z-index: 1000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  color: white;
}
.music-content-compact {
  display: flex;
  align-items: center;
  gap: 10px;
}
.music-disc-compact {
  font-size: 16px;
  animation: compact-spin 4s linear infinite;
  animation-play-state: paused;
}
.spinning {
  animation-play-state: running !important;
}
@keyframes compact-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.music-info-compact {
  flex: 1;
  min-width: 0;
  text-align: left;
}
.song-title-compact {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist-name-compact {
  margin: 0;
  font-size: 8px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.music-btn-compact {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 10px;
  transition: background 0.2s;
  flex-shrink: 0;
}
.music-btn-compact:hover {
  background: rgba(255, 255, 255, 0.2);
}
.music-progress-compact {
  height: 3px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}
.music-progress-bar-compact {
  height: 100%;
  background: #3b82f6;
  border-radius: 2px;
  transition: width 0.3s;
}

.map-floating-qr-widget {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
}

.qr-widget-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.qr-widget-btn:hover {
  transform: translateY(-2px);
  background: rgba(15, 23, 42, 0.95);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 20000;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.suggestion-item {
  padding: 10px 14px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s ease;
}

.suggestion-item:last-child {
  border-bottom: none;
}

.suggestion-item:hover {
  background: #f1f5f9;
}
</style>
