// scratch/test_user_trips.js
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

// Replicate hashPassword function
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function run() {
  console.log('🧪 Iniciando testes de integração para o endpoint /api/users/:id/trips...');
  const API_URL = 'http://localhost:3003';
  const prisma = new PrismaClient();

  const testUsername = 'test_trips_user_unique';
  const testPassword = 'testpass123_secure';
  const driverUsername = 'test_driver_user_unique';

  try {
    // 1. Limpar dados antigos de teste, se houver
    await prisma.tripMedia.deleteMany({ where: { content: { in: [testUsername, driverUsername] } } });
    await prisma.waypoint.deleteMany({
      where: {
        trip: {
          user: {
            username: { in: [testUsername, driverUsername] }
          }
        }
      }
    });
    await prisma.trip.deleteMany({
      where: {
        user: {
          username: { in: [testUsername, driverUsername] }
        }
      }
    });
    await prisma.settings.deleteMany({
      where: {
        user: {
          username: { in: [testUsername, driverUsername] }
        }
      }
    });
    await prisma.score.deleteMany({
      where: {
        user: {
          username: { in: [testUsername, driverUsername] }
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        username: { in: [testUsername, driverUsername] }
      }
    });

    // 2. Criar usuários de teste
    const hashedPassword = hashPassword(testPassword);
    const testUser = await prisma.user.create({
      data: {
        username: testUsername,
        password: hashedPassword,
        role: 'driver',
        email: 'testtrips@example.com'
      }
    });

    const driverUser = await prisma.user.create({
      data: {
        username: driverUsername,
        password: hashedPassword,
        role: 'driver',
        email: 'testdriver@example.com'
      }
    });

    console.log(`✅ Usuários de teste criados: ${testUsername} (ID: ${testUser.id}), ${driverUsername} (ID: ${driverUser.id})`);

    // 3. Criar uma viagem dirigida pelo testUser
    const trip1 = await prisma.trip.create({
      data: {
        userId: testUser.id,
        distanceKm: 12.5,
        durationMin: 20,
        name: 'Corrida Dirigida pelo Teste',
        startLocation: 'Origem A',
        endLocation: 'Destino A',
        passengerCount: 1,
        pointsGenerated: 125,
        waypoints: {
          create: [
            { address: 'Parada A1', order: 1 },
            { address: 'Parada A2', order: 2 }
          ]
        }
      }
    });

    // 4. Criar uma viagem onde o testUser é passageiro
    const trip2 = await prisma.trip.create({
      data: {
        userId: driverUser.id,
        distanceKm: 25.0,
        durationMin: 40,
        name: 'Corrida com Teste de Passageiro',
        startLocation: 'Origem B',
        endLocation: 'Destino B',
        passengerCount: 2,
        pointsGenerated: 250,
        waypoints: {
          create: [
            { address: 'Parada B1', order: 1 }
          ]
        },
        media: {
          create: [
            { type: 'passenger', content: testUsername }
          ]
        }
      }
    });

    console.log(`✅ Corridas de teste criadas: ID ${trip1.id} (dirigida) e ID ${trip2.id} (como passageiro)`);

    // 5. Fazer login via API
    let res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword })
    });
    if (!res.ok) {
      throw new Error(`Falha ao logar via API: ${await res.text()}`);
    }
    const { token } = await res.json();
    console.log('✅ Logado com sucesso via API, token recebido.');

    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 6. Testar o endpoint GET /api/users/:id/trips
    console.log(`\n--- Requisitando histórico de viagens do usuário ID ${testUser.id} ---`);
    res = await fetch(`${API_URL}/api/users/${testUser.id}/trips`, { headers: authHeaders });
    if (!res.ok) {
      throw new Error(`Falha no GET /api/users/${testUser.id}/trips: ${await res.text()}`);
    }
    const trips = await res.json();
    console.log(`✅ Resposta recebida. Total de viagens retornadas: ${trips.length}`);

    // Validar ordenação (id desc)
    if (trips.length !== 2) {
      throw new Error(`Esperava exatamente 2 viagens, mas retornou ${trips.length}`);
    }

    const firstReturned = trips[0];
    const secondReturned = trips[1];

    console.log('\n🔍 Validando primeira viagem (deve ser a de maior ID):', firstReturned);
    if (firstReturned.id !== Math.max(trip1.id, trip2.id)) {
      throw new Error('A ordenação decrescente por ID falhou!');
    }
    
    // Verificar campos
    const verifyTripFields = (t) => {
      if (!t.name || !t.createdAt || !t.driver || !t.startLocation || !t.endLocation || !Array.isArray(t.waypoints) || !Array.isArray(t.passengers)) {
        throw new Error('Viagem retornada está faltando campos obrigatórios!');
      }
    };
    
    verifyTripFields(firstReturned);
    verifyTripFields(secondReturned);
    console.log('✅ Todos os campos obrigatórios estão presentes em ambos os registros.');

    // Verificar se trip de passageiro contem o passageiro
    const passengerTripObj = trips.find(t => t.id === trip2.id);
    if (!passengerTripObj.passengers.includes(testUsername)) {
      throw new Error('Histórico não incluiu o nome do passageiro na viagem correspondente!');
    }
    console.log('✅ Nome do passageiro incluído corretamente.');

    // 7. Limpar banco de dados
    console.log('\n--- Limpando dados de teste do banco ---');
    await prisma.tripMedia.deleteMany({ where: { content: { in: [testUsername, driverUsername] } } });
    await prisma.waypoint.deleteMany({
      where: {
        trip: {
          user: {
            username: { in: [testUsername, driverUsername] }
          }
        }
      }
    });
    await prisma.trip.deleteMany({
      where: {
        user: {
          username: { in: [testUsername, driverUsername] }
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        username: { in: [testUsername, driverUsername] }
      }
    });
    console.log('✅ Banco de dados limpo com sucesso.');

    console.log('\n🏁 TODOS OS TESTES PASSARAM COM SUCESSO ABSOLUTO!');

  } catch (error) {
    console.error('❌ Ocorreu um erro durante a execução do teste:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
