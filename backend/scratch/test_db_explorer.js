// scratch/test_db_explorer.js
async function run() {
  console.log('🧪 Iniciando testes de endpoints do Database Explorer...');
  const API_URL = 'http://localhost:3003';

  // 1. Fazer login como admin (Enzy)
  let res = await fetch(`${API_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Enzy', password: 'admin123' })
  });
  if (!res.ok) {
    console.error('❌ Falha ao logar como admin:', await res.text());
    process.exit(1);
  }
  const { token } = await res.json();
  console.log('✅ Logado como admin.');

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Testar GET /api/admin/db/tables/User
  res = await fetch(`${API_URL}/api/admin/db/tables/User`, { headers: authHeaders });
  if (!res.ok) {
    console.error('❌ Falha ao carregar registros da tabela User:', await res.text());
    process.exit(1);
  }
  const users = await res.json();
  console.log(`✅ Tabela User carregada. Registros encontrados: ${users.length}`);
  if (users.length === 0) {
    console.error('❌ Tabela User vazia (deveria ter pelo menos o admin logado)!');
    process.exit(1);
  }

  // 3. Testar GET /api/admin/db/tables/InvalidTable (deve falhar com 400)
  res = await fetch(`${API_URL}/api/admin/db/tables/InvalidTable`, { headers: authHeaders });
  if (res.status === 400) {
    console.log('✅ Tentativa de carregar tabela inválida retornou 400 conforme esperado.');
  } else {
    console.error('❌ Retorno inesperado ao carregar tabela inválida:', res.status);
    process.exit(1);
  }

  // 4. Testar criação e exclusão no DB Explorer (via MusicTrack de teste)
  // Criar música primeiro
  const testTrack = {
    title: 'Explorer Test Track',
    audioUrl: '/uploads/fake-audio.mp3'
  };
  res = await fetch(`${API_URL}/api/admin/music`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(testTrack)
  });
  if (!res.ok) {
    console.error('❌ Falha ao criar faixa de música de teste:', await res.text());
    process.exit(1);
  }
  const track = await res.json();
  const trackId = track.id;
  console.log(`✅ Música de teste criada com ID ${trackId}.`);

  // Deletar via rota genérica DELETE /api/admin/db/tables/MusicTrack/:id
  res = await fetch(`${API_URL}/api/admin/db/tables/MusicTrack/${trackId}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  if (!res.ok) {
    console.error('❌ Falha ao deletar via DB Explorer:', await res.text());
    process.exit(1);
  }
  console.log('✅ Registro deletado com sucesso via DB Explorer.');

  // Verificar se sumiu mesmo
  res = await fetch(`${API_URL}/api/admin/db/tables/MusicTrack`, { headers: authHeaders });
  const tracks = await res.json();
  if (tracks.some(t => t.id === trackId)) {
    console.error('❌ Registro deletado ainda aparece na listagem!');
    process.exit(1);
  }
  console.log('✅ Remoção do registro confirmada no DB.');

  // 5. Testar exportação (GET /api/admin/db/export)
  res = await fetch(`${API_URL}/api/admin/db/export`, { headers: authHeaders });
  if (!res.ok) {
    console.error('❌ Falha ao exportar banco de dados:', await res.text());
    process.exit(1);
  }
  const disposition = res.headers.get('content-disposition');
  const contentType = res.headers.get('content-type');
  console.log('✅ Resposta do export:', res.status, 'ContentType:', contentType, 'Disposition:', disposition);
  if (!disposition || !disposition.includes('attachment') || !disposition.includes('dev.db')) {
    console.error('❌ Cabeçalhos de exportação incorretos!');
    process.exit(1);
  }
  
  const blob = await res.blob();
  console.log(`✅ Banco de dados SQLite recebido. Tamanho: ${blob.size} bytes.`);

  console.log('🏁 Todos os testes do Database Explorer passaram com absoluto sucesso!');
}

run().catch(console.error);
