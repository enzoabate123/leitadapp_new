// scratch/test_custom_locations.js
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function run() {
  console.log('🧪 Iniciando testes de integração para localizações personalizadas...');
  const API_URL = 'http://localhost:3003';
  const prisma = new PrismaClient();

  const testUsername = 'test_loc_user_unique';
  const testPassword = 'testpass123_secure';

  try {
    // 1. Limpar dados antigos de teste, se houver
    await prisma.customLocation.deleteMany({
      where: {
        user: {
          username: testUsername
        }
      }
    });
    await prisma.settings.deleteMany({
      where: {
        user: {
          username: testUsername
        }
      }
    });
    await prisma.score.deleteMany({
      where: {
        user: {
          username: testUsername
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        username: testUsername
      }
    });

    // 2. Criar usuário de teste
    const hashedPassword = hashPassword(testPassword);
    const testUser = await prisma.user.create({
      data: {
        username: testUsername,
        password: hashedPassword,
        role: 'driver',
        email: 'testlocs@example.com'
      }
    });

    console.log(`✅ Usuário de teste criado: ${testUsername} (ID: ${testUser.id})`);

    // 3. Fazer login via API
    let res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword })
    });
    if (!res.ok) {
      throw new Error(`Falha ao logar via API: ${await res.text()}`);
    }
    const { token } = await res.json();
    console.log('✅ Logado com sucesso via API.');

    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 4. Testar criação por endereço (com geocodificação automática no backend)
    console.log('\n--- Testando criação por Endereço (com geocodificação) ---');
    res = await fetch(`${API_URL}/api/custom-locations`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Av Paulista',
        address: 'Avenida Paulista 1000, Sao Paulo'
      })
    });
    if (!res.ok) {
      throw new Error(`Falha ao criar localização por endereço: ${await res.text()}`);
    }
    const locAddress = await res.json();
    console.log('✅ Localização criada por endereço:', locAddress);
    if (locAddress.latitude == null || locAddress.longitude == null) {
      throw new Error('Falha: O backend deveria ter geocodificado as coordenadas!');
    }
    console.log('✅ Coordenadas resolvidas com sucesso pelo backend:', locAddress.latitude, locAddress.longitude);

    // 5. Testar criação por Coordenadas
    console.log('\n--- Testando criação por Coordenadas ---');
    res = await fetch(`${API_URL}/api/custom-locations`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Sítio',
        latitude: -22.9068,
        longitude: -43.1729
      })
    });
    if (!res.ok) {
      throw new Error(`Falha ao criar localização por coordenadas: ${await res.text()}`);
    }
    const locCoords = await res.json();
    console.log('✅ Localização criada por coordenadas:', locCoords);
    if (!locCoords.address || !locCoords.address.includes('Coordenadas:')) {
      throw new Error('Falha: O backend deveria ter gerado um endereço default!');
    }
    console.log('✅ Endereço default gerado:', locCoords.address);

    // 6. Testar listagem
    console.log('\n--- Testando GET /api/custom-locations ---');
    res = await fetch(`${API_URL}/api/custom-locations`, { headers: authHeaders });
    if (!res.ok) {
      throw new Error(`Falha na listagem: ${await res.text()}`);
    }
    const locsList = await res.json();
    console.log(`✅ Listagem retornou ${locsList.length} localizações.`);
    if (locsList.length !== 2) {
      throw new Error(`Esperava 2 localizações, mas obteve ${locsList.length}`);
    }

    // 7. Testar exclusão
    console.log(`\n--- Testando DELETE /api/custom-locations/${locAddress.id} ---`);
    res = await fetch(`${API_URL}/api/custom-locations/${locAddress.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    if (!res.ok) {
      throw new Error(`Falha ao excluir localização: ${await res.text()}`);
    }
    const deleteRes = await res.json();
    console.log('✅ Exclusão retornou:', deleteRes);

    // Confirmar que restou apenas 1 na listagem
    res = await fetch(`${API_URL}/api/custom-locations`, { headers: authHeaders });
    const finalLocsList = await res.json();
    if (finalLocsList.length !== 1) {
      throw new Error(`Esperava 1 localização, mas obteve ${finalLocsList.length}`);
    }
    console.log('✅ Exclusão e recarga confirmadas com sucesso.');

    // 8. Limpar banco
    console.log('\n🧹 Limpando dados de teste do banco...');
    await prisma.customLocation.deleteMany({
      where: {
        user: {
          username: testUsername
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        username: testUsername
      }
    });
    console.log('✅ Banco de dados limpo.');

    console.log('\n🏁 TODOS OS TESTES PASSARAM COM SUCESSO ABSOLUTO!');

  } catch (error) {
    console.error('❌ Ocorreu um erro durante a execução do teste:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
