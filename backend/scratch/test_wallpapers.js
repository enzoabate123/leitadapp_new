// scratch/test_wallpapers.js
async function run() {
  console.log('🧪 Iniciando testes de endpoints de wallpaper/background...');
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

  // 2. Criar novo background (POST /api/admin/backgrounds)
  const newBgData = {
    key: 'test_wallpaper_key',
    title: 'Test Wallpaper Title',
    url: 'http://localhost:3003/uploads/fake-wallpaper.jpg'
  };

  res = await fetch(`${API_URL}/api/admin/backgrounds`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(newBgData)
  });
  if (!res.ok) {
    console.error('❌ Falha ao criar imagem de fundo:', await res.text());
    process.exit(1);
  }
  const createdBg = await res.json();
  console.log('✅ Imagem de fundo criada com sucesso:', createdBg);

  const bgId = createdBg.id;

  // 3. Atualizar o background criado (PUT /api/admin/backgrounds/:id)
  const updatedBgData = {
    key: 'test_wallpaper_key_mod',
    title: 'Modified Wallpaper Title',
    url: 'http://localhost:3003/uploads/fake-wallpaper-modified.jpg'
  };

  res = await fetch(`${API_URL}/api/admin/backgrounds/${bgId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify(updatedBgData)
  });
  if (!res.ok) {
    console.error('❌ Falha ao atualizar imagem de fundo:', await res.text());
    process.exit(1);
  }
  const updatedBg = await res.json();
  console.log('✅ Imagem de fundo atualizada com sucesso:', updatedBg);

  if (updatedBg.key !== updatedBgData.key || updatedBg.title !== updatedBgData.title || updatedBg.url !== updatedBgData.url) {
    console.error('❌ Valores atualizados não correspondem!');
    process.exit(1);
  }

  // 4. Verificar se aparece no endpoint público (GET /api/backgrounds)
  res = await fetch(`${API_URL}/api/backgrounds`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    console.error('❌ Falha ao obter lista pública de fundos:', await res.text());
    process.exit(1);
  }
  const bgs = await res.json();
  const found = bgs.find(b => b.id === bgId);
  if (!found || found.title !== updatedBgData.title) {
    console.error('❌ O fundo atualizado não foi encontrado na lista pública ou está incorreto!');
    process.exit(1);
  }
  console.log('✅ Fundo atualizado retornado na listagem com sucesso.');

  // 5. Deletar o background (DELETE /api/admin/backgrounds/:id)
  res = await fetch(`${API_URL}/api/admin/backgrounds/${bgId}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  if (!res.ok) {
    console.error('❌ Falha ao deletar imagem de fundo:', await res.text());
    process.exit(1);
  }
  console.log('✅ Imagem de fundo deletada com sucesso.');

  // 6. Verificar se foi removida mesmo
  res = await fetch(`${API_URL}/api/backgrounds`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const finalBgs = await res.json();
  if (finalBgs.some(b => b.id === bgId)) {
    console.error('❌ O fundo ainda está presente após exclusão!');
    process.exit(1);
  }
  console.log('✅ Remoção confirmada na listagem pública.');

  console.log('🏁 Todos os testes passaram com absoluto sucesso!');
}

run().catch(console.error);
