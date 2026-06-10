<script setup>
import { defineProps, defineEmits, ref } from 'vue';
import { API_URL } from '../../utils/api';

const props = defineProps({
  userId: {
    type: [String, Number],
    required: true
  },
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  pushNotifications: {
    type: Boolean,
    required: true
  },
  pointsAlerts: {
    type: Boolean,
    required: true
  },
  socialRanking: {
    type: Boolean,
    required: true
  },
  publicProfile: {
    type: Boolean,
    required: true
  },
  sfxVolume: {
    type: Number,
    required: true
  },
  musicVolume: {
    type: Number,
    required: true
  },
  appBgType: {
    type: String,
    required: true
  },
  appCustomBgUrl: {
    type: String,
    required: true
  },
  defaultBackgrounds: {
    type: Array,
    required: true
  },
  showMusicWidget: {
    type: Boolean,
    required: true
  },
  requests: {
    type: Array,
    default: () => []
  },
  spotifyConnected: {
    type: Boolean,
    default: false
  },
  customLocations: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits([
  'toggle-setting',
  'update-volume',
  'change-bg',
  'prompt-edit-email',
  'prompt-edit-username',
  'submit-request',
  'connect-spotify',
  'disconnect-spotify',
  'logout',
  'update:sfxVolume',
  'update:musicVolume',
  'update:appBgType',
  'update:appCustomBgUrl',
  'add-custom-location',
  'delete-custom-location'
]);

function onVolumeInput(type, event) {
  const value = parseFloat(event.target.value);
  if (type === 'sfx') {
    emit('update:sfxVolume', value);
  } else if (type === 'music') {
    emit('update:musicVolume', value);
  }
  emit('update-volume', type);
}

function onBgTypeChange(event) {
  emit('update:appBgType', event.target.value);
  emit('change-bg');
}

function onCustomBgInput(event) {
  emit('update:appCustomBgUrl', event.target.value);
  emit('change-bg');
}

const isUploadingCustomBg = ref(false);

async function handleCustomBgUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  isUploadingCustomBg.value = true;
  try {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) throw new Error('Falha no upload da imagem');
    const data = await res.json();
    emit('update:appCustomBgUrl', `${API_URL}${data.fileUrl}`);
    emit('change-bg');
  } catch (err) {
    alert(err.message);
  } finally {
    isUploadingCustomBg.value = false;
  }
}

const showRequestModal = ref(false);
const requestForm = ref({
  type: 'trip',
  tripName: '',
  distanceKm: 10,
  durationMin: 15,
  passengerCount: 1,
  avgSpeed: 45,
  startLocation: '',
  endLocation: '',
  achTitle: '',
  achDescription: '',
  achEmoji: '🏆',
  achGlowColor: '',
  musicTitle: '',
  audioUrl: '',
  coverUrl: '',
  bgTitle: '',
  bgUrl: ''
});

function openModal() {
  requestForm.value = {
    type: 'trip',
    tripName: '',
    distanceKm: 10,
    durationMin: 15,
    passengerCount: 1,
    avgSpeed: 45,
    startLocation: '',
    endLocation: '',
    achTitle: '',
    achDescription: '',
    achEmoji: '🏆',
    achGlowColor: '',
    musicTitle: '',
    audioUrl: '',
    coverUrl: '',
    bgTitle: '',
    bgUrl: ''
  };
  showRequestModal.value = true;
}

