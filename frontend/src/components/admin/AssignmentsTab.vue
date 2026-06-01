<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  users: {
    type: Array,
    required: true
  },
  achievements: {
    type: Array,
    required: true
  },
  assignmentForm: {
    type: Object,
    required: true
  },
  filteredUserAchievements: {
    type: Array,
    required: true
  }
});

const emit = defineEmits([
  'assign-achievement',
  'revoke-achievement'
]);
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header-xp">
      <div>
        <h3>Painel de Atribuição Manual</h3>
        <p>Entregue ou revogue medalhas para perfis de usuários em tempo real.</p>
      </div>
    </div>

    <!-- Form Card -->
    <div class="xp-card">
      <header class="xp-card-header-gray">👑 Atribuir Conquista a Usuário</header>
      <div class="xp-card-body">
        <form @submit.prevent="emit('assign-achievement')" class="xp-grid-form">
          <div class="input-group">
            <label>Selecionar Usuário:</label>
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
    <h4 style="margin: 20px 0 10px 0; color:#003399;">
      {{ assignmentForm.userId ? 'Marcos Desbloqueados de ' + (users.find(u => u.id === parseInt(assignmentForm.userId, 10))?.username || 'Usuário') + ':' : 'Marcos Desbloqueados Ativamente:' }}
    </h4>
    <div class="xp-table-container">
      <table class="xp-table">
        <thead>
          <tr>
            <th>Nome do Usuário</th>
            <th>Conquista Atribuída</th>
            <th>Data de Concessão</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ua in filteredUserAchievements" :key="ua.userId + '-' + ua.achievementId">
            <td><strong>{{ ua.username }}</strong></td>
            <td><span class="ach-badge-xp-pill">{{ ua.emoji }} {{ ua.title }}</span></td>
            <td>{{ new Date(ua.unlockedAt).toLocaleString() }}</td>
            <td>
              <button @click="emit('revoke-achievement', ua.userId, ua.achievementId)" class="btn-xp red-btn" style="padding: 4px 8px; font-size:11px;">Revogar Conquista 🗑️</button>
            </td>
          </tr>
          <tr v-if="filteredUserAchievements.length === 0">
            <td colspan="4" class="empty-list-xp" style="text-align: center; padding: 20px;">{{ assignmentForm.userId ? 'Este usuário não possui conquistas desbloqueadas.' : 'Nenhuma conquista ativa no banco de dados.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
