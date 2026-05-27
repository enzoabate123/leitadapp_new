<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { io } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Autenticação e API
const API_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
const isAuthenticated = ref(false);
const token = ref(localStorage.getItem('token') || '');
const authMode = ref('login');
const authForm = ref({ username: '', password: '', email: '' });
const authError = ref('');
const userRole = ref('driver');

// Toasts
const toasts = ref([]);
let toastId = 0;
function showToast(msg) {
  const id = ++toastId;
  toasts.value.push({ id, msg });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
}

async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
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
    bio.value = data.bio || '';
    avatarUrl.value = data.avatarUrl || '';
    bannerUrl.value = data.bannerUrl || '';
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
      name: d.username, 
      pts: d.totalPoints, 
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
  tripActive.value = true;
  tripStartTime.value = Date.now();
  tripDistance.value = 0;
  tripInterval = setInterval(() => {
    tripDistance.value += (speed.value / 3600); // speed is km/h, increment per second
  }, 1000);
}

async function endTrip() {
  tripActive.value = false;
  clearInterval(tripInterval);
  const durationMs = Date.now() - tripStartTime.value;
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  
  try {
    const data = await apiFetch('/api/trips', {
      method: 'POST',
      body: JSON.stringify({
        distanceKm: Number(tripDistance.value.toFixed(2)),
        durationMin,
        avgSpeed: speed.value
      })
    });
    
    showToast(`Viagem finalizada! +${data.xpEarned} XP`);
    
    await fetchMe();
    if (activePage.value === 'achievements') fetchAchievements();
    if (activePage.value === 'home') fetchRanking();
  } catch (e) {
    console.error(e);
    showToast('Erro ao finalizar viagem');
  }
}

// Estado de Navegação
const activePage = ref('home');

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
const totalKm = ref(45321);
const totalHours = ref(1240);
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

// Ranking
const rankingList = ref([]);

// Configurações
const pushNotifications = ref(true);
const xpAlerts = ref(true);
const socialRanking = ref(false);
const publicProfile = ref(true);

// Configurações de Fundo
const appBgType = ref(localStorage.getItem('app-background') || 'bliss');
const appCustomBgUrl = ref(localStorage.getItem('app-background-custom') || '');

function applyBackground(bgType, customUrl = '') {
  if (bgType === 'stripes') {
    document.body.style.background = "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
  } else {
    let url = '';
    if (bgType === 'bliss') {
      url = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80';
    } else if (bgType === 'aqua') {
      url = 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1920&q=80';
    } else if (bgType === 'space') {
      url = 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=1920&q=80';
    } else if (bgType === 'sunset') {
      url = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80';
    } else if (bgType === 'custom' && customUrl) {
      url = customUrl;
    }
    
    if (url) {
      document.body.style.background = `url('${url}') no-repeat center center fixed`;
      document.body.style.backgroundSize = 'cover';
    } else {
      document.body.style.background = "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
    }
  }
}

