<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { API_URL } from '../../utils/api';

const tables = [
  { name: 'User', desc: 'Usuários cadastrados no sistema' },
  { name: 'Score', desc: 'Pontuação de XP e Rankings' },
  { name: 'Settings', desc: 'Configurações de motorista/aplicativo' },
  { name: 'Trip', desc: 'Registros de corridas realizadas' },
  { name: 'Waypoint', desc: 'Paradas intermediárias das corridas' },
  { name: 'Address', desc: 'Lista de endereços e coordenadas' },
  { name: 'Comment', desc: 'Comentários nos perfis de usuários' },
  { name: 'TripMedia', desc: 'Mídias e conquistas geradas na viagem' },
  { name: 'Achievement', desc: 'Classes de Conquistas/Medalhas globais' },
  { name: 'UserAchievement', desc: 'Conquistas conquistadas pelos condutores' },
  { name: 'BackgroundOption', desc: 'Papéis de parede padrão do sistema' },
  { name: 'MusicTrack', desc: 'Músicas disponíveis no player local' },
  { name: 'UserRequest', desc: 'Solicitações de sugestão enviadas' }
];

const selectedTable = ref('User');
const records = ref([]);
const loading = ref(false);
const error = ref(null);
const searchQuery = ref('');
const exporting = ref(false);
const deletingRowId = ref(null);

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
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

