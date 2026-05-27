<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { applyGlobalBackground } from '../globalState';
import { useRouter } from 'vue-router';

const router = useRouter();

// Auth and API variables
const API_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
const token = ref(localStorage.getItem('token') || '');
const isAuthenticated = ref(false);
const isAdmin = ref(false);
const currentUser = ref(null);

// Display properties and context menu
const selectedBgType = ref(localStorage.getItem('app-background') || 'bliss');
const selectedCustomBgUrl = ref(localStorage.getItem('app-background-custom') || '');
const previewBackgroundStyle = ref('');
const showContextMenu = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });

// Removed applyBackground, using applyGlobalBackground instead

function openDisplayProperties() {
  const currentBg = localStorage.getItem('app-background') || 'bliss';
  const customUrl = localStorage.getItem('app-background-custom') || '';
  selectedBgType.value = currentBg;
  selectedCustomBgUrl.value = customUrl;
  updatePreview();
  activeModal.value = 'display-properties';
}

function updatePreview() {
  let styleVal = '';
  if (selectedBgType.value === 'bliss') {
    styleVal = "url('https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80')";
  } else if (selectedBgType.value === 'aqua') {
    styleVal = "url('https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1920&q=80')";
  } else if (selectedBgType.value === 'space') {
    styleVal = "url('https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=1920&q=80')";
  } else if (selectedBgType.value === 'sunset') {
    styleVal = "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80')";
  } else if (selectedBgType.value === 'stripes') {
    styleVal = "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
  } else if (selectedBgType.value === 'custom') {
    styleVal = selectedCustomBgUrl.value ? `url('${selectedCustomBgUrl.value}')` : '#999';
  }
  previewBackgroundStyle.value = styleVal;
}

function applyAndSaveBg() {
  localStorage.setItem('app-background', selectedBgType.value);
  if (selectedBgType.value === 'custom') {
    localStorage.setItem('app-background-custom', selectedCustomBgUrl.value);
  }
  applyGlobalBackground(selectedBgType.value, selectedCustomBgUrl.value);
  window.dispatchEvent(new Event('storage'));
}

function applySaveAndCloseBg() {
  applyAndSaveBg();
  activeModal.value = null;
}

function handleRightClick(event) {
  if (event.target.classList.contains('xp-desktop-layout') || event.target.classList.contains('xp-main-panel') || event.target.tagName === 'MAIN' || event.target.classList.contains('xp-wrapper')) {
    event.preventDefault();
    contextMenuPos.value = { x: event.clientX, y: event.clientY };
    showContextMenu.value = true;
  } else {
    showContextMenu.value = false;
  }
}

function closeContextMenu() {
  showContextMenu.value = false;
}

function handleStorageChange() {
  const currentBg = localStorage.getItem('app-background') || 'bliss';
  const customUrl = localStorage.getItem('app-background-custom') || '';
  applyGlobalBackground(currentBg, customUrl);
}

// Auth Form
const loginForm = ref({ username: '', password: '' });
const loginError = ref('');
const isCheckingAuth = ref(true);

// Navigation
const activeTab = ref('users'); // 'users', 'trips', 'achievements', 'assignments'

// CRUD Data State
const users = ref([]);
const trips = ref([]);
const achievements = ref([]);
const userAchievements = ref([]); // for listing and revoking

// UI state
const searchQueries = ref({
  users: '',
  trips: '',
  achievements: ''
});

// Toasts
const toasts = ref([]);
let toastId = 0;
function showToast(msg, type = 'success') {
  const id = ++toastId;
  toasts.value.push({ id, msg, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
}

// Modal State
const activeModal = ref(null); // 'user', 'trip', 'achievement', 'address', 'comment', 'waypoint', 'media'
const modalMode = ref('create'); // 'create', 'update'
const modalTargetId = ref(null); // ID of entity being edited
const parentTargetId = ref(null); // Parent ID (e.g. userId for address)

// Modal Forms
const userForm = ref({ username: '', email: '', role: 'driver', tripsCount: 0, password: '' });
const tripForm = ref({ userId: '', distanceKm: 0, durationMin: 0, avgSpeed: 0, name: '', startLocation: '', endLocation: '', passengerCount: 1, pointsGenerated: 0 });
const achievementForm = ref({ key: '', title: '', description: '', emoji: '🏆', glowColor: 'cyan' });
const addressForm = ref({ street: '', city: '', state: '', postalCode: '' });
const commentForm = ref({ authorName: '', content: '' });
const waypointForm = ref({ address: '', order: 1 });
const mediaForm = ref({ type: 'text', content: '' });
const assignmentForm = ref({ userId: '', achievementId: '' });

// Expanded rows
const expandedUsers = ref(new Set());
const expandedTrips = ref(new Set());

// --- API Helpers ---
async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token.value) headers['Authorization'] = `Bearer ${token.value}`;
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const errText = await res.text();
    let msg = errText;
    try {
      const parsed = JSON.parse(errText);
      msg = parsed.error || errText;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

async function verifyAccess() {
  isCheckingAuth.value = true;
  if (!token.value) {
    isAuthenticated.value = false;
    isAdmin.value = false;
    isCheckingAuth.value = false;
    return;
  }

  try {
    const me = await apiFetch('/api/me');
    currentUser.value = me;
    isAuthenticated.value = true;
    if (me.role === 'admin') {
      isAdmin.value = true;
      await loadAllData();
    } else {
      isAdmin.value = false;
      showToast('Acesso negado: Apenas administradores.', 'error');
    }
  } catch (err) {
    console.error(err);
    isAuthenticated.value = false;
    isAdmin.value = false;
    token.value = '';
    localStorage.removeItem('token');
  } finally {
    isCheckingAuth.value = false;
  }
}

async function handleLogin() {
  try {
    loginError.value = '';
    const data = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify(loginForm.value)
    });
    token.value = data.token;
    localStorage.setItem('token', data.token);
    showToast('Login efetuado com sucesso!');
    await verifyAccess();
  } catch (err) {
    loginError.value = err.message || 'Erro na autenticação';
    showToast(loginError.value, 'error');
  }
}

function handleLogout() {
  token.value = '';
  localStorage.removeItem('token');
  isAuthenticated.value = false;
  isAdmin.value = false;
  currentUser.value = null;
  router.push('/');
}

// --- Data Loading ---
async function loadAllData() {
  if (!isAdmin.value) return;
  try {
    await Promise.all([
      loadUsers(),
      loadTrips(),
      loadAchievements(),
      loadUserAchievements()
    ]);
  } catch (err) {
    showToast('Erro ao carregar dados do banco: ' + err.message, 'error');
  }
}

async function loadUsers() {
  users.value = await apiFetch('/api/admin/users');
}

async function loadTrips() {
  trips.value = await apiFetch('/api/admin/trips');
}

async function loadAchievements() {
  achievements.value = await apiFetch('/api/admin/achievements');
}

async function loadUserAchievements() {
  const list = [];
  users.value.forEach(u => {
    if (u.achievements) {
      u.achievements.forEach(ua => {
        list.push({
          userId: u.id,
          username: u.username,
          achievementId: ua.achievementId,
          title: ua.achievement.title,
          emoji: ua.achievement.emoji,
          unlockedAt: ua.unlockedAt
        });
      });
    }
  });
  userAchievements.value = list;
}

// --- CRUD Operations ---

// Users
function openUserModal(mode, user = null) {
  modalMode.value = mode;
  activeModal.value = 'user';
  if (mode === 'create') {
    userForm.value = { username: '', email: '', role: 'driver', tripsCount: 0, password: '' };
  } else if (mode === 'update' && user) {
    modalTargetId.value = user.id;
    userForm.value = {
      username: user.username,
      email: user.email || '',
      role: user.role,
      tripsCount: user.tripsCount || 0,
      password: ''
    };
  }
}

