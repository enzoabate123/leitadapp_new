<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  API_URL: {
    type: String,
    required: true
  },
  musicForm: {
    type: Object,
    required: true
  },
  musicUploadProgress: {
    type: Object,
    required: true
  },
  musicTracks: {
    type: Array,
    required: true
  }
});

const emit = defineEmits([
  'handle-audio-upload',
  'handle-cover-upload',
  'create-music-track',
  'activate-music-track',
  'delete-music-track'
]);
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header-xp">
      <div>
        <h3>Gerenciador de Músicas de Fundo</h3>
        <p>Adicione novas faixas e escolha qual música tocará para todos os usuários.</p>
      </div>
    </div>

    <!-- Form Card -->
    <div class="xp-card">
      <header class="xp-card-header-gray">🎵 Adicionar Nova Faixa de Música</header>
      <div class="xp-card-body">
        <form @submit.prevent="emit('create-music-track')" class="xp-grid-form" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) 150px; gap: 15px;">
          <div class="input-group">
            <label>Título da Música:</label>
            <input type="text" v-model="musicForm.title" placeholder="Ex: Bliss Sunset" required style="width: 100%;" />
          </div>
          
          <div class="input-group">
            <label>Arquivo de Áudio (MP3):</label>
            <input type="file" id="music-audio-input" accept="audio/mp3,audio/*" @change="emit('handle-audio-upload', $event)" required style="width: 100%;" />
            <span v-if="musicUploadProgress.isUploadingAudio" style="font-size: 10px; color: #0284c7; display: block; margin-top: 2px;">⏳ Enviando...</span>
            <span v-else-if="musicForm.audioUrl" style="font-size: 10px; color: #16a34a; display: block; margin-top: 2px;">✅ Áudio pronto!</span>
          </div>

          <div class="input-group">
            <label>Capa do Álbum (Imagem):</label>
            <input type="file" id="music-cover-input" accept="image/*" @change="emit('handle-cover-upload', $event)" style="width: 100%;" />
            <span v-if="musicUploadProgress.isUploadingCover" style="font-size: 10px; color: #0284c7; display: block; margin-top: 2px;">⏳ Enviando...</span>
            <span v-else-if="musicForm.coverUrl" style="font-size: 10px; color: #16a34a; display: block; margin-top: 2px;">✅ Capa pronta!</span>
          </div>

          <div style="display: flex; align-items: flex-end;">
            <button type="submit" class="btn-xp green-btn" :disabled="musicUploadProgress.isUploadingAudio || musicUploadProgress.isUploadingCover" style="height: 30px; width: 100%;">
              ➕ Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Music Tracks Table -->
    <h4 style="margin: 20px 0 10px 0; color:#003399;">Faixas Cadastradas</h4>
    <div class="xp-table-container">
      <table class="xp-table">
        <thead>
          <tr>
            <th>Capa</th>
            <th>Título</th>
            <th>Caminho do Arquivo</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="track in musicTracks" :key="track.id">
            <td style="width: 60px; padding: 4px; text-align: center;">
              <div 
                v-if="track.coverUrl" 
                :style="{ backgroundImage: `url(${API_URL}${track.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }"
                style="width: 40px; height: 40px; border: 1px solid #777; border-radius: 4px; margin: 0 auto;"
              ></div>
              <div v-else style="width: 40px; height: 40px; border: 1px solid #aaa; border-radius: 4px; display: flex; align-items: center; justify-content: center; background: #e2e8f0; font-size: 16px; margin: 0 auto;">
                🎵
              </div>
            </td>
            <td><strong>{{ track.title }}</strong></td>
            <td><code>{{ track.audioUrl }}</code></td>
            <td>
              <span v-if="track.isActive" style="color: #16a34a; font-weight: bold;">🟢 Ativa (Tocando)</span>
              <span v-else style="color: #64748b; font-style: italic;">🔴 Inativa</span>
            </td>
            <td>
              <div style="display: flex; gap: 8px;">
                <button 
                  v-if="!track.isActive" 
                  @click="emit('activate-music-track', track.id)" 
                  class="btn-xp blue-btn" 
                  style="padding: 4px 8px; font-size:11px;"
                >
                  Ativar ▶️
                </button>
                <button 
                  @click="emit('delete-music-track', track.id)" 
                  class="btn-xp red-btn" 
                  style="padding: 4px 8px; font-size:11px;"
                >
                  Excluir 🗑️
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="musicTracks.length === 0">
            <td colspan="5" class="empty-list-xp" style="text-align: center; padding: 20px;">Nenhuma faixa de música cadastrada no banco de dados.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