async function loadCurrentTable() {
  loading.value = true;
  error.value = null;
  records.value = [];
  try {
    const data = await apiFetch(`/api/admin/db/tables/${selectedTable.value}`);
    records.value = data;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function deleteRow(id) {
  if (!confirm(`Deseja realmente excluir o registro #${id} da tabela ${selectedTable.value}? Esta operação pode falhar se houver restrições de integridade referencial.`)) return;

  deletingRowId.value = id;
  try {
    await apiFetch(`/api/admin/db/tables/${selectedTable.value}/${id}`, {
      method: 'DELETE'
    });
    alert('Registro excluído com sucesso!');
    await loadCurrentTable();
  } catch (err) {
    alert(`Erro ao excluir: ${err.message}`);
  } finally {
    deletingRowId.value = null;
  }
}

async function exportDatabase() {
  exporting.value = true;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/admin/db/export`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error('Falha ao exportar banco de dados');
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dev.db';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  } finally {
    exporting.value = false;
  }
}

function selectTable(name) {
  selectedTable.value = name;
  searchQuery.value = '';
}

watch(selectedTable, () => {
  loadCurrentTable();
});

onMounted(() => {
  loadCurrentTable();
});

const headers = computed(() => {
  if (!records.value || records.value.length === 0) return [];
  return Object.keys(records.value[0]);
});

const filteredRecords = computed(() => {
  if (!searchQuery.value) return records.value;
  const q = searchQuery.value.toLowerCase();
  return records.value.filter(row => {
    return Object.values(row).some(val => {
      return String(val).toLowerCase().includes(q);
    });
  });
});

function formatCell(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch (_) {
      return '[Object]';
    }
  }
  return String(val);
}
</script>

<template>
  <div class="tab-pane" style="display: flex; flex-direction: column; height: 100%;">
    <div class="pane-header-xp">
      <div>
        <h3>Gerenciador de Banco de Dados Embutido</h3>
        <p>Explore, visualize e gerencie diretamente os registros de todas as tabelas Prisma (SQLite) do sistema.</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <button @click="exportDatabase" class="btn-xp green-btn" :disabled="exporting">
          {{ exporting ? '⏳ Exportando...' : '📥 Exportar Banco de Dados (.db)' }}
        </button>
      </div>
    </div>

    <div class="db-explorer-layout" style="display: flex; gap: 15px; flex: 1; min-height: 0; margin-top: 10px;">
      <!-- Sidebar de Tabelas -->
      <div class="xp-card" style="width: 250px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0;">
        <header class="xp-card-header-gray">🗄️ Tabelas Relacionais</header>
        <div class="xp-card-body" style="flex: 1; overflow-y: auto; padding: 5px; background: #fff;">
          <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px;">
            <li v-for="tbl in tables" :key="tbl.name">
              <button 
                @click="selectTable(tbl.name)"
                :style="selectedTable === tbl.name ? { background: '#316ac5', color: '#fff', border: '1px solid #1a51a8' } : {}"
                style="width: 100%; text-align: left; padding: 6px 10px; border-radius: 3px; border: 1px solid transparent; background: none; cursor: pointer; font-size: 12px; font-family: Tahoma, Geneva, sans-serif;"
                class="db-table-btn"
              >
                <div style="font-weight: bold;">{{ tbl.name }}</div>
                <div :style="selectedTable === tbl.name ? { color: '#e0ecff' } : { color: '#666' }" style="font-size: 10px; margin-top: 2px;">{{ tbl.desc }}</div>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Área de Dados da Tabela -->
      <div class="xp-card" style="flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0;">
        <header class="xp-card-header-gray" style="display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
          <span>📋 Registros da Tabela: {{ selectedTable }}</span>
          <span v-if="records.length > 0" style="font-size: 11px; font-weight: normal;">Exibindo {{ records.length }} registros</span>
        </header>
        <div class="xp-card-body" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 10px; background: #fff; min-height: 0;">
          <!-- Barra de Status / Filtros -->
          <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-shrink: 0;">
            <div style="flex: 1;">
              <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="Pesquisar nos registros carregados..." 
                style="width: 100%; padding: 5px 8px; font-size: 12px; font-family: Tahoma, sans-serif; border: 1px solid #7f9db9; box-sizing: border-box;"
              />
            </div>
            <button @click="loadCurrentTable" class="btn-xp" style="padding: 4px 10px; font-size: 11px;">
              🔄 Atualizar
            </button>
          </div>

          <!-- Loading / Error States -->
          <div v-if="loading" style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; font-family: Tahoma, sans-serif;">
            <span style="font-size: 16px; margin-right: 8px;">⏳</span> Carregando registros de {{ selectedTable }}...
          </div>
          <div v-else-if="error" style="flex: 1; display: flex; align-items: center; justify-content: center; color: red; font-size: 13px; font-family: Tahoma, sans-serif; text-align: center; padding: 20px;">
            ❌ Erro ao carregar tabela: {{ error }}
          </div>
          <div v-else-if="filteredRecords.length === 0" style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; font-family: Tahoma, sans-serif; color: #777;">
            Nenhum registro encontrado.
          </div>

          <!-- Data Grid -->
          <div v-else class="xp-table-container" style="flex: 1; overflow: auto; border: 1px solid #7f9db9; min-height: 0;">
            <table class="xp-table" style="width: 100%; border-collapse: collapse; font-family: Tahoma, sans-serif; font-size: 11px;">
              <thead style="position: sticky; top: 0; background: #ece9d8; z-index: 10;">
                <tr>
                  <th style="width: 50px; text-align: center; border: 1px solid #d4d0c8; padding: 6px;">Ações</th>
                  <th v-for="header in headers" :key="header" style="text-align: left; border: 1px solid #d4d0c8; padding: 6px; white-space: nowrap;">
                    {{ header }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in filteredRecords" :key="row.id || idx" style="border-bottom: 1px solid #e5e7eb;">
                  <td style="text-align: center; border: 1px solid #d4d0c8; padding: 4px; white-space: nowrap;">
                    <button 
                      @click="deleteRow(row.id)" 
                      class="btn-xp red-btn" 
                      style="padding: 2px 5px; font-size: 9px; min-width: auto; line-height: 1;"
                      title="Excluir Linha"
                      :disabled="deletingRowId === row.id"
                    >
                      {{ deletingRowId === row.id ? '...' : '🗑️' }}
                    </button>
                  </td>
                  <td 
                    v-for="header in headers" 
                    :key="header" 
                    style="border: 1px solid #d4d0c8; padding: 6px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                    :title="formatCell(row[header])"
                  >
                    <code style="font-family: Consolas, monospace; font-size: 11px;">{{ formatCell(row[header]) }}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.db-table-btn:hover {
  background-color: #e2ecf5 !important;
}
</style>