function submitLocalRequest() {
  const type = requestForm.value.type;
  let details = {};
  
  if (type === 'trip') {
    details = {
      name: requestForm.value.tripName.trim() || 'Corrida Sugerida',
      distanceKm: parseFloat(requestForm.value.distanceKm) || 0,
      durationMin: parseInt(requestForm.value.durationMin, 10) || 0,
      passengerCount: parseInt(requestForm.value.passengerCount, 10) || 1,
      avgSpeed: parseFloat(requestForm.value.avgSpeed) || null,
      startLocation: requestForm.value.startLocation.trim() || null,
      endLocation: requestForm.value.endLocation.trim() || null
    };
  } else if (type === 'achievement') {
    if (!requestForm.value.achTitle.trim()) {
      alert('O título da medalha é obrigatório.');
      return;
    }
    details = {
      title: requestForm.value.achTitle.trim(),
      description: requestForm.value.achDescription.trim() || 'Descrição pendente',
      emoji: requestForm.value.achEmoji.trim() || '🏆',
      glowColor: requestForm.value.achGlowColor || null,
      key: `ach-${Date.now()}`
    };
  } else if (type === 'music') {
    if (!requestForm.value.musicTitle.trim()) {
      alert('O título da música é obrigatório.');
      return;
    }
    details = {
      title: requestForm.value.musicTitle.trim(),
      audioUrl: requestForm.value.audioUrl.trim(),
      coverUrl: requestForm.value.coverUrl.trim() || null
    };
  } else if (type === 'background') {
    if (!requestForm.value.bgTitle.trim() || !requestForm.value.bgUrl.trim()) {
      alert('Título e URL da imagem são obrigatórios.');
      return;
    }
    details = {
      title: requestForm.value.bgTitle.trim(),
      url: requestForm.value.bgUrl.trim(),
      key: `bg-${Date.now()}`
    };
  }

  emit('submit-request', { type, details });
  showRequestModal.value = false;
}

function getRequestLabel(req) {
  try {
    const details = typeof req.details === 'string' ? JSON.parse(req.details) : req.details;
    if (req.type === 'trip') {
      return `${details.name || 'Corrida'} (${details.distanceKm} km, ${details.durationMin} min)`;
    }
    return details.title || 'Sugestão sem título';
  } catch (_) {
    return 'Ver detalhes';
  }
}

function getStatusStyle(status) {
  if (status === 'pending') return { backgroundColor: '#fef3c7', color: '#d97706' };
  if (status === 'approved') return { backgroundColor: '#dcfce7', color: '#15803d' };
  return { backgroundColor: '#fee2e2', color: '#b91c1c' };
}

const newLocForm = ref({
  name: '',
  inputType: 'address',
  address: '',
  latitude: '',
  longitude: ''
});

function submitAddLocation() {
  if (!newLocForm.value.name.trim()) {
    alert('O nome da localização é obrigatório.');
    return;
  }
  
  const payload = {
    name: newLocForm.value.name.trim(),
    address: newLocForm.value.inputType === 'address' ? newLocForm.value.address.trim() : '',
    latitude: newLocForm.value.inputType === 'coords' && newLocForm.value.latitude ? parseFloat(newLocForm.value.latitude) : null,
    longitude: newLocForm.value.inputType === 'coords' && newLocForm.value.longitude ? parseFloat(newLocForm.value.longitude) : null
  };
  
  emit('add-custom-location', payload);
  
  // Reset form
  newLocForm.value = {
    name: '',
    inputType: 'address',
    address: '',
    latitude: '',
    longitude: ''
  };
}
</script>

