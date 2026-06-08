<script setup>
const props = defineProps({
  requests: {
    type: Array,
    required: true
  }
});

const emit = defineEmits([
  'process-request'
]);

function formatDetails(req) {
  try {
    const details = typeof req.details === 'string' ? JSON.parse(req.details) : req.details;
    if (req.type === 'trip') {
      return {
        label: 'Corrida',
        html: `<strong>Nome:</strong> ${details.name || 'Sem nome'}<br/>
               <strong>Origem:</strong> ${details.startLocation || 'Não informada'}<br/>
               <strong>Destino:</strong> ${details.endLocation || 'Não informado'}<br/>
               <strong>Distância:</strong> ${details.distanceKm} km | <strong>Duração:</strong> ${details.durationMin} min<br/>
               <strong>Passageiros:</strong> ${details.passengerCount || 1}`
      };
    } else if (req.type === 'achievement') {
      return {
        label: 'Conquista',
        html: `<strong>Título:</strong> ${details.title}<br/>
               <strong>Descrição:</strong> ${details.description}<br/>
               <strong>Emoji:</strong> <span style="font-size:18px">${details.emoji}</span><br/>
               <strong>Chave/Glow:</strong> <code>${details.key || 'N/A'}</code> / ${details.glowColor || 'N/A'}`
      };
    } else if (req.type === 'music') {
      return {
        label: 'Música',
        html: `<strong>Título:</strong> ${details.title}<br/>
               <strong>URL do Áudio:</strong> <a href="${details.audioUrl}" target="_blank" style="color:#003399;word-break:break-all;">${details.audioUrl}</a><br/>
               <strong>URL da Capa:</strong> ${details.coverUrl ? `<a href="${details.coverUrl}" target="_blank" style="color:#003399;word-break:break-all;">${details.coverUrl}</a>` : 'Sem capa'}`
      };
    } else if (req.type === 'background') {
      return {
        label: 'Plano de Fundo',
        html: `<strong>Título:</strong> ${details.title}<br/>
               <strong>URL da Imagem:</strong> <a href="${details.url}" target="_blank" style="color:#003399;word-break:break-all;">${details.url}</a><br/>
               <strong>Chave:</strong> <code>${details.key || 'N/A'}</code>`
      };
    }
    return { label: req.type, html: JSON.stringify(details) };
  } catch (e) {
    return { label: req.type, html: String(req.details) };
  }
}

function getStatusBadgeClass(status) {
  if (status === 'approved') return 'badge-xp green-badge';
  if (status === 'rejected') return 'badge-xp red-badge';
  return 'badge-xp yellow-badge';
}

function getStatusLabel(status) {
  if (status === 'approved') return 'Aprovado ✅';
  if (status === 'rejected') return 'Rejeitado ❌';
  return 'Pendente ⏳';
}
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header-xp">
      <div>
        <h3>Solicitações dos Usuários</h3>
        <p>Gerencie sugestões de corridas, conquistas, músicas ou imagens de fundo enviadas pelos motoristas.</p>
      </div>
    </div>

    <!-- Requests Table -->
    <div class="xp-table-container">
      <table class="xp-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Usuário</th>
            <th>Tipo</th>
            <th>Detalhes</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="req in requests" :key="req.id">
            <td style="white-space: nowrap;">
              {{ new Date(req.createdAt).toLocaleString('pt-BR') }}
            </td>
            <td>
              <strong>{{ req.user?.username || 'Desconhecido' }}</strong><br/>
              <span style="font-size: 11px; color: #666;">{{ req.user?.email || '' }}</span>
            </td>
            <td>
              <span class="type-tag" :class="req.type">
                {{ formatDetails(req).label }}
              </span>
            </td>
            <td style="max-width: 400px; line-height: 1.4; font-size: 12px; padding: 8px;" v-html="formatDetails(req).html">
            </td>
            <td>
              <span :class="getStatusBadgeClass(req.status)">
                {{ getStatusLabel(req.status) }}
              </span>
            </td>
            <td>
              <div v-if="req.status === 'pending'" style="display: flex; gap: 6px;">
                <button @click="emit('process-request', req.id, 'approve')" class="btn-xp green-btn" style="padding: 4px 8px; font-size:11px;">
                  Aprovar 👍
                </button>
                <button @click="emit('process-request', req.id, 'reject')" class="btn-xp red-btn" style="padding: 4px 8px; font-size:11px;">
                  Rejeitar 👎
                </button>
              </div>
              <span v-else style="color: #666; font-size: 11px; font-style: italic;">
                Sem ações pendentes
              </span>
            </td>
          </tr>
          <tr v-if="requests.length === 0">
            <td colspan="6" class="empty-list-xp" style="text-align: center; padding: 20px;">
              Nenhuma solicitação encontrada no banco de dados.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.badge-xp {
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  border-radius: 4px;
  border: 1px solid transparent;
}
.green-badge {
  background-color: #d1fae5;
  color: #065f46;
  border-color: #a7f3d0;
}
.red-badge {
  background-color: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}
.yellow-badge {
  background-color: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}

.type-tag {
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  border-radius: 4px;
  font-weight: bold;
  text-transform: uppercase;
}
.type-tag.trip {
  background-color: #dbeafe;
  color: #1e40af;
}
.type-tag.achievement {
  background-color: #f3e8ff;
  color: #6b21a8;
}
.type-tag.music {
  background-color: #fae8ff;
  color: #86198f;
}
.type-tag.background {
  background-color: #e0f2fe;
  color: #075985;
}
</style>
