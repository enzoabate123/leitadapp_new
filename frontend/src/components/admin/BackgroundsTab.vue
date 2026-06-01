<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  backgrounds: {
    type: Array,
    required: true
  }
});

const emit = defineEmits([
  'open-background-modal',
  'delete-background'
]);
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header-xp">
      <div>
        <h3>Tabela de Imagens de Fundo Padrão</h3>
        <p>Adicione ou remova opções de plano de fundo exibidas na tela dos usuários.</p>
      </div>
      <button @click="emit('open-background-modal', 'create')" class="btn-xp green-btn">➕ Adicionar Novo Fundo</button>
    </div>

    <!-- Backgrounds Table -->
    <div class="xp-table-container">
      <table class="xp-table">
        <thead>
          <tr>
            <th>Preview</th>
            <th>Chave (ID)</th>
            <th>Título</th>
            <th>URL da Imagem</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bg in backgrounds" :key="bg.id">
            <td style="width: 100px; padding: 4px;">
              <div 
                v-if="bg.key !== 'stripes'" 
                :style="{ backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }"
                style="width: 80px; height: 50px; border: 1px solid #777; border-radius: 4px;"
              ></div>
              <div 
                v-else 
                style="width: 80px; height: 50px; border: 1px solid #777; border-radius: 4px; background: repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 5px, #e2e8f0 5px, #e2e8f0 10px);"
              ></div>
            </td>
            <td><code>{{ bg.key }}</code></td>
            <td><strong>{{ bg.title }}</strong></td>
            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <a :href="bg.url" target="_blank" style="color: #003399;">{{ bg.url }}</a>
            </td>
            <td>
              <button @click="emit('delete-background', bg.id)" class="btn-xp red-btn" style="padding: 4px 8px; font-size:11px;">Excluir 🗑️</button>
            </td>
          </tr>
          <tr v-if="backgrounds.length === 0">
            <td colspan="5" class="empty-list-xp" style="text-align: center; padding: 20px;">Nenhuma imagem de fundo padrão no banco de dados.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
