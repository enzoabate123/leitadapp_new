<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  users: {
    type: Array,
    required: true
  },
  expandedUsers: {
    type: Object, // Set
    required: true
  },
  searchQuery: {
    type: String,
    required: true
  }
});

const emit = defineEmits([
  'update:searchQuery',
  'open-user-modal',
  'delete-user',
  'toggle-user-expand',
  'open-address-modal',
  'delete-address',
  'open-comment-modal',
  'delete-comment'
]);
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header-xp">
      <div>
        <h3>Tabela de Contas de Usuários</h3>
        <p>Visualização e edição do banco de dados relacional de usuários.</p>
      </div>
      <button @click="emit('open-user-modal', 'create')" class="btn-xp green-btn">➕ Adicionar Novo Usuário</button>
    </div>

    <!-- Search -->
    <div class="search-bar-xp">
      <label>Pesquisar Registros:</label>
      <input 
        :value="searchQuery" 
        @input="emit('update:searchQuery', $event.target.value)" 
        type="text" 
        placeholder="Filtre por nome ou e-mail de usuário..." 
      />
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
            <tr v-if="!searchQuery || user.username.toLowerCase().includes(searchQuery.toLowerCase()) || (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()))">
              <td class="toggle-expand-xp" @click="emit('toggle-user-expand', user.id)">
                {{ expandedUsers.has(user.id) ? '▼' : '▶' }}
              </td>
              <td><strong>#{{ user.id }}</strong></td>
              <td><span class="xp-table-tag">👤 {{ user.username }}</span></td>
              <td>{{ user.email || '—' }}</td>
              <td><span :class="['role-badge-xp', user.role]">{{ user.role }}</span></td>
              <td>🚗 {{ user.tripsCount }}</td>
              <td>
                <div class="action-buttons-xp">
                  <button @click="emit('open-user-modal', 'update', user)" class="btn-xp-mini" title="Alterar">✏️ Editar</button>
                  <button @click="emit('delete-user', user.id)" class="btn-xp-mini red-text" title="Deletar">🗑️ Excluir</button>
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
                        <button @click="emit('open-address-modal', user.id)" class="btn-xp-micro">Adicionar</button>
                      </div>
                      <ul class="details-list-xp" v-if="user.addresses && user.addresses.length > 0">
                        <li v-for="addr in user.addresses" :key="addr.id">
                          <span>📍 <strong>{{ addr.street }}</strong>, {{ addr.city }}-{{ addr.state }} ({{ addr.postalCode }})</span>
                          <button @click="emit('delete-address', addr.id)" class="btn-trash-xp">❌</button>
                        </li>
                      </ul>
                      <p v-else class="empty-list-xp">Nenhum endereço registrado.</p>
                    </div>

                    <!-- Profile Comments CMS -->
                    <div class="details-section-xp">
                      <div class="section-title-row-xp">
                        <h4>💬 Comentários na Conta</h4>
                        <button @click="emit('open-comment-modal', user.id)" class="btn-xp-micro">Escrever</button>
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
                          <button @click="emit('delete-comment', comm.id)" class="btn-trash-xp">❌</button>
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
</template>
