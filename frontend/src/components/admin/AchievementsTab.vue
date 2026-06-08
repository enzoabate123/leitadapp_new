<script setup>

const props = defineProps({
  achievements: {
    type: Array,
    required: true
  },
  searchQuery: {
    type: String,
    required: true
  }
});

const emit = defineEmits([
  'update:searchQuery',
  'open-achievement-modal',
  'delete-achievement'
]);
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header-xp">
      <div>
        <h3>Classes de Conquistas</h3>
        <p>Configure conquistas globais para usuários que cumprem marcos de trânsito.</p>
      </div>
      <button @click="emit('open-achievement-modal', 'create')" class="btn-xp green-btn">➕ Nova Conquista</button>
    </div>

    <div class="search-bar-xp">
      <label>Buscar Conquista:</label>
      <input 
        :value="searchQuery" 
        @input="emit('update:searchQuery', $event.target.value)" 
        type="text" 
        placeholder="Filtre por título, chave ou descrição..." 
      />
    </div>

    <div class="ach-grid-xp">
      <div 
        v-for="ach in achievements" 
        :key="ach.id"
        v-show="!searchQuery || ach.title.toLowerCase().includes(searchQuery.toLowerCase()) || ach.key.toLowerCase().includes(searchQuery.toLowerCase())"
        class="ach-card-xp"
      >
        <header class="ach-card-header-xp">
          <span class="emoji-block">{{ ach.emoji }}</span>
          <div class="card-controls">
            <button @click="emit('open-achievement-modal', 'update', ach)" class="btn-xp-micro">Editar</button>
            <button @click="emit('delete-achievement', ach.id)" class="btn-xp-micro red-text">Deletar</button>
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
</template>
