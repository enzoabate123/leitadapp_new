<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  userId: {
    type: [String, Number],
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
  xpAlerts: {
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
  }
});

const emit = defineEmits([
  'toggle-setting',
  'update-volume',
  'change-bg',
  'prompt-edit-email',
  'logout',
  'update:sfxVolume',
  'update:musicVolume',
  'update:appBgType',
  'update:appCustomBgUrl'
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
</script>

<template>
  <div class="settings-tab-container">
    <div class="profile-card no-hover" style="backdrop-filter: blur(10px); padding: 24px;">
      
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
                  <p class="settings-label">Alertas de XP</p>
                  <p class="settings-desc">Quando ganhar pontos</p>
                </div>
              </div>
              <div 
                :class="['toggle', xpAlerts ? 'on' : 'off']" 
                @click="emit('toggle-setting', 'xpAlerts')"
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
                  
                  <div v-if="appBgType === 'custom'" style="width: 100%; display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 11px; font-weight: 600; color: #475569;">URL da Imagem:</label>
                    <input :value="appCustomBgUrl" @input="onCustomBgInput" type="text" placeholder="https://exemplo.com/imagem.jpg" style="width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 13px; outline: none; box-sizing: border-box;" />
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
  </div>
</template>
