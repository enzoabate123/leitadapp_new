<script setup>

const props = defineProps({
  trips: {
    type: Array,
    required: true
  },
  expandedTrips: {
    type: Object, // Set
    required: true
  },
  searchQuery: {
    type: String,
    required: true
  },
  achievements: {
    type: Array,
    required: true
  }
});

const emit = defineEmits([
  'update:searchQuery',
  'open-trip-modal',
  'delete-trip',
  'toggle-trip-expand',
  'open-waypoint-modal',
  'delete-waypoint',
  'open-media-modal',
  'delete-media'
]);

function getTripAchievements(trip) {
  if (!trip.media) return [];
  const achMedias = trip.media.filter(m => m.type === 'achievement');
  return achMedias.map(m => {
    const id = parseInt(m.content, 10);
    return props.achievements.find(a => a.id === id);
  }).filter(Boolean);
}
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header-xp">
      <div>
        <h3>Tabela de Viagens Registradas</h3>
        <p>Operações de CRUD de corridas, waypoints e mídias.</p>
      </div>
      <button @click="emit('open-trip-modal', 'create')" class="btn-xp green-btn">➕ Nova Viagem</button>
    </div>

    <div class="search-bar-xp">
      <label>Pesquisar Corridas:</label>
      <input 
        :value="searchQuery" 
        @input="emit('update:searchQuery', $event.target.value)" 
        type="text" 
        placeholder="Filtre por ID da viagem, usuário ou ponto de partida..." 
      />
    </div>

    <div class="xp-table-container">
      <table class="xp-table">
        <thead>
          <tr>
            <th></th>
            <th>ID</th>
            <th>Usuário</th>
            <th>Nome Opcional</th>
            <th>Distância</th>
            <th>Duração</th>
            <th>Pessoas</th>
            <th>Partida / Destino</th>
            <th>Pontos</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="trip in trips" :key="trip.id">
            <tr v-if="!searchQuery || trip.id.toString() === searchQuery || trip.user.username.toLowerCase().includes(searchQuery.toLowerCase()) || (trip.name && trip.name.toLowerCase().includes(searchQuery.toLowerCase())) || (trip.startLocation && trip.startLocation.toLowerCase().includes(searchQuery.toLowerCase()))">
              <td class="toggle-expand-xp" @click="emit('toggle-trip-expand', trip.id)">
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
              <td><strong>+{{ trip.pointsGenerated }} Pontos</strong></td>
              <td>
                <div class="action-buttons-xp">
                  <button @click="emit('open-trip-modal', 'update', trip)" class="btn-xp-mini" title="Editar">✏️</button>
                  <button @click="emit('delete-trip', trip.id)" class="btn-xp-mini red-text" title="Excluir">🗑️</button>
                </div>
              </td>
            </tr>
            <tr v-if="expandedTrips.has(trip.id)" class="expanded-row-xp">
              <td colspan="10">
                <div class="expanded-details-xp">
                  <div class="grid-details-xp" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
                    <!-- Waypoints -->
                    <div class="details-section-xp">
                      <div class="section-title-row-xp">
                        <h4>🚩 Paradas (Waypoints)</h4>
                        <button @click="emit('open-waypoint-modal', trip.id)" class="btn-xp-micro">Adicionar</button>
                      </div>
                      <ul class="details-list-xp" v-if="trip.waypoints && trip.waypoints.length > 0">
                        <li v-for="wp in [...trip.waypoints].sort((a,b) => a.order - b.order)" :key="wp.id">
                          <span>🚩 <strong>Ordem {{ wp.order }}</strong>: {{ wp.address }}</span>
                          <button @click="emit('delete-waypoint', wp.id)" class="btn-trash-xp">❌</button>
                        </li>
                      </ul>
                      <p v-else class="empty-list-xp">Nenhuma parada registrada.</p>
                    </div>

                    <!-- Media CMS -->
                    <div class="details-section-xp">
                      <div class="section-title-row-xp">
                        <h4>📸 Mídias da Viagem</h4>
                        <button @click="emit('open-media-modal', trip.id)" class="btn-xp-micro">Adicionar</button>
                      </div>
                      <div class="media-grid-xp" v-if="trip.media && trip.media.filter(m => m.type !== 'passenger' && m.type !== 'achievement').length > 0">
                        <div v-for="med in trip.media.filter(m => m.type !== 'passenger' && m.type !== 'achievement')" :key="med.id" class="media-card-xp">
                          <div class="media-type-badge">{{ med.type }}</div>
                          <div class="media-content-preview">
                            <img v-if="med.type === 'image'" :src="med.content" class="media-thumb-xp" />
                            <p v-else class="media-text-preview">"{{ med.content }}"</p>
                          </div>
                          <button @click="emit('delete-media', med.id)" class="btn-trash-xp-abs">🗑️</button>
                        </div>
                      </div>
                      <p v-else class="empty-list-xp">Nenhuma mídia registrada.</p>
                    </div>

                    <!-- Achievements CMS -->
                    <div class="details-section-xp">
                      <div class="section-title-row-xp">
                        <h4>🏆 Conquistas da Viagem</h4>
                      </div>
                      <div style="display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0;" v-if="getTripAchievements(trip).length > 0">
                        <span v-for="ach in getTripAchievements(trip)" :key="ach.id" class="xp-table-tag" style="background: #ffcc00; border-color: #ff9900; color: #000; font-size: 11px; font-weight: bold; border-radius: 4px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px;">
                          {{ ach.emoji }} {{ ach.title }}
                        </span>
                      </div>
                      <p v-else class="empty-list-xp">Nenhuma conquista associada.</p>
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