async function submitUser() {
  try {
    if (modalMode.value === 'create') {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(userForm.value)
      });
      showToast('Usuário criado com sucesso!');
    } else {
      const payload = { ...userForm.value };
      if (!payload.password) delete payload.password;
      await apiFetch(`/api/admin/users/${modalTargetId.value}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Usuário atualizado com sucesso!');
    }
    activeModal.value = null;
    await loadUsers();
    await loadUserAchievements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('Tem certeza de que deseja excluir este usuário? Todos os dados vinculados serão removidos.')) return;
  try {
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    showToast('Usuário removido com sucesso!');
    await loadUsers();
    await loadUserAchievements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Addresses inside User Details
function openAddressModal(userId) {
  parentTargetId.value = userId;
  activeModal.value = 'address';
  addressForm.value = { street: '', city: '', state: '', postalCode: '' };
}

async function submitAddress() {
  try {
    await apiFetch(`/api/admin/users/${parentTargetId.value}/addresses`, {
      method: 'POST',
      body: JSON.stringify(addressForm.value)
    });
    showToast('Endereço adicionado com sucesso!');
    activeModal.value = null;
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAddress(addressId) {
  if (!confirm('Deseja excluir este endereço?')) return;
  try {
    await apiFetch(`/api/admin/addresses/${addressId}`, { method: 'DELETE' });
    showToast('Endereço removido!');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Comments inside User Details
function openCommentModal(userId) {
  parentTargetId.value = userId;
  activeModal.value = 'comment';
  commentForm.value = { authorName: currentUser.value?.username || 'admin', content: '' };
}

async function submitComment() {
  try {
    await apiFetch(`/api/admin/users/${parentTargetId.value}/comments`, {
      method: 'POST',
      body: JSON.stringify(commentForm.value)
    });
    showToast('Comentário adicionado!');
    activeModal.value = null;
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteComment(commentId) {
  if (!confirm('Deseja excluir este comentário?')) return;
  try {
    await apiFetch(`/api/admin/comments/${commentId}`, { method: 'DELETE' });
    showToast('Comentário removido!');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Trips
function openTripModal(mode, trip = null) {
  modalMode.value = mode;
  activeModal.value = 'trip';
  if (mode === 'create') {
    tripForm.value = {
      userId: users.value[0]?.id || '',
      distanceKm: 1.0,
      durationMin: 5,
      avgSpeed: 40.0,
      name: '',
      startLocation: '',
      endLocation: '',
      passengerCount: 1,
      pointsGenerated: 10
    };
  } else if (mode === 'update' && trip) {
    modalTargetId.value = trip.id;
    tripForm.value = {
      userId: trip.userId,
      distanceKm: trip.distanceKm,
      durationMin: trip.durationMin,
      avgSpeed: trip.avgSpeed || 0,
      name: trip.name || '',
      startLocation: trip.startLocation || '',
      endLocation: trip.endLocation || '',
      passengerCount: trip.passengerCount,
      pointsGenerated: trip.pointsGenerated
    };
  }
}

async function submitTrip() {
  try {
    const payload = { ...tripForm.value };
    payload.userId = parseInt(payload.userId, 10);
    payload.distanceKm = parseFloat(payload.distanceKm);
    payload.durationMin = parseInt(payload.durationMin, 10);
    payload.avgSpeed = payload.avgSpeed ? parseFloat(payload.avgSpeed) : null;
    payload.passengerCount = parseInt(payload.passengerCount, 10);
    payload.pointsGenerated = parseInt(payload.pointsGenerated, 10);

    if (modalMode.value === 'create') {
      await apiFetch('/api/admin/trips', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Corrida registrada com sucesso!');
    } else {
      await apiFetch(`/api/admin/trips/${modalTargetId.value}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Corrida atualizada!');
    }
    activeModal.value = null;
    await loadTrips();
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTrip(id) {
  if (!confirm('Deseja excluir esta corrida?')) return;
  try {
    await apiFetch(`/api/admin/trips/${id}`, { method: 'DELETE' });
    showToast('Corrida removida!');
    await loadTrips();
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Waypoints inside Trip Details
function openWaypointModal(tripId) {
  parentTargetId.value = tripId;
  activeModal.value = 'waypoint';
  const trip = trips.value.find(t => t.id === tripId);
  const nextOrder = (trip?.waypoints?.length || 0) + 1;
  waypointForm.value = { address: '', order: nextOrder };
}

async function submitWaypoint() {
  try {
    await apiFetch(`/api/admin/trips/${parentTargetId.value}/waypoints`, {
      method: 'POST',
      body: JSON.stringify(waypointForm.value)
    });
    showToast('Parada adicionada!');
    activeModal.value = null;
    await loadTrips();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteWaypoint(waypointId) {
  if (!confirm('Deseja remover esta parada?')) return;
  try {
    await apiFetch(`/api/admin/waypoints/${waypointId}`, { method: 'DELETE' });
    showToast('Parada removida!');
    await loadTrips();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Media inside Trip Details
function openMediaModal(tripId) {
  parentTargetId.value = tripId;
  activeModal.value = 'media';
  mediaForm.value = { type: 'text', content: '' };
}

async function submitMedia() {
  try {
    await apiFetch(`/api/admin/trips/${parentTargetId.value}/medias`, {
      method: 'POST',
      body: JSON.stringify(mediaForm.value)
    });
    showToast('Mídia adicionada!');
    activeModal.value = null;
    await loadTrips();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteMedia(mediaId) {
  if (!confirm('Deseja remover esta mídia?')) return;
  try {
    await apiFetch(`/api/admin/medias/${mediaId}`, { method: 'DELETE' });
    showToast('Mídia removida!');
    await loadTrips();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Achievements
function openAchievementModal(mode, ach = null) {
  modalMode.value = mode;
  activeModal.value = 'achievement';
  if (mode === 'create') {
    achievementForm.value = { key: '', title: '', description: '', emoji: '🏆', glowColor: 'cyan' };
  } else if (mode === 'update' && ach) {
    modalTargetId.value = ach.id;
    achievementForm.value = {
      key: ach.key,
      title: ach.title,
      description: ach.description,
      emoji: ach.emoji,
      glowColor: ach.glowColor || 'cyan'
    };
  }
}

async function submitAchievement() {
  try {
    if (modalMode.value === 'create') {
      await apiFetch('/api/admin/achievements', {
        method: 'POST',
        body: JSON.stringify(achievementForm.value)
      });
      showToast('Conquista criada!');
    } else {
      await apiFetch(`/api/admin/achievements/${modalTargetId.value}`, {
        method: 'PUT',
        body: JSON.stringify(achievementForm.value)
      });
      showToast('Conquista atualizada!');
    }
    activeModal.value = null;
    await loadAchievements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAchievement(id) {
  if (!confirm('Deseja excluir esta conquista permanentemente?')) return;
  try {
    await apiFetch(`/api/admin/achievements/${id}`, { method: 'DELETE' });
    showToast('Conquista excluída!');
    await loadAchievements();
    await loadUsers();
    await loadUserAchievements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Deliver Achievement to User
async function assignAchievement() {
  if (!assignmentForm.value.userId || !assignmentForm.value.achievementId) {
    showToast('Selecione o usuário e a conquista', 'error');
    return;
  }
  try {
    await apiFetch('/api/admin/user-achievements', {
      method: 'POST',
      body: JSON.stringify({
        userId: parseInt(assignmentForm.value.userId, 10),
        achievementId: parseInt(assignmentForm.value.achievementId, 10)
      })
    });
    showToast('Conquista entregue com sucesso!');
    assignmentForm.value = { userId: '', achievementId: '' };
    await loadUsers();
    await loadUserAchievements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function revokeAchievement(userId, achievementId) {
  if (!confirm('Deseja revogar esta conquista deste usuário?')) return;
  try {
    await apiFetch(`/api/admin/user-achievements/${userId}/${achievementId}`, {
      method: 'DELETE'
    });
    showToast('Conquista revogada!');
    await loadUsers();
    await loadUserAchievements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Expanding row actions
function toggleUserExpand(userId) {
  if (expandedUsers.value.has(userId)) {
    expandedUsers.value.delete(userId);
  } else {
    expandedUsers.value.add(userId);
  }
}

function toggleTripExpand(tripId) {
  if (expandedTrips.value.has(tripId)) {
    expandedTrips.value.delete(tripId);
  } else {
    expandedTrips.value.add(tripId);
  }
}

onMounted(async () => {
  await verifyAccess();
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('click', closeContextMenu);
  applyGlobalBackground(selectedBgType.value, selectedCustomBgUrl.value);
});

onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('click', closeContextMenu);
});
</script>

<template>
  <div class="xp-wrapper" @contextmenu="handleRightClick">

    <!-- Spinner Check -->
    <div v-if="isCheckingAuth" class="xp-dialog center-dialog loader-dialog">
      <div class="xp-spinner"></div>
      <p style="margin-top:10px; font-weight:bold;">Carregando o sistema...</p>
    </div>

    <!-- Login Form (if not logged in) -->
    <div v-else-if="!isAuthenticated" class="xp-window center-window animate-scale-up" style="max-width: 420px;">
      <header class="xp-titlebar">
        <div class="titlebar-logo">
          <span class="logo-icon">🔑</span>
          <h2>Segurança do Windows XP - LeitadApp</h2>
        </div>
        <div class="window-controls">
          <button class="win-btn close" disabled>X</button>
        </div>
      </header>
      <div class="xp-window-body" style="padding: 20px;">
        <div style="display: flex; gap: 15px; margin-bottom: 20px; align-items: center;">
          <div style="font-size: 40px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));">🛡️</div>
          <div>
            <h3 style="margin: 0; font-size: 15px; color: #003399; font-weight: bold;">Identificação Necessária</h3>
            <p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">Faça logon para acessar o console CMS.</p>
          </div>
        </div>

        <form @submit.prevent="handleLogin" class="xp-form">
          <div class="input-group">
            <label>Usuário Administrador:</label>
            <input v-model="loginForm.username" type="text" placeholder="Ex: admin" required />
          </div>
          <div class="input-group">
            <label>Senha do Sistema:</label>
            <input v-model="loginForm.password" type="password" placeholder="••••••••" required />
          </div>

          <p v-if="loginError" class="xp-error-text">{{ loginError }}</p>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
            <router-link to="/" class="btn-xp secondary-btn text-center" style="display: inline-flex; align-items:center; text-decoration:none;">Cancelar</router-link>
            <button type="submit" class="btn-xp green-btn">Logon 🔑</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Main Panel (if logged in and admin) -->
    <div v-else-if="isAdmin" class="xp-desktop-layout animate-fade-in">
      <div class="xp-window main-window">
        <!-- Title Bar -->
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">📂</span>
            <h2>Console do Administrador [LeitadApp CMS - Database Viewer]</h2>
          </div>
          <div class="window-controls">
            <button class="win-btn min">_</button>
            <button class="win-btn max">⬜</button>
            <button @click="handleLogout" class="win-btn close" title="Sair do Console">X</button>
          </div>
        </header>

        <!-- Menu bar -->
        <div class="xp-menubar">
          <span>Arquivo</span>
          <span>Editar</span>
          <span @click="openDisplayProperties" style="cursor: pointer;">Exibir</span>
          <span>Favoritos</span>
          <span @click="openDisplayProperties" style="cursor: pointer;">Ferramentas</span>
          <span>Ajuda</span>
        </div>

        <div class="xp-window-body">
          <div class="admin-content-layout">
            <!-- Sidebar Navigation (Windows XP Common Tasks Style) -->
            <aside class="xp-sidebar">
              <div class="xp-sidebar-panel">
                <header class="panel-header">
                  <span>Tarefas de Banco</span>
                  <span class="chevron">▼</span>
                </header>
                <div class="panel-body">
                  <button 
                    :class="['sidebar-nav-item', activeTab === 'users' ? 'active' : '']" 
                    @click="activeTab = 'users'"
                  >
                    👤 Gerenciar Usuários
                  </button>
                  <button 
                    :class="['sidebar-nav-item', activeTab === 'trips' ? 'active' : '']" 
                    @click="activeTab = 'trips'"
                  >
                    🚗 Gerenciar Corridas
                  </button>
                  <button 
                    :class="['sidebar-nav-item', activeTab === 'achievements' ? 'active' : '']" 
                    @click="activeTab = 'achievements'"
                  >
                    🏆 Classes de Conquistas
                  </button>
                  <button 
                    :class="['sidebar-nav-item', activeTab === 'assignments' ? 'active' : '']" 
                    @click="activeTab = 'assignments'"
                  >
                    👑 Entregar Conquistas
                  </button>
                </div>
              </div>

              <div class="xp-sidebar-panel">
                <header class="panel-header" style="background: linear-gradient(to right, #4ade80, #388e3c);">
                  <span>Outros Locais</span>
                  <span class="chevron">▼</span>
                </header>
                <div class="panel-body">
                  <router-link to="/" class="sidebar-nav-item text-shadow" style="text-decoration:none;">
                    🎛️ Dashboard Público
                  </router-link>
                  <button @click="handleLogout" class="sidebar-nav-item" style="text-align:left; color:#b91c1c;">
                    🚪 Logoff
                  </button>
                </div>
              </div>
            </aside>

            <!-- Main Database Viewer/Editor -->
            <main class="xp-main-panel">
              <!-- ===== TAB 1: USERS ===== -->
              <div v-if="activeTab === 'users'" class="tab-pane">
                <div class="pane-header-xp">
                  <div>
                    <h3>Tabela de Contas de Usuários</h3>
                    <p>Visualização e edição do banco de dados relacional de motoristas.</p>
                  </div>
                  <button @click="openUserModal('create')" class="btn-xp green-btn">➕ Adicionar Novo Usuário</button>
                </div>

                <!-- Search -->
                <div class="search-bar-xp">
                  <label>Pesquisar Registros:</label>
                  <input v-model="searchQueries.users" type="text" placeholder="Filtre por nome ou e-mail de usuário..." />
                </div>

                <!-- Users Table -->
                <div class="xp-table-container">
                  <table class="xp-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>ID</th>
                        <th>Nome de Usuário</th>
                        <th>Endereço de E-mail</th>
                        <th>Cargo (Role)</th>
                        <th>Nº Corridas</th>
                        <th>Ações Rápidas</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="user in users" :key="user.id">
                        <tr v-if="!searchQueries.users || user.username.toLowerCase().includes(searchQueries.users.toLowerCase()) || (user.email && user.email.toLowerCase().includes(searchQueries.users.toLowerCase()))">
                          <td class="toggle-expand-xp" @click="toggleUserExpand(user.id)">
                            {{ expandedUsers.has(user.id) ? '▼' : '▶' }}
                          </td>
                          <td><strong>#{{ user.id }}</strong></td>
                          <td><span class="xp-table-tag">👤 {{ user.username }}</span></td>
                          <td>{{ user.email || '—' }}</td>
                          <td><span :class="['role-badge-xp', user.role]">{{ user.role }}</span></td>
                          <td>🚗 {{ user.tripsCount }}</td>
                          <td>
                            <div class="action-buttons-xp">
                              <button @click="openUserModal('update', user)" class="btn-xp-mini" title="Alterar">✏️ Editar</button>
                              <button @click="deleteUser(user.id)" class="btn-xp-mini red-text" title="Deletar">🗑️ Excluir</button>
                            </div>
                          </td>
                        </tr>
                        <!-- Expanded section for address & comments -->
                        <tr v-if="expandedUsers.has(user.id)" class="expanded-row-xp">
                          <td colspan="7">
                            <div class="expanded-details-xp">
                              <div class="grid-details-xp">
                                <!-- Addresses CMS -->
                                <div class="details-section-xp">
                                  <div class="section-title-row-xp">
                                    <h4>📍 Endereços Vinculados</h4>
                                    <button @click="openAddressModal(user.id)" class="btn-xp-micro">Adicionar</button>
                                  </div>
                                  <ul class="details-list-xp" v-if="user.addresses && user.addresses.length > 0">
                                    <li v-for="addr in user.addresses" :key="addr.id">
                                      <span>📍 <strong>{{ addr.street }}</strong>, {{ addr.city }}-{{ addr.state }} ({{ addr.postalCode }})</span>
                                      <button @click="deleteAddress(addr.id)" class="btn-trash-xp">❌</button>
                                    </li>
                                  </ul>
                                  <p v-else class="empty-list-xp">Nenhum endereço registrado.</p>
                                </div>

                                <!-- Profile Comments CMS -->
                                <div class="details-section-xp">
                                  <div class="section-title-row-xp">
                                    <h4>💬 Comentários na Conta</h4>
                                    <button @click="openCommentModal(user.id)" class="btn-xp-micro">Escrever</button>
                                  </div>
                                  <ul class="details-list-xp" v-if="user.profileComments && user.profileComments.length > 0">
                                    <li v-for="comm in user.profileComments" :key="comm.id" class="comment-item-xp">
                                      <div class="comment-bubble-xp">
                                        <div class="bubble-meta-xp">
                                          <strong>@{{ comm.authorName }}</strong>
                                          <span>{{ new Date(comm.createdAt).toLocaleDateString() }}</span>
                                        </div>
                                        <p>"{{ comm.content }}"</p>
                                      </div>
                                      <button @click="deleteComment(comm.id)" class="btn-trash-xp">❌</button>
                                    </li>
                                  </ul>
                                  <p v-else class="empty-list-xp">Nenhum comentário registrado.</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- ===== TAB 2: TRIPS ===== -->
              <div v-else-if="activeTab === 'trips'" class="tab-pane">
                <div class="pane-header-xp">
                  <div>
                    <h3>Tabela de Viagens Registradas</h3>
                    <p>Operações de CRUD de corridas, waypoints e mídias.</p>
                  </div>
                  <button @click="openTripModal('create')" class="btn-xp green-btn">➕ Nova Viagem</button>
                </div>

                <div class="search-bar-xp">
                  <label>Pesquisar Corridas:</label>
                  <input v-model="searchQueries.trips" type="text" placeholder="Filtre por ID da viagem, motorista ou ponto de partida..." />
                </div>

                <div class="xp-table-container">
                  <table class="xp-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>ID</th>
                        <th>Motorista</th>
                        <th>Nome Opcional</th>
                        <th>Distância</th>
                        <th>Duração</th>
                        <th>Pessoas</th>
                        <th>Partida / Destino</th>
                        <th>Pontos/XP</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="trip in trips" :key="trip.id">
                        <tr v-if="!searchQueries.trips || trip.id.toString() === searchQueries.trips || trip.user.username.toLowerCase().includes(searchQueries.trips.toLowerCase()) || (trip.name && trip.name.toLowerCase().includes(searchQueries.trips.toLowerCase())) || (trip.startLocation && trip.startLocation.toLowerCase().includes(searchQueries.trips.toLowerCase()))">
                          <td class="toggle-expand-xp" @click="toggleTripExpand(trip.id)">
                            {{ expandedTrips.has(trip.id) ? '▼' : '▶' }}
                          </td>
                          <td><strong>#{{ trip.id }}</strong></td>
                          <td><span class="xp-table-tag">👤 {{ trip.user?.username }}</span></td>
                          <td>{{ trip.name || '—' }}</td>
                          <td>{{ trip.distanceKm }} km</td>
                          <td>⏱️ {{ trip.durationMin }} min</td>
                          <td>👥 {{ trip.passengerCount }}</td>
                          <td>
                            <div class="route-info-xp">
                              <div>🟢 {{ trip.startLocation || 'Início não inf.' }}</div>
                              <div>🔴 {{ trip.endLocation || 'Fim não inf.' }}</div>
                            </div>
                          </td>
                          <td><strong>+{{ trip.pointsGenerated }} XP</strong></td>
                          <td>
                            <div class="action-buttons-xp">
                              <button @click="openTripModal('update', trip)" class="btn-xp-mini" title="Editar">✏️</button>
                              <button @click="deleteTrip(trip.id)" class="btn-xp-mini red-text" title="Excluir">🗑️</button>
                            </div>
                          </td>
                        </tr>
                        <!-- Expanded details for Waypoints & Media -->
                        <tr v-if="expandedTrips.has(trip.id)" class="expanded-row-xp">
                          <td colspan="10">
                            <div class="expanded-details-xp">
                              <div class="grid-details-xp">
                                <!-- Waypoints -->
                                <div class="details-section-xp">
                                  <div class="section-title-row-xp">
                                    <h4>🚩 Paradas (Waypoints)</h4>
                                    <button @click="openWaypointModal(trip.id)" class="btn-xp-micro">Adicionar</button>
                                  </div>
                                  <ul class="details-list-xp" v-if="trip.waypoints && trip.waypoints.length > 0">
                                    <li v-for="wp in trip.waypoints.sort((a,b) => a.order - b.order)" :key="wp.id">
                                      <span>🚩 <strong>Ordem {{ wp.order }}</strong>: {{ wp.address }}</span>
                                      <button @click="deleteWaypoint(wp.id)" class="btn-trash-xp">❌</button>
                                    </li>
                                  </ul>
                                  <p v-else class="empty-list-xp">Nenhuma parada registrada.</p>
                                </div>

                                <!-- Media CMS -->
                                <div class="details-section-xp">
                                  <div class="section-title-row-xp">
                                    <h4>📸 Mídias da Viagem</h4>
                                    <button @click="openMediaModal(trip.id)" class="btn-xp-micro">Adicionar</button>
                                  </div>
                                  <div class="media-grid-xp" v-if="trip.media && trip.media.length > 0">
                                    <div v-for="med in trip.media" :key="med.id" class="media-card-xp">
                                      <div class="media-type-badge">{{ med.type }}</div>
                                      <div class="media-content-preview">
                                        <img v-if="med.type === 'image'" :src="med.content" class="media-thumb-xp" />
                                        <p v-else class="media-text-preview">"{{ med.content }}"</p>
                                      </div>
                                      <button @click="deleteMedia(med.id)" class="btn-trash-xp-abs">🗑️</button>
                                    </div>
                                  </div>
                                  <p v-else class="empty-list-xp">Nenhuma mídia registrada.</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- ===== TAB 3: ACHIEVEMENTS ===== -->
              <div v-else-if="activeTab === 'achievements'" class="tab-pane">
                <div class="pane-header-xp">
                  <div>
                    <h3>Classes de Conquistas</h3>
                    <p>Configure conquistas globais para motoristas que cumprem marcos de trânsito.</p>
                  </div>
                  <button @click="openAchievementModal('create')" class="btn-xp green-btn">➕ Nova Conquista</button>
                </div>

                <div class="search-bar-xp">
                  <label>Buscar Conquista:</label>
                  <input v-model="searchQueries.achievements" type="text" placeholder="Filtre por título, chave ou descrição..." />
                </div>

                <div class="ach-grid-xp">
                  <div 
                    v-for="ach in achievements" 
                    :key="ach.id"
                    v-show="!searchQueries.achievements || ach.title.toLowerCase().includes(searchQueries.achievements.toLowerCase()) || ach.key.toLowerCase().includes(searchQueries.achievements.toLowerCase())"
                    class="ach-card-xp"
                  >
                    <header class="ach-card-header-xp">
                      <span class="emoji-block">{{ ach.emoji }}</span>
                      <div class="card-controls">
                        <button @click="openAchievementModal('update', ach)" class="btn-xp-micro">Editar</button>
                        <button @click="deleteAchievement(ach.id)" class="btn-xp-micro red-text">Deletar</button>
                      </div>
                    </header>
                    <div class="ach-card-body-xp">
                      <h4>{{ ach.title }}</h4>
                      <p class="key">Chave: <code>{{ ach.key }}</code></p>
                      <p class="desc">{{ ach.description }}</p>
                      <span :class="['glow-badge-xp', ach.glowColor]">{{ ach.glowColor || 'Padrão' }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ===== TAB 4: ASSIGNMENTS ===== -->
              <div v-else-if="activeTab === 'assignments'" class="tab-pane">
                <div class="pane-header-xp">
                  <div>
                    <h3>Painel de Atribuição Manual</h3>
                    <p>Entregue ou revogue medalhas para perfis de motoristas em tempo real.</p>
                  </div>
                </div>

                <!-- Form Card -->
                <div class="xp-card">
                  <header class="xp-card-header-gray">👑 Atribuir Conquista a Usuário</header>
                  <div class="xp-card-body">
                    <form @submit.prevent="assignAchievement" class="xp-grid-form">
                      <div class="input-group">
                        <label>Selecionar Motorista:</label>
                        <select v-model="assignmentForm.userId" required>
                          <option value="" disabled>Escolha um usuário</option>
                          <option v-for="u in users" :key="u.id" :value="u.id">
                            {{ u.username }} (ID: {{ u.id }})
                          </option>
                        </select>
                      </div>
                      <div class="input-group">
                        <label>Selecionar Conquista:</label>
                        <select v-model="assignmentForm.achievementId" required>
                          <option value="" disabled>Escolha uma conquista</option>
                          <option v-for="a in achievements" :key="a.id" :value="a.id">
                            {{ a.emoji }} {{ a.title }} ({{ a.key }})
                          </option>
                        </select>
                      </div>
                      <button type="submit" class="btn-xp blue-btn" style="height: fit-content;">👑 Conceder Medalha</button>
                    </form>
                  </div>
                </div>

                <!-- Active Associations -->
                <h4 style="margin: 20px 0 10px 0; color:#003399;">Marcos Desbloqueados Ativamente:</h4>
                <div class="xp-table-container">
                  <table class="xp-table">
                    <thead>
                      <tr>
                        <th>Nome do Motorista</th>
                        <th>Conquista Atribuída</th>
                        <th>Data de Concessão</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="ua in userAchievements" :key="ua.userId + '-' + ua.achievementId">
                        <td><strong>{{ ua.username }}</strong></td>
                        <td><span class="ach-badge-xp-pill">{{ ua.emoji }} {{ ua.title }}</span></td>
                        <td>{{ new Date(ua.unlockedAt).toLocaleString() }}</td>
                        <td>
                          <button @click="revokeAchievement(ua.userId, ua.achievementId)" class="btn-xp red-btn" style="padding: 4px 8px; font-size:11px;">Revogar Conquista 🗑️</button>
                        </td>
                      </tr>
                      <tr v-if="userAchievements.length === 0">
                        <td colspan="4" class="empty-list-xp" style="text-align: center; padding: 20px;">Nenhuma conquista ativa no banco de dados.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>

      <!-- Exaggerated Windows XP Taskbar -->
      <footer class="xp-taskbar">
        <button class="start-button">
          <span class="start-flag">🟢</span>
          <span>Iniciar</span>
        </button>
        <div class="taskbar-running-apps">
          <div class="taskbar-tab active">
            📂 LeitadApp CMS
          </div>
        </div>
        <div class="taskbar-tray">
          <span class="tray-icon">🔊</span>
          <span class="tray-icon">🛡️</span>
          <span class="tray-clock">{{ new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }}</span>
        </div>
      </footer>
    </div>

    <!-- Retro Windows XP Context Menu -->
    <div 
      v-if="showContextMenu" 
      class="xp-context-menu" 
      :style="{ top: contextMenuPos.y + 'px', left: contextMenuPos.x + 'px' }"
    >
      <div @click="openDisplayProperties(); showContextMenu = false;" class="context-item">
        <span>Propriedades</span>
      </div>
    </div>

    <!-- Modais Exagerados Windows XP (Thick borders + Bevels) -->
    <div v-if="activeModal" class="xp-modal-backdrop animate-fade-in">
      <!-- DISPLAY PROPERTIES MODAL -->
      <div v-if="activeModal === 'display-properties'" class="xp-window animate-scale-up" style="max-width: 450px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">🖥️</span>
            <h2>Propriedades de Vídeo</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <div class="xp-window-body" style="padding: 10px;">
          <!-- Tabs -->
          <div class="xp-dialog-tabs">
            <div class="xp-dialog-tab active">Área de Trabalho</div>
          </div>
          
          <div class="xp-dialog-tab-body" style="padding: 15px; display: flex; flex-direction: column; gap: 15px; border: 1.5px solid #fff; box-shadow: inset 1px 1px 0 #fff; background: #f1efe2; margin-top: -11px;">
            <!-- Monitor Preview -->
            <div class="xp-monitor-preview" style="position: relative; width: 140px; height: 110px; margin: 0 auto; background: #333; border: 4px solid #555; border-radius: 6px; display: flex; justify-content: center; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
              <div class="xp-monitor-screen" :style="{ background: previewBackgroundStyle, backgroundSize: 'cover', backgroundPosition: 'center' }" style="width: 124px; height: 80px; border: 2px solid #000; border-radius: 2px; overflow: hidden; position: relative;">
                <div style="position: absolute; top: 10px; left: 10px; width: 50px; height: 30px; background: #ece9d8; border: 1.5px solid #0058e3; border-radius: 1px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: flex; flex-direction: column;">
                  <div style="background: linear-gradient(to right, #0058e3, #3080f0); height: 6px; width: 100%;"></div>
                  <div style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: 5px; color: #555; transform: scale(0.85);">XP Preview</div>
                </div>
              </div>
              <!-- stand -->
              <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 24px; height: 8px; background: #444; border-radius: 1px;"></div>
              <div style="position: absolute; bottom: -12px; left: 50%; transform: translateX(-50%); width: 50px; height: 4px; background: #555; border-radius: 3px 3px 0 0;"></div>
            </div>

            <!-- Options -->
            <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 5px;">
              <label style="font-weight: bold; font-size: 11px; font-family: Tahoma, sans-serif;">Plano de Fundo da Área de Trabalho:</label>
              <select v-model="selectedBgType" @change="updatePreview" style="width: 100%; padding: 4px; border: 2px solid #7f9db9; font-family: Tahoma, sans-serif; font-size: 11px; background: white; outline: none;">
                <option value="bliss">Windows XP Bliss (Colinas Verdes)</option>
                <option value="aqua">Frutiger Aero Aqua (Gotas de Água)</option>
                <option value="space">Deep Space (Espaço Sideral)</option>
                <option value="sunset">Sunset Beach (Pôr do Sol)</option>
                <option value="stripes">LeitadApp Stripes (Listras Clássicas)</option>
                <option value="custom">Outro (URL Personalizada...)</option>
              </select>
            </div>

            <!-- Custom URL -->
            <div v-if="selectedBgType === 'custom'" style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 10px; font-weight: bold; font-family: Tahoma, sans-serif;">Link URL da Imagem:</label>
              <input v-model="selectedCustomBgUrl" @input="updatePreview" type="text" placeholder="https://exemplo.com/imagem.jpg" style="width: 100%; padding: 4px 6px; border: 2px solid #7f9db9; font-size: 11px; font-family: Tahoma, sans-serif; box-sizing: border-box;" />
            </div>
          </div>
          
          <footer class="xp-modal-footer" style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn" style="min-width: 70px;">Cancelar</button>
            <button type="button" @click="applyAndSaveBg" class="btn-xp green-btn" style="min-width: 70px;">Aplicar</button>
            <button type="button" @click="applySaveAndCloseBg" class="btn-xp green-btn" style="min-width: 70px; font-weight: bold;">OK</button>
          </footer>
        </div>
      </div>

      <!-- USER MODAL -->
      <div v-if="activeModal === 'user'" class="xp-window animate-scale-up" style="max-width: 460px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">👤</span>
            <h2>Propriedades do Usuário</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <form @submit.prevent="submitUser" class="xp-form-modal">
          <div class="input-group">
            <label>Nome de Usuário (Username):</label>
            <input v-model="userForm.username" type="text" required placeholder="Astrea" />
          </div>
          <div class="input-group">
            <label>Endereço de E-mail:</label>
            <input v-model="userForm.email" type="email" placeholder="motorista@email.com" />
          </div>
          <div class="input-group">
            <label>Cargo (Role):</label>
            <select v-model="userForm.role">
              <option value="driver">Driver (Motorista)</option>
              <option value="admin">Administrador (Admin)</option>
            </select>
          </div>
          <div class="input-group">
            <label>Contador de Corridas:</label>
            <input v-model="userForm.tripsCount" type="number" min="0" required />
          </div>
          <div class="input-group">
            <label>{{ modalMode === 'create' ? 'Senha de Acesso:' : 'Senha (deixe em branco para não alterar):' }}</label>
            <input v-model="userForm.password" type="password" :required="modalMode === 'create'" placeholder="••••••••" />
          </div>
          <footer class="xp-modal-footer">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn">Cancelar</button>
            <button type="submit" class="btn-xp green-btn">Salvar Alterações</button>
          </footer>
        </form>
      </div>

      <!-- TRIP MODAL -->
      <div v-if="activeModal === 'trip'" class="xp-window animate-scale-up" style="max-width: 480px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">🚗</span>
            <h2>Propriedades da Corrida</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <form @submit.prevent="submitTrip" class="xp-form-modal">
          <div class="input-group" v-if="modalMode === 'create'">
            <label>Selecione o Motorista:</label>
            <select v-model="tripForm.userId" required>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
            </select>
          </div>
          <div class="input-group">
            <label>Nome Opcional da Corrida:</label>
            <input v-model="tripForm.name" type="text" placeholder="Ex: Viagem Matinal" />
          </div>
          <div class="grid-2-col-xp">
            <div class="input-group">
              <label>Distância (km):</label>
              <input v-model="tripForm.distanceKm" type="number" step="0.1" required />
            </div>
            <div class="input-group">
              <label>Duração (min):</label>
              <input v-model="tripForm.durationMin" type="number" required />
            </div>
          </div>
          <div class="grid-2-col-xp">
            <div class="input-group">
              <label>Velocidade Média (km/h):</label>
              <input v-model="tripForm.avgSpeed" type="number" step="0.1" />
            </div>
            <div class="input-group">
              <label>Quantidade de Passageiros:</label>
              <input v-model="tripForm.passengerCount" type="number" min="1" required />
            </div>
          </div>
          <div class="grid-2-col-xp">
            <div class="input-group">
              <label>Ponto Inicial (Partida):</label>
              <input v-model="tripForm.startLocation" type="text" placeholder="Rua..." />
            </div>
            <div class="input-group">
              <label>Ponto Final (Destino):</label>
              <input v-model="tripForm.endLocation" type="text" placeholder="Av..." />
            </div>
          </div>
          <div class="input-group">
            <label>XP / Pontos Acumulados:</label>
            <input v-model="tripForm.pointsGenerated" type="number" required />
          </div>
          <footer class="xp-modal-footer">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn">Cancelar</button>
            <button type="submit" class="btn-xp green-btn">Salvar Corrida</button>
          </footer>
        </form>
      </div>

      <!-- ADDRESS MODAL -->
      <div v-if="activeModal === 'address'" class="xp-window animate-scale-up" style="max-width: 400px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">📍</span>
            <h2>Novo Endereço Postal</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <form @submit.prevent="submitAddress" class="xp-form-modal">
          <div class="input-group">
            <label>Rua e Número:</label>
            <input v-model="addressForm.street" type="text" required placeholder="Rua das Flores, 123" />
          </div>
          <div class="input-group">
            <label>Cidade:</label>
            <input v-model="addressForm.city" type="text" required placeholder="São Paulo" />
          </div>
          <div class="grid-2-col-xp">
            <div class="input-group">
              <label>Estado:</label>
              <input v-model="addressForm.state" type="text" required placeholder="SP" />
            </div>
            <div class="input-group">
              <label>CEP (Código Postal):</label>
              <input v-model="addressForm.postalCode" type="text" required placeholder="01001-000" />
            </div>
          </div>
          <footer class="xp-modal-footer">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn">Cancelar</button>
            <button type="submit" class="btn-xp green-btn">Salvar</button>
          </footer>
        </form>
      </div>

      <!-- COMMENT MODAL -->
      <div v-if="activeModal === 'comment'" class="xp-window animate-scale-up" style="max-width: 400px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">💬</span>
            <h2>Novo Comentário no Perfil</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <form @submit.prevent="submitComment" class="xp-form-modal">
          <div class="input-group">
            <label>Autor do Comentário:</label>
            <input v-model="commentForm.authorName" type="text" required />
          </div>
          <div class="input-group">
            <label>Conteúdo da Mensagem:</label>
            <textarea v-model="commentForm.content" rows="4" required placeholder="Escreva a crítica ou elogio do perfil..."></textarea>
          </div>
          <footer class="xp-modal-footer">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn">Cancelar</button>
            <button type="submit" class="btn-xp green-btn">Enviar</button>
          </footer>
        </form>
      </div>

      <!-- WAYPOINT MODAL -->
      <div v-if="activeModal === 'waypoint'" class="xp-window animate-scale-up" style="max-width: 400px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">🚩</span>
            <h2>Inserir Ponto de Parada</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <form @submit.prevent="submitWaypoint" class="xp-form-modal">
          <div class="input-group">
            <label>Endereço / Referência:</label>
            <input v-model="waypointForm.address" type="text" required placeholder="Metrô Ana Rosa" />
          </div>
          <div class="input-group">
            <label>Ordem da Parada:</label>
            <input v-model="waypointForm.order" type="number" min="1" required />
          </div>
          <footer class="xp-modal-footer">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn">Cancelar</button>
            <button type="submit" class="btn-xp green-btn">Confirmar</button>
          </footer>
        </form>
      </div>

      <!-- MEDIA MODAL -->
      <div v-if="activeModal === 'media'" class="xp-window animate-scale-up" style="max-width: 400px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">📸</span>
            <h2>Inserir Nova Mídia</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <form @submit.prevent="submitMedia" class="xp-form-modal">
          <div class="input-group">
            <label>Tipo do Arquivo:</label>
            <select v-model="mediaForm.type">
              <option value="text">Texto Informativo</option>
              <option value="image">Imagem (URL)</option>
              <option value="audio">Áudio (URL)</option>
            </select>
          </div>
          <div class="input-group">
            <label>Conteúdo (Texto ou URL do arquivo):</label>
            <input v-model="mediaForm.content" type="text" required placeholder="https://..." />
          </div>
          <footer class="xp-modal-footer">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn">Cancelar</button>
            <button type="submit" class="btn-xp green-btn">Salvar Mídia</button>
          </footer>
        </form>
      </div>

      <!-- ACHIEVEMENT MODAL -->
      <div v-if="activeModal === 'achievement'" class="xp-window animate-scale-up" style="max-width: 420px;">
        <header class="xp-titlebar">
          <div class="titlebar-logo">
            <span class="logo-icon">🏆</span>
            <h2>Propriedades da Conquista</h2>
          </div>
          <button @click="activeModal = null" class="win-btn close">X</button>
        </header>
        <form @submit.prevent="submitAchievement" class="xp-form-modal">
          <div class="input-group">
            <label>Identificador Único (key):</label>
            <input v-model="achievementForm.key" type="text" required placeholder="eco-expert" :disabled="modalMode === 'update'" />
          </div>
          <div class="input-group">
            <label>Título:</label>
            <input v-model="achievementForm.title" type="text" required placeholder="Especialista Eco" />
          </div>
          <div class="input-group">
            <label>Descrição:</label>
            <input v-model="achievementForm.description" type="text" required placeholder="Complete corridas com baixo CO2" />
          </div>
          <div class="grid-2-col-xp">
            <div class="input-group">
              <label>Emoji Representativo:</label>
              <input v-model="achievementForm.emoji" type="text" required placeholder="🌱" style="font-size: 20px; text-align: center;" />
            </div>
            <div class="input-group">
              <label>Efeito de Brilho (Glow):</label>
              <select v-model="achievementForm.glowColor">
                <option value="cyan">Ciano (Retro)</option>
                <option value="emerald">Verde Lunar</option>
                <option value="amber">Ouro Clássico</option>
                <option value="rose">Rosa Neon</option>
              </select>
            </div>
          </div>
          <footer class="xp-modal-footer">
            <button type="button" @click="activeModal = null" class="btn-xp secondary-btn">Cancelar</button>
            <button type="submit" class="btn-xp green-btn">Gravar Registro</button>
          </footer>
        </form>
      </div>
    </div>

    <!-- Active Toasts -->
    <div v-if="toasts.length > 0" class="xp-toast-container">
      <div v-for="t in toasts" :key="t.id" :class="['xp-toast', t.type]">
        <span class="icon">{{ t.type === 'success' ? '💾' : '⚠️' }}</span>
        <span>{{ t.msg }}</span>
      </div>
    </div>
  </div>
</template>

<style>
/* ==========================================
   Estética Windows XP Exagerada (Luna Theme)
   ========================================== */

.xp-wrapper {
  min-height: 100vh;
  width: 100vw;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  background: transparent;
  color: #000;
  font-family: 'Tahoma', 'Segoe UI', sans-serif;
  overflow-x: hidden;
  box-sizing: border-box;
}

/* Exaggerated Windows XP Dialog Box */
.xp-dialog {
  position: relative;
  background: #ece9d8;
  border-top: 4px solid #0054e3;
  border-left: 4px solid #0054e3;
  border-right: 4px solid #0054e3;
  border-bottom: 4px solid #0054e3;
  box-shadow: 10px 10px 0px rgba(0, 0, 0, 0.4);
  z-index: 10;
  border-radius: 8px 8px 0 0;
}

.center-dialog {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 20px;
  text-align: center;
}

/* Generic Windows XP Window */
.xp-window {
  background: #ece9d8;
  border: 4px solid #0054e3;
  border-radius: 8px 8px 0 0;
  box-shadow: 10px 10px 0px rgba(0, 0, 0, 0.3);
  z-index: 10;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.center-window {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
}

/* Exaggerated XP Title Bar */
.xp-titlebar {
  background: linear-gradient(to bottom, #0058e3 0%, #3080f0 12%, #0058e3 50%, #002ca6 100%);
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  border-bottom: 2px solid #002ca6;
}

.titlebar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 18px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}

.xp-titlebar h2 {
  font-size: 13px;
  font-weight: bold;
  margin: 0;
  text-shadow: 1px 1px 2px #000;
  font-family: 'Tahoma', sans-serif;
  letter-spacing: 0.5px;
}

.window-controls {
  display: flex;
  gap: 3px;
}

/* Window Control Buttons */
.win-btn {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  border-top: 1px solid #fff;
  border-left: 1px solid #fff;
  border-bottom: 2px solid #000;
  border-right: 2px solid #000;
  font-weight: bold;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 1px 1px 0px rgba(255,255,255,0.4);
}

.win-btn.min, .win-btn.max {
  background: linear-gradient(135deg, #7ba2e7, #3e6dc8);
  color: white;
}
.win-btn.min:active, .win-btn.max:active {
  border-top: 2px solid #000;
  border-left: 2px solid #000;
  border-bottom: 1px solid #fff;
  border-right: 1px solid #fff;
}

.win-btn.close {
  background: linear-gradient(to bottom, #f87171 0%, #dc2626 50%, #b91c1c 100%);
  color: white;
  font-size: 10px;
  font-family: 'Arial', sans-serif;
}
.win-btn.close:active {
  border-top: 2px solid #000;
  border-left: 2px solid #000;
  border-bottom: 1px solid #fff;
  border-right: 1px solid #fff;
}

.win-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Menubar */
.xp-menubar {
  background: #ece9d8;
  border-bottom: 1px solid #d6d2c2;
  padding: 4px 10px;
  display: flex;
  gap: 15px;
  font-size: 11px;
  color: #000;
  font-weight: 500;
  box-shadow: inset 0 -1px 0 #fff;
}

.xp-menubar span {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
}
.xp-menubar span:hover {
  background: #316ac5;
  color: white;
}

.xp-window-body {
  background: #ece9d8;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Logon forms */
.xp-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.xp-error-text {
  color: #ba1a1a;
  font-weight: bold;
  font-size: 11px;
  margin: 5px 0 0 0;
  text-align: center;
  background: #fff;
  border: 1px solid #ba1a1a;
  padding: 4px;
}

/* Exaggerated XP Buttons with heavy beveled borders */
.btn-xp {
  padding: 6px 16px;
  font-weight: bold;
  font-size: 12px;
  font-family: 'Tahoma', sans-serif;
  cursor: pointer;
  outline: none;
  /* Thick 3D Bevel unpressed state */
  border-top: 3px solid #ffffff;
  border-left: 3px solid #ffffff;
  border-bottom: 3px solid #555555;
  border-right: 3px solid #555555;
  box-shadow: inset 1px 1px 1px #ffffff;
  transition: none; /* Instant feedback */
}

.btn-xp:active {
  /* Pressed state */
  border-top: 3px solid #555555;
  border-left: 3px solid #555555;
  border-bottom: 3px solid #ffffff;
  border-right: 3px solid #ffffff;
  box-shadow: inset -1px -1px 1px #ffffff;
  padding: 7px 15px 5px 17px; /* Click movement offset! */
}

.green-btn {
  background: linear-gradient(to bottom, #4ade80 0%, #388e3c 100%);
  color: white;
  text-shadow: 1px 1px 1px #143e08;
}

.blue-btn {
  background: linear-gradient(to bottom, #38bdf8 0%, #0284c7 100%);
  color: white;
  text-shadow: 1px 1px 1px #03456a;
}

.secondary-btn {
  background: #ece9d8;
  color: #000;
}

.red-btn {
  background: linear-gradient(to bottom, #f87171 0%, #dc2626 100%);
  color: white;
  text-shadow: 1px 1px 1px #5c0707;
}

/* XP Input boxes with Inset bevel */
.input-group input, .input-group select, .input-group textarea {
  background: #ffffff;
  color: #000;
  font-family: 'Tahoma', sans-serif;
  font-size: 12px;
  padding: 6px 10px;
  outline: none;
  /* Inset bevel style */
  border-top: 2px solid #555555;
  border-left: 2px solid #555555;
  border-bottom: 2px solid #ffffff;
  border-right: 2px solid #ffffff;
  box-sizing: border-box;
}

.input-group input:focus, .input-group select:focus, .input-group textarea:focus {
  border-color: #ff9900; /* Windows XP orange focus ring */
}

/* XP Desktop layout */
.xp-desktop-layout {
  position: relative;
  z-index: 5;
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 0 0 36px 0; /* space for taskbar */
}

.main-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0 !important;
  border: none !important;
  box-shadow: none !important;
  width: 100vw;
}

.admin-content-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* XP Taskbar */
.xp-taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 36px;
  background: linear-gradient(to bottom, #245edc 0%, #3a7ceb 8%, #245edc 50%, #193f8a 100%);
  border-top: 2px solid #3080f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 0 0;
  z-index: 999;
  box-sizing: border-box;
}

.start-button {
  height: 100%;
  background: linear-gradient(to bottom, #44ab2a 0%, #2e7a17 100%);
  border-top: 2px solid #54c935;
  border-left: 2px solid #54c935;
  border-bottom: 2px solid #143e08;
  border-right: 2px solid #143e08;
  border-radius: 0 10px 10px 0;
  color: white;
  font-weight: bold;
  font-style: italic;
  font-size: 15px;
  font-family: 'Tahoma', sans-serif;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px 0 12px;
  cursor: pointer;
  box-shadow: 2px 0 5px rgba(0,0,0,0.3);
  text-shadow: 1px 1px 2px #000;
}
.start-button:active {
  border-top: 2px solid #143e08;
  border-left: 2px solid #143e08;
  border-bottom: 2px solid #54c935;
  border-right: 2px solid #54c935;
}

.taskbar-running-apps {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 10px;
}

.taskbar-tab {
  background: #3c81f7;
  border: 1px solid #1b4b9b;
  border-top: 2px solid #669dfc;
  color: white;
  font-size: 11px;
  font-weight: bold;
  padding: 4px 15px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: inset 1px 1px 0px rgba(255,255,255,0.3);
  cursor: pointer;
  max-width: 150px;
}

.taskbar-tab.active {
  background: #1e3f80;
  border-top: 2px solid #162f60;
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);
}

.taskbar-tray {
  background: #092e6f;
  border-top: 2px solid #061d47;
  border-left: 2px solid #061d47;
  border-bottom: 1px solid #1d4db5;
  border-right: 1px solid #1d4db5;
  height: 24px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #38bdf8;
  font-size: 10px;
}

.tray-clock {
  color: white;
  font-weight: bold;
  font-family: 'Tahoma', sans-serif;
  margin-left: 4px;
}

/* XP Sidebar tasks navigation */
.xp-sidebar {
  width: 240px;
  background: linear-gradient(to bottom, #7ba2e7 0%, #3e6dc8 100%);
  padding: 15px 12px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow-y: auto;
  border-right: 2px solid #245edc;
}

.xp-sidebar-panel {
  background: #ffffff;
  border-radius: 4px;
  border: 1px solid #245edc;
  overflow: hidden;
  box-shadow: 2px 2px 4px rgba(0,0,0,0.15);
}

.xp-sidebar-panel .panel-header {
  background: linear-gradient(to right, #7ba2e7 0%, #3e6dc8 100%);
  padding: 6px 12px;
  color: white;
  font-weight: bold;
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-shadow: 1px 1px 1px #0f3075;
}

.xp-sidebar-panel .panel-body {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fafafa;
}

.sidebar-nav-item {
  width: 100%;
  padding: 6px 10px;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  font-size: 11px;
  font-weight: bold;
  color: #003399;
  cursor: pointer;
  display: block;
}

.sidebar-nav-item:hover {
  text-decoration: underline;
  background: rgba(36, 94, 220, 0.05);
}

.sidebar-nav-item.active {
  background: #ffcc00;
  border: 1px solid #ff9900;
  color: #000;
  border-radius: 4px;
}

/* Main CMS Content Grid */
.xp-main-panel {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  box-sizing: border-box;
}

.pane-header-xp {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #0058e3;
  padding-bottom: 12px;
  margin-bottom: 20px;
}

.pane-header-xp h3 {
  font-size: 16px;
  font-weight: bold;
  color: #003399;
  margin: 0;
}

.pane-header-xp p {
  margin: 3px 0 0 0;
  font-size: 11px;
  color: #555;
}

.search-bar-xp {
  background: #f1efe2;
  border: 1px solid #d6d2c2;
  padding: 10px 15px;
  margin-bottom: 15px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-bar-xp label {
  font-size: 11px;
  font-weight: bold;
  color: #333;
}

.search-bar-xp input {
  flex: 1;
  padding: 5px 10px;
  font-size: 11px;
}

/* XP Table with Grid borders */
.xp-table-container {
  background: #ffffff;
  border-top: 2px solid #555555;
  border-left: 2px solid #555555;
  border-bottom: 2px solid #ffffff;
  border-right: 2px solid #ffffff;
  overflow-x: auto;
}

.xp-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 11px;
}

.xp-table th {
  background: #ece9d8;
  color: #000;
  font-weight: bold;
  padding: 8px 10px;
  /* Beveled header cells */
  border-top: 1px solid #ffffff;
  border-left: 1px solid #ffffff;
  border-bottom: 2px solid #888888;
  border-right: 2px solid #888888;
  box-shadow: inset 1px 1px 0px #ffffff;
}

.xp-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #ece9d8;
  border-right: 1px solid #ece9d8;
  color: #000;
}

.xp-table tr:hover {
  background: rgba(49, 106, 197, 0.06);
}

.toggle-expand-xp {
  cursor: pointer;
  color: #003399;
  font-size: 8px;
  width: 15px;
  text-align: center;
}

.xp-table-tag {
  background: #f1f1f1;
  border: 1px solid #bbb;
  padding: 1px 6px;
  font-weight: bold;
}

.role-badge-xp {
  font-size: 9px;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 2px;
  text-transform: uppercase;
}

.role-badge-xp.driver {
  background: #e2f9e1;
  border: 1px solid #8fe08c;
  color: #2e7d32;
}

.role-badge-xp.admin {
  background: #f5f2ff;
  border: 1px solid #d4c5f9;
  color: #7c3aed;
}

/* Action Buttons Mini Bevel */
.action-buttons-xp {
  display: flex;
  gap: 4px;
}

.btn-xp-mini {
  background: #ece9d8;
  border-top: 1px solid #fff;
  border-left: 1px solid #fff;
  border-bottom: 1.5px solid #666;
  border-right: 1.5px solid #666;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: bold;
  cursor: pointer;
}

.btn-xp-mini:active {
  border-top: 1.5px solid #666;
  border-left: 1.5px solid #666;
  border-bottom: 1px solid #fff;
  border-right: 1px solid #fff;
}

.btn-xp-mini.red-text {
  color: #b91c1c;
}

/* Expanded rows in XP grid */
.expanded-row-xp {
  background: #f5f4ea;
}

.expanded-details-xp {
  padding: 12px 20px;
  border: 1px solid #0058e3;
  background: #ffffff;
  margin: 6px;
}

.grid-details-xp {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.details-section-xp h4 {
  margin: 0;
  font-size: 11px;
  color: #003399;
  font-weight: bold;
}

.section-title-row-xp {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px dashed #245edc;
  padding-bottom: 6px;
  margin-bottom: 10px;
}

.btn-xp-micro {
  background: #ece9d8;
  border-top: 1px solid #fff;
  border-left: 1px solid #fff;
  border-bottom: 1.5px solid #555;
  border-right: 1.5px solid #555;
  padding: 1px 5px;
  font-size: 9px;
  font-weight: bold;
  cursor: pointer;
}

.details-list-xp {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.details-list-xp li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafafa;
  border: 1px solid #e1e0d6;
  padding: 4px 8px;
  font-size: 11px;
}

.btn-trash-xp {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 10px;
}

.comment-item-xp {
  display: flex;
  align-items: flex-start !important;
  gap: 8px;
}

.comment-bubble-xp {
  flex: 1;
}

.bubble-meta-xp {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #666;
}

.comment-bubble-xp p {
  margin: 2px 0 0 0;
  font-size: 11px;
}

.empty-list-xp {
  font-size: 10px;
  color: #777;
  font-style: italic;
}

/* Media Cards XP */
.media-grid-xp {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.media-card-xp {
  background: #fdfdfd;
  border: 1px solid #d6d2c2;
  padding: 6px;
  position: relative;
}

.media-type-badge {
  font-size: 8px;
  font-weight: bold;
  background: #0058e3;
  color: white;
  padding: 1px 4px;
  width: fit-content;
  text-transform: uppercase;
}

.media-thumb-xp {
  width: 100%;
  height: 50px;
  object-fit: cover;
  margin-top: 4px;
}

.media-text-preview {
  font-size: 10px;
  margin: 4px 0 0 0;
}

.btn-trash-xp-abs {
  position: absolute;
  top: 4px;
  right: 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 10px;
}

/* Achievements grid Windows XP */
.ach-grid-xp {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.ach-card-xp {
  background: #ffffff;
  border-top: 1px solid #ffffff;
  border-left: 1px solid #ffffff;
  border-bottom: 2px solid #888888;
  border-right: 2px solid #888888;
  box-shadow: 2px 2px 4px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}

.ach-card-header-xp {
  background: #ece9d8;
  border-bottom: 1px solid #d6d2c2;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ach-card-header-xp .emoji-block {
  font-size: 24px;
}

.ach-card-body-xp {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.ach-card-body-xp h4 {
  margin: 0 0 4px 0;
  font-size: 12px;
  font-weight: bold;
  color: #003399;
}

.ach-card-body-xp .key {
  font-size: 9px;
  color: #777;
  margin: 0 0 6px 0;
}

.ach-card-body-xp .desc {
  font-size: 11px;
  margin: 0 0 10px 0;
  flex: 1;
}

.glow-badge-xp {
  font-size: 8px;
  font-weight: bold;
  padding: 1px 6px;
  width: fit-content;
  text-transform: uppercase;
}
.glow-badge-xp.cyan { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
.glow-badge-xp.emerald { background: #d1fae5; color: #047857; border: 1px solid #a7f3d0; }
.glow-badge-xp.amber { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
.glow-badge-xp.rose { background: #ffe4e6; color: #be123c; border: 1px solid #fecdd3; }

/* XP Assignments Panel Card */
.xp-card {
  background: #ffffff;
  border-top: 1px solid #ffffff;
  border-left: 1px solid #ffffff;
  border-bottom: 2px solid #888888;
  border-right: 2px solid #888888;
}

.xp-card-header-gray {
  background: #ece9d8;
  padding: 8px 12px;
  font-weight: bold;
  font-size: 11px;
  color: #333;
  border-bottom: 1px solid #d6d2c2;
}

.xp-card-body {
  padding: 15px;
}

.xp-grid-form {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 15px;
  align-items: flex-end;
}

.ach-badge-xp-pill {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
  padding: 1px 6px;
  font-weight: bold;
}

/* Modais Generic Setup Windows XP style */
.xp-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.xp-form-modal {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-2-col-xp {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.xp-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
  border-top: 1px solid #d6d2c2;
  padding-top: 12px;
}

/* Toasts Windows XP luna tray style balloon tip */
.xp-toast-container {
  position: fixed;
  bottom: 45px; /* above taskbar */
  right: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 99999;
}

.xp-toast {
  background: #ffffe1; /* Balloon tooltip yellow */
  border: 1px solid #000;
  padding: 10px 15px;
  font-size: 11px;
  color: #000;
  font-family: 'Tahoma', sans-serif;
  box-shadow: 3px 3px 5px rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  border-radius: 4px;
}

.xp-toast.error {
  background: #fee2e2;
  border-color: #ef4444;
}

/* Animations */
.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
}
.animate-scale-up {
  animation: scaleUp 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUp {
  from { transform: scale(0.97); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.loader-dialog {
  display: inline-block;
}

.xp-spinner {
  width: 32px;
  height: 32px;
  border: 4px solid #d6d2c2;
  border-top-color: #0058e3;
  border-radius: 50%;
  animation: spinXp 0.8s linear infinite;
  margin: 0 auto;
}

@keyframes spinXp {
  to { transform: rotate(360deg); }
}

.text-shadow {
  text-shadow: 1px 1px 1px #fff;
}

/* Context Menu */
.xp-context-menu {
  position: fixed;
  z-index: 10000;
  background: #ece9d8;
  border: 1px solid #7f9db9;
  box-shadow: 2px 2px 2px rgba(0,0,0,0.4);
  padding: 2px;
  width: 150px;
  font-family: Tahoma, sans-serif;
  font-size: 11px;
  box-sizing: border-box;
}

.context-item {
  padding: 4px 10px;
  cursor: pointer;
  color: #000;
  display: flex;
  justify-content: space-between;
}

.context-item:hover {
  background: #316ac5;
  color: #fff;
}

/* Display Properties Modal Elements */
.xp-dialog-tabs {
  display: flex;
  border-bottom: 1px solid #d6d2c2;
  margin-bottom: 10px;
  padding-left: 5px;
}

.xp-dialog-tab {
  background: #ece9d8;
  border-top: 1px solid #fff;
  border-left: 1px solid #fff;
  border-right: 1px solid #999;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  padding: 4px 12px;
  font-size: 11px;
  font-family: Tahoma, sans-serif;
  cursor: default;
  margin-bottom: -1px;
  z-index: 1;
}

.xp-dialog-tab.active {
  background: #ece9d8;
  border-top: 1px solid #fff;
  border-left: 1px solid #fff;
  border-right: 1px solid #999;
  font-weight: bold;
  padding-bottom: 5px;
}

.xp-dialog-tab-body {
  border: 1px solid #fff;
  border-right-color: #999;
  border-bottom-color: #999;
  background: #f1efe2;
  box-shadow: inset 1px 1px 0px #fff;
}
</style>