function changeBg() {
  localStorage.setItem('app-background', appBgType.value);
  if (appBgType.value === 'custom') {
    localStorage.setItem('app-background-custom', appCustomBgUrl.value);
  }
  applyBackground(appBgType.value, appCustomBgUrl.value);
  window.dispatchEvent(new Event('storage'));
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
const customTags = ref([]);
const highlightedAchievements = ref([]);
const showHighlightsModal = ref(false);
const pendingHighlights = ref([]);
const isEditingProfile = ref(false);

const highlightedAchievementsData = computed(() => {
  return highlightedAchievements.value.map(id => achievementsList.value.find(a => a.id === id)).filter(Boolean);
});

const showTagModal = ref(false);
const editingTagIdx = ref(null);
const tagModalForm = ref({ text: '', color: '#3b82f6' });

function toggleEditingProfile() {
  isEditingProfile.value = !isEditingProfile.value;
}

function promptEditAvatar() {
  const newUrl = prompt('Digite a URL da sua foto de perfil:', avatarUrl.value);
  if (newUrl !== null) {
    saveProfileChanges({ avatarUrl: newUrl });
  }
}

function promptEditBio() {
  const newBio = prompt('Digite a sua biografia:', bio.value);
  if (newBio !== null) {
    saveProfileChanges({ bio: newBio });
  }
}

function promptEditBanner() {
  const newUrl = prompt('Digite a URL do banner do perfil:', bannerUrl.value);
  if (newUrl !== null) {
    saveProfileChanges({ bannerUrl: newUrl });
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
    showToast(`Nova conquista: ${ach.emoji} ${ach.title}!`);
  });

  fetchRanking();
  fetchAchievements();

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

    L.marker([-23.55052, -46.633308], { icon: carIcon }).addTo(map.value);

    resizeObserver = new ResizeObserver(() => {
      if (map.value) {
        map.value.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainer.value);
  }
}

onMounted(async () => {
  window.addEventListener('storage', handleStorageChange);
  applyBackground(appBgType.value, appCustomBgUrl.value);
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
  if (page === 'home') fetchRanking();
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
          <!-- Header -->
          <div class="header-area">
            <div>
              <p class="subtitle-meta">Bem-vindo de volta</p>
              <h1 class="title-main">Boa tarde, {{ username }}! 👋</h1>
            </div>
            <div class="badge-row">
              <div class="badge-row-items" style="display: flex; gap: 8px;">
                <div class="badge-pill badge-points">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                  {{ points.toLocaleString('pt-BR') }} pts
                </div>
                <div class="badge-pill badge-level">Nível {{ level }}</div>
                <div class="badge-pill badge-level" :style="{ backgroundColor: socketStatus === 'Conectado' ? 'rgba(57, 255, 20, 0.1)' : 'rgba(255, 0, 85, 0.1)', color: socketStatus === 'Conectado' ? '#10b981' : '#ef4444', border: '1px solid currentColor' }">
                  WS: {{ socketStatus }}
                </div>
              </div>
            </div>
          </div>

          <!-- Grid 3x3 do Dashboard -->
          <div class="home-dashboard-grid">
            <!-- 1. MAPA (Ocupa 4 espaços: 2 colunas x 2 linhas) -->
            <div class="grid-item item-map">
              <div ref="mapContainer" class="map-container"></div>
              <div class="map-overlay">
                <div class="map-street">Av. Rebouças, 1200</div>
                <div class="map-eta">ETA: 12 min • 4.2 km</div>
                <div class="trip-btn-container" style="margin-top: 8px;">
                  <button v-if="!tripActive" @click="toggleTrip" class="trip-btn start" style="padding: 6px 12px; font-size: 11px; border-radius: 8px; background: #10b981; border: none; color: white; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    ▶ Iniciar Viagem
                  </button>
                  <button v-else @click="toggleTrip" class="trip-btn stop" style="padding: 6px 12px; font-size: 11px; border-radius: 8px; background: #ef4444; border: none; color: white; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    ■ Parar ({{ tripDistance.toFixed(2) }}km)
                  </button>
                </div>
              </div>
            </div>

            <!-- 2. VELOCIDADE (Row 1, Col 3) -->
            <div class="grid-item item-speed">
              <span class="widget-label">VELOCIDADE</span>
              <div class="widget-main-value">
                <span class="number">{{ speed }}</span>
                <span class="unit">km/h</span>
              </div>
              <div class="speed-bar-container">
                <div class="speed-bar-progress" :style="{ width: (speed / 160) * 100 + '%' }"></div>
              </div>
              <span class="widget-subtext">RPM: {{ rpm }} • Bateria: {{ battery }}%</span>
            </div>

            <!-- 3. TOCANDO AGORA (Row 2, Col 3) -->
            <div class="grid-item item-music">
              <span class="widget-label">TOCANDO AGORA</span>
              <div class="music-content">
                <div class="music-disc" :class="{ spinning: isPlaying }">🎵</div>
                <div class="music-info">
                  <p class="song-title">{{ currentSong }}</p>
                  <p class="artist-name">{{ currentArtist }}</p>
                </div>
              </div>
              <div class="music-controls">
                <button class="music-btn" @click="togglePlay">
                  <span v-if="isPlaying">⏸️</span>
                  <span v-else>▶️</span>
                </button>
                <div class="music-progress">
                  <div class="music-progress-bar" :style="{ width: isPlaying ? '45%' : '20%' }"></div>
                </div>
              </div>
            </div>

            <!-- 4. PASSAGEIROS (Row 3, Col 1) -->
            <div class="grid-item item-passengers">
              <span class="widget-label">PASSAGEIROS</span>
              <div class="passengers-list">
                <div v-for="pass in passengers" :key="pass.name" class="passenger-row">
                  <div class="passenger-avatar">👤</div>
                  <div class="passenger-details">
                    <p class="passenger-name">{{ pass.name }}</p>
                    <p class="passenger-role">{{ pass.role }}</p>
                  </div>
                  <span class="passenger-status">{{ pass.status }}</span>
                </div>
              </div>
            </div>

            <!-- 5. RANKING (Row 3, Col 2-3) -->
            <div class="grid-item item-ranking">
              <span class="widget-label">RANKING DE CORRIDAS</span>
              <div class="ranking-layout">
                <div 
                  v-for="rank in rankingList" 
                  :key="rank.name" 
                  :class="['ranking-row', rank.active ? 'active-user' : '']"
                >
                  <span class="ranking-position">{{ rank.pos }}º</span>
                  <span class="ranking-name">{{ rank.name }}</span>
                  <span class="ranking-points">{{ rank.pts.toLocaleString('pt-BR') }} pts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div :class="['page', activePage === 'profile' ? 'active' : '']" id="page-profile" style="position: relative;">
        <!-- Profile Banner Background (covers entire glass container, ignoring padding) -->
        <div 
          v-if="bannerUrl" 
          style="position: absolute; top: -28px; left: -28px; right: -28px; bottom: -28px; background-size: cover; background-position: center; z-index: 0; pointer-events: none; border-radius: 36px; box-shadow: inset 0 160px 100px -80px rgba(0, 0, 0, 0.45);"
          :style="{ backgroundImage: `linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.95) 100%), url(${bannerUrl})` }"
        ></div>

        <!-- Banner edit overlay (only when editing) -->
        <div 
          v-if="isEditingProfile" 
          @click="promptEditBanner" 
          style="position: absolute; top: -28px; left: -28px; right: -28px; height: 120px; background: rgba(147, 51, 234, 0.15); border: 2px dashed #9333ea; border-radius: 36px 36px 0 0; color: #9333ea; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; cursor: pointer; z-index: 2; transition: background 0.2s;"
          onmouseover="this.style.background='rgba(147, 51, 234, 0.25)'"
          onmouseout="this.style.background='rgba(147, 51, 234, 0.15)'"
        >
          🖼️ Clique aqui para alterar o Banner do Perfil
        </div>

        <div class="flex flex-col h-full gap-6" style="position: relative; z-index: 1;">
          <!-- Header: Identity + Metrics -->
          <div class="profile-header" :style="isEditingProfile ? { marginTop: '110px' } : {}">
            <div class="profile-identity">
              <div class="avatar-wrapper" :style="isEditingProfile ? { cursor: 'pointer' } : {}" @click="isEditingProfile ? promptEditAvatar() : null">
                <div class="avatar-box" style="position: relative; overflow: hidden; border: 2px solid white; border-radius: 28px;">
                  <img v-if="avatarUrl" :src="avatarUrl" style="width: 100%; height: 100%; object-fit: cover;" />
                  <svg v-else fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  <!-- Edit active indicator -->
                  <div v-if="isEditingProfile" style="position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">
                    <span>📷</span>
                    <span>Alterar</span>
                  </div>
                </div>
              </div>
              <div>
                <div class="username-row">
                  <h1>{{ username }}#{{ userTag }}</h1>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <div class="id-badge-row">
                  <span class="id-badge">ID: {{ userId }}</span>
                  <span>•</span>
                  <span>Out 2023</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px;">
                  <div 
                    v-for="(tag, idx) in customTags" 
                    :key="idx" 
                    :style="{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '40', cursor: isEditingProfile ? 'pointer' : 'default' }"
                    style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1.5px solid; display: flex; align-items: center; gap: 6px; transition: all 0.2s;"
                    @click="isEditingProfile ? editTag(idx) : null"
                  >
                    <span>{{ tag.text }}</span>
                    <span v-if="isEditingProfile" @click.stop="deleteTag(idx)" style="cursor: pointer; font-size: 12px; background: rgba(0,0,0,0.1); border-radius: 50%; width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-left: 2px;">×</span>
                  </div>
                  <button v-if="isEditingProfile" @click="openAddTagModal" style="padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; text-transform: uppercase; border: 1.5px dashed #9333ea; color: #9333ea; background: transparent; cursor: pointer;">
                    ➕ Adicionar Tag
                  </button>
                  <p v-if="customTags.length === 0 && !isEditingProfile" style="font-size: 11px; color: #94a3b8; font-style: italic;">Nenhuma tag</p>
                </div>
              </div>
            </div>

            <!-- Global Metrics -->
            <div class="flex gap-2">
              <div class="metric-card">
                <div class="metric-card-icon bg-blue-100">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ totalKm.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">km</span></p>
              </div>
              <div class="metric-card">
                <div class="metric-card-icon bg-emerald-100">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ totalHours.toLocaleString('pt-BR') }}<span class="metric-card-val-unit">h</span></p>
              </div>
              <div class="metric-card">
                <div class="metric-card-icon bg-orange-100">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                </div>
                <p class="metric-card-val">{{ points.toLocaleString('pt-BR') }}</p>
              </div>
            </div>
          </div>

          <!-- Bio + Badges -->
          <div class="driver-profile-body">
            <div class="driver-profile-left">
              <div>
                <h2 class="profile-section-title">Sobre o Motorista</h2>
                <div class="bio-box" @click="isEditingProfile ? promptEditBio() : null" :style="isEditingProfile ? { cursor: 'pointer', border: '2px dashed #9333ea', background: 'rgba(147, 51, 234, 0.05)' } : {}">
                  <p class="bio-text">"{{ bio || 'Escreva algo sobre você aqui...' }}"</p>
                  <div v-if="isEditingProfile" style="margin-top: 6px; font-size: 9px; color: #9333ea; font-weight: bold; text-transform: uppercase;">
                    ✏️ Clique para editar a biografia
                  </div>
                </div>
              </div>
              <!-- Badges -->
              <div>
                <div class="flex justify-between items-center" style="margin-bottom:12px">
                  <div class="flex items-center gap-2">
                    <div style="width:6px; height:16px; background-color:#3b82f6; border-radius:99px"></div>
                    <h2 class="profile-section-title" style="margin-bottom:0">Destaques</h2>
                  </div>
                  <button v-if="isEditingProfile" class="profile-section-title" style="margin-bottom:0; color:#9333ea; border:none; background:none; cursor:pointer" @click="openHighlightsModal">✏️ Editar Destaques</button>
                  <button v-else class="profile-section-title" style="margin-bottom:0; color:#3b82f6; border:none; background:none; cursor:pointer" @click="navigate('achievements')">Ver tudo</button>
                </div>
                <div class="badge-list" v-if="highlightedAchievementsData.length > 0">
                  <div class="badge-item" v-for="ach in highlightedAchievementsData" :key="ach.id">
                    <div :style="{ color: ach.glowColor || '#eab308' }" style="font-size: 1.5rem;">
                      {{ ach.emoji || '🏆' }}
                    </div>
                    <span class="badge-item-label">{{ ach.title || ach.name }}</span>
                  </div>
                </div>
                <p v-else style="font-size: 12px; color: #94a3b8; font-style: italic;">Nenhum destaque selecionado.</p>
              </div>
            </div>
            <!-- Right decorative -->
            <div class="driver-profile-right">
              <div class="floating-circle">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
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
          <div class="grid grid-cols-5 gap-4 flex-1 overflow-y-auto no-scroll" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px;">
            <div 
              v-for="ach in achievementsList" 
              :key="ach.id" 
              :class="['ach-card', ach.unlocked ? 'unlocked' : 'locked']"
            >
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
          <div class="flex-1 overflow-y-auto no-scroll flex flex-col gap-5">
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
                        <option value="bliss">Windows XP Bliss (Colinas Verdes)</option>
                        <option value="aqua">Frutiger Aero Aqua (Gotas de Água)</option>
                        <option value="space">Deep Space (Espaço Sideral)</option>
                        <option value="sunset">Sunset Beach (Pôr do Sol)</option>
                        <option value="stripes">LeitadApp Stripes (Listras Clássicas)</option>
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
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
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
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: #475569;
}
.ranking-row.active-user {
  background-color: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  font-weight: 700;
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
</style>