<template>
  <div class="settings-tab-container">
    <div class="flex flex-col gap-6">
      <!-- Conta -->
      <div>
          <p class="profile-section-title" style="padding-left:4px">Minha Conta</p>
          <div class="flex flex-col gap-2">
            <div class="settings-row">
              <div class="settings-item-left">
                <div class="settings-icon-box bg-slate-100">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <div>
                  <p class="settings-label">ID do Usuário</p>
                  <p class="settings-desc">{{ userId }}</p>
                </div>
              </div>
            </div>
            <div class="settings-row" @click="emit('prompt-edit-username')" style="cursor: pointer;">
              <div class="settings-item-left">
                <div class="settings-icon-box bg-blue-100" style="background-color: #e0f2fe; color: #0284c7;">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <div>
                  <p class="settings-label">Nome de Usuário</p>
                  <p class="settings-desc">{{ username }}</p>
                </div>
              </div>
              <svg class="settings-row-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
              </svg>
            </div>
            <div class="settings-row" @click="emit('prompt-edit-email')" style="cursor: pointer;">
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
            <!-- Spotify Integration -->
            <div class="settings-row" style="cursor: default;">
              <div class="settings-item-left">
                <div class="settings-icon-box" style="background-color: #e8fbf0; color: #1db954;">
                  <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.892-.982-.336.076-.67-.135-.747-.472-.077-.336.135-.67.472-.747 3.852-.879 7.144-.505 9.822 1.135.295.18.387.565.207.86zm1.225-2.72c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.85-.107-.975-.52-.125-.413.107-.85.52-.975 3.678-1.117 8.243-.574 11.35 1.337.368.227.488.708.26 1.08zm.106-2.833C14.39 8.879 8.57 8.686 5.2 9.71c-.512.155-1.04-.135-1.196-.648-.156-.513.136-1.04.648-1.197 3.874-1.176 10.3-1.008 14.398 1.425.46.273.61.87.337 1.33-.273.46-.87.61-1.33.337z"/>
                  </svg>
                </div>
                <div>
                  <p class="settings-label">Integração Spotify</p>
                  <p class="settings-desc">{{ spotifyConnected ? 'Conectado com sucesso' : 'Sincronizar música ativa' }}</p>
                </div>
              </div>
              <div>
                <button 
                  v-if="!spotifyConnected" 
                  @click="emit('connect-spotify')" 
                  class="btn-xp green-btn" 
                  style="padding: 4px 10px; font-size: 11px; background-color: #1db954; border-color: #1aa34a;"
                >
                  Conectar 🔗
                </button>
                <button 
                  v-else 
                  @click="emit('disconnect-spotify')" 
                  class="btn-xp red-btn" 
                  style="padding: 4px 10px; font-size: 11px;"
                >
                  Desconectar ❌
                </button>
              </div>
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
                @click="emit('toggle-setting', 'pushNotifications')"
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
                  <p class="settings-label">Alertas de Pontos</p>
                  <p class="settings-desc">Quando ganhar pontos</p>
                </div>
              </div>
              <div 
                :class="['toggle', pointsAlerts ? 'on' : 'off']" 
                @click="emit('toggle-setting', 'pointsAlerts')"
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
                @click="emit('toggle-setting', 'socialRanking')"
              >
                <div class="toggle-knob"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Áudio e Volumes -->
        <div>
          <p class="profile-section-title" style="padding-left:4px">Áudio e Volumes</p>
          <div class="flex flex-col gap-2">
            <!-- SFX Volume Row -->
            <div class="settings-row" style="flex-direction: column; align-items: stretch; padding: 16px; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div class="settings-item-left">
                  <div class="settings-icon-box bg-blue-100" style="background-color: #e0f2fe; color: #0284c7; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
                      <path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                    </svg>
                  </div>
                  <div>
                    <p class="settings-label">Efeitos Sonoros (SFX)</p>
                    <p class="settings-desc">Volume dos cliques e alertas</p>
                  </div>
                </div>
                <span style="font-size: 12px; font-weight: bold; color: #475569;">{{ Math.round(sfxVolume * 100) }}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                :value="sfxVolume" 
                @input="onVolumeInput('sfx', $event)"
                style="width: 100%; cursor: pointer;"
              />
            </div>

            <!-- Music Volume Row -->
            <div class="settings-row" style="flex-direction: column; align-items: stretch; padding: 16px; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div class="settings-item-left">
                  <div class="settings-icon-box bg-purple-100" style="background-color: #f3e8ff; color: #7c3aed; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
                      <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                    </svg>
                  </div>
                  <div>
                    <p class="settings-label">Música de Fundo</p>
                    <p class="settings-desc">Volume do tocador de música</p>
                  </div>
                </div>
                <span style="font-size: 12px; font-weight: bold; color: #475569;">{{ Math.round(musicVolume * 100) }}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                :value="musicVolume" 
                @input="onVolumeInput('music', $event)"
                style="width: 100%; cursor: pointer;"
              />
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
                  <select :value="appBgType" @change="onBgTypeChange" style="width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 13px; outline: none; cursor: pointer; transition: all 0.2s;">
                    <option v-for="bg in defaultBackgrounds" :key="bg.key" :value="bg.key">{{ bg.title }}</option>
                    <option value="custom">Inserir Link Personalizado...</option>
                  </select>
                  
                  <div v-if="appBgType === 'custom'" style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 4px;">
                      <label style="font-size: 11px; font-weight: 600; color: #475569;">Fazer Upload de Imagem:</label>
                      <input type="file" accept="image/*" @change="handleCustomBgUpload" style="font-size: 12px;" />
                      <span v-if="isUploadingCustomBg" style="font-size: 11px; color: #3b82f6; margin-top: 2px;">⏳ Enviando...</span>
                    </div>
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 4px;">
                      <label style="font-size: 11px; font-weight: 600; color: #475569;">Ou insira a URL da Imagem:</label>
                      <input :value="appCustomBgUrl" @input="onCustomBgInput" type="text" placeholder="https://exemplo.com/imagem.jpg" style="width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 13px; outline: none; box-sizing: border-box;" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Interface do Aplicativo -->
        <div>
          <p class="profile-section-title" style="padding-left:4px">Interface do Aplicativo</p>
          <div class="flex flex-col gap-2">
            <div class="settings-row">
              <div class="settings-item-left">
                <div class="settings-icon-box bg-purple-100" style="background-color: #f3e8ff; color: #7c3aed;">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
                    <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
                  </svg>
                </div>
                <div>
                  <p class="settings-label">Exibir Tocador de Música</p>
                  <p class="settings-desc">Mostrar tocador de música flutuante na tela</p>
                </div>
              </div>
              <div 
                :class="['toggle', showMusicWidget ? 'on' : 'off']" 
                @click="emit('toggle-setting', 'showMusicWidget')"
              >
                <div class="toggle-knob"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Central de Sugestões -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-left: 4px;">
            <p class="profile-section-title" style="margin: 0;">Central de Sugestões</p>
            <button @click="openModal" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: background 0.2s;">
              ➕ Sugerir Inclusão
            </button>
          </div>
          
          <div class="flex flex-col gap-2">
            <!-- Lista de Solicitações -->
            <div v-if="requests && requests.length > 0" class="settings-row" style="flex-direction: column; align-items: stretch; gap: 8px; padding: 12px 16px;">
              <div style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;" class="no-scroll">
                <div v-for="req in requests" :key="req.id" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(0,0,0,0.02); border-radius: 8px; border: 0.5px solid rgba(0,0,0,0.04);">
                  <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                    <span style="font-size: 14px;">
                      {{ req.type === 'trip' ? '🚗' : req.type === 'achievement' ? '🏆' : req.type === 'music' ? '🎵' : '🖼️' }}
                    </span>
                    <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                      <span style="font-size: 11px; font-weight: 700; color: #334155; text-transform: capitalize;">
                        {{ req.type === 'trip' ? 'Corrida' : req.type === 'achievement' ? 'Medalha' : req.type === 'music' ? 'Música' : 'Plano de Fundo' }}
                      </span>
                      <span style="font-size: 9px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        {{ getRequestLabel(req) }}
                      </span>
                    </div>
                  </div>
                  
                  <span :style="getStatusStyle(req.status)" style="padding: 2px 6px; border-radius: 6px; font-size: 8px; font-weight: 700; text-transform: uppercase;">
                    {{ req.status === 'pending' ? 'Pendente' : req.status === 'approved' ? 'Aprovado' : 'Rejeitado' }}
                  </span>
                </div>
              </div>
            </div>
            
            <div v-else class="settings-row" style="justify-content: center; padding: 16px; color: #94a3b8; font-size: 12px; font-style: italic;">
              Nenhuma sugestão enviada ainda.
            </div>
          </div>
        </div>

        <!-- Localizações Personalizadas -->
        <div>
          <p class="profile-section-title" style="padding-left:4px">📍 Localizações Personalizadas</p>
          <div class="flex flex-col gap-2">
            <!-- Form to add new location -->
            <div class="settings-row" style="flex-direction: column; align-items: stretch; padding: 16px; gap: 12px;">
              <p style="font-size: 11px; font-weight: 700; color: #475569; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">Adicionar Localização</p>
              
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 10px; font-weight: 600; color: #475569;">Nome (ex: Casa, Trabalho):</label>
                <input v-model="newLocForm.name" type="text" placeholder="Nome identificador" style="padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); font-size: 12px; outline: none; background: white;" />
              </div>
              
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 10px; font-weight: 600; color: #475569;">Tipo de Entrada:</label>
                <select v-model="newLocForm.inputType" style="padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); font-size: 12px; outline: none; cursor: pointer; background: white;">
                  <option value="address">Endereço (Texto)</option>
                  <option value="coords">Coordenadas (Lat / Lon)</option>
                </select>
              </div>
              
              <!-- Address Input -->
              <div v-if="newLocForm.inputType === 'address'" style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 10px; font-weight: 600; color: #475569;">Endereço Completo:</label>
                <input v-model="newLocForm.address" type="text" placeholder="Ex: Av. Paulista, 1000, São Paulo" style="padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); font-size: 12px; outline: none; background: white;" />
              </div>
              
              <!-- Coordinates Input -->
              <div v-else style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <label style="font-size: 10px; font-weight: 600; color: #475569;">Latitude:</label>
                  <input v-model="newLocForm.latitude" type="number" step="any" placeholder="-23.5616" style="padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); font-size: 12px; outline: none; background: white;" />
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <label style="font-size: 10px; font-weight: 600; color: #475569;">Longitude:</label>
                  <input v-model="newLocForm.longitude" type="number" step="any" placeholder="-46.6561" style="padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); font-size: 12px; outline: none; background: white;" />
                </div>
              </div>
              
              <button @click="submitAddLocation" class="btn-xp green-btn" style="padding: 8px 14px; font-size: 11px; align-self: flex-end; margin-top: 4px;">
                Salvar Localização 💾
              </button>
            </div>
            
            <!-- List of saved locations -->
            <div class="settings-row" style="flex-direction: column; align-items: stretch; padding: 12px 16px; gap: 8px;">
              <p style="font-size: 11px; font-weight: 700; color: #475569; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">Minhas Localizações</p>
              
              <div v-if="customLocations && customLocations.length > 0" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; width: 100%;" class="no-scroll">
                <div v-for="loc in customLocations" :key="loc.id" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(0,0,0,0.02); border-radius: 10px; border: 0.5px solid rgba(0,0,0,0.04); width: 100%; box-sizing: border-box;">
                  <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; text-align: left;">
                    <span style="font-size: 12px; font-weight: 700; color: #1e293b;">📍 {{ loc.name }}</span>
                    <span style="font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;" :title="loc.address">
                      {{ loc.address || 'Sem endereço' }}
                    </span>
                    <span v-if="loc.latitude != null && loc.longitude != null" style="font-size: 9px; color: #94a3b8;">
                      Coords: {{ loc.latitude.toFixed(4) }}, {{ loc.longitude.toFixed(4) }}
                    </span>
                  </div>
                  <button @click="emit('delete-custom-location', loc.id)" style="background: none; border: none; color: #ef4444; font-size: 14px; cursor: pointer; padding: 4px; font-weight: bold; flex-shrink: 0;" title="Excluir">
                    🗑️
                  </button>
                </div>
              </div>
              <div v-else style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 8px 0; text-align: center; width: 100%;">
                Nenhuma localização personalizada salva.
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
                @click="emit('toggle-setting', 'publicProfile')"
              >
                <div class="toggle-knob"></div>
              </div>
            </div>
            
            <div class="settings-row cursor-pointer hover:bg-red-50" @click="emit('logout')">
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

  <!-- Modal de Envio de Sugestão / Solicitação (Central de Sugestões) -->
  <div v-if="showRequestModal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(8px); padding: 16px; box-sizing: border-box;">
    <div class="glass" style="width: 100%; max-width: 440px; max-height: 90vh; background: rgba(255, 255, 255, 0.98); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 24px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15); padding: 24px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; font-family: 'Space Grotesk', sans-serif;">
      
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-shrink: 0;">
        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">💡 Enviar Nova Sugestão</h3>
        <button @click="showRequestModal = false" style="background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; padding: 4px;">✕</button>
      </div>

      <!-- Form Body (Scrollable) -->
      <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-right: 4px; box-sizing: border-box;" class="no-scroll">
        
        <!-- Type Selector -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">O que você deseja sugerir?</label>
          <select v-model="requestForm.type" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); background: white; font-size: 13px; outline: none; cursor: pointer;">
            <option value="trip">🚗 Corrida / Viagem</option>
            <option value="achievement">🏆 Medalha / Conquista</option>
            <option value="music">🎵 Música para a Playlist</option>
            <option value="background">🖼️ Imagem de Plano de Fundo</option>
          </select>
        </div>

        <!-- Dynamic Fields for 'trip' -->
        <template v-if="requestForm.type === 'trip'">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Nome da Corrida</label>
            <input v-model="requestForm.tripName" type="text" placeholder="Ex: Rota da Faculdade" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Distância (km)</label>
              <input v-model="requestForm.distanceKm" type="number" step="0.1" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Duração (min)</label>
              <input v-model="requestForm.durationMin" type="number" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Passageiros</label>
              <input v-model="requestForm.passengerCount" type="number" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Velocidade Méd (km/h)</label>
              <input v-model="requestForm.avgSpeed" type="number" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Local de Partida</label>
            <input v-model="requestForm.startLocation" type="text" placeholder="Ex: Av. Brasil, 1000" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Local de Destino</label>
            <input v-model="requestForm.endLocation" type="text" placeholder="Ex: Rua das Flores, 250" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>
        </template>

        <!-- Dynamic Fields for 'achievement' -->
        <template v-if="requestForm.type === 'achievement'">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Título da Conquista</label>
            <input v-model="requestForm.achTitle" type="text" placeholder="Ex: Velocista da Madrugada" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Descrição</label>
            <textarea v-model="requestForm.achDescription" rows="2" placeholder="Descreva como o usuário pode ganhar essa conquista..." style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; font-family: inherit; box-sizing: border-box; resize: none;"></textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Emoji</label>
              <input v-model="requestForm.achEmoji" type="text" placeholder="🏆" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Cor do Brilho</label>
              <select v-model="requestForm.achGlowColor" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); background: white; font-size: 13px; outline: none; cursor: pointer;">
                <option value="">Sem brilho (Padrão)</option>
                <option value="cyan">🩵 Ciano</option>
                <option value="gold">💛 Dourado / Amarelo</option>
                <option value="rose">🩷 Rosa</option>
                <option value="green">💚 Verde</option>
                <option value="purple">💜 Roxo</option>
              </select>
            </div>
          </div>
        </template>

        <!-- Dynamic Fields for 'music' -->
        <template v-if="requestForm.type === 'music'">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Título / Artista da Música</label>
            <input v-model="requestForm.musicTitle" type="text" placeholder="Ex: Synthwave Rider - Kavinsky" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">URL do Áudio (MP3)</label>
            <input v-model="requestForm.audioUrl" type="text" placeholder="https://exemplo.com/musica.mp3" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">URL da Capa (Opcional)</label>
            <input v-model="requestForm.coverUrl" type="text" placeholder="https://exemplo.com/capa.jpg" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>
        </template>

        <!-- Dynamic Fields for 'background' -->
        <template v-if="requestForm.type === 'background'">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Nome do Plano de Fundo</label>
            <input v-model="requestForm.bgTitle" type="text" placeholder="Ex: Cyberpunk Grid" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">URL da Imagem</label>
            <input v-model="requestForm.bgUrl" type="text" placeholder="https://exemplo.com/wallpaper.jpg" style="width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 13px; outline: none; box-sizing: border-box;" />
          </div>
        </template>
      </div>

      <!-- Footer Buttons -->
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.06); flex-shrink: 0;">
        <button @click="showRequestModal = false" style="padding: 10px 18px; border-radius: 12px; border: 1.5px solid rgba(0,0,0,0.08); background: white; font-size: 12px; font-weight: 700; cursor: pointer; color: #475569; font-family: inherit;">Cancelar</button>
        <button @click="submitLocalRequest" style="padding: 10px 18px; border-radius: 12px; border: none; background: #3b82f6; color: white; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.3); font-family: inherit;">Enviar Sugestão</button>
      </div>
    </div>
  </div>
</template>
