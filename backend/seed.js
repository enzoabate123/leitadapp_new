import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const achievements = [
  { key: 'leitado-silencioso', title: 'Leitado silencioso', description: 'Sem conversinhas', emoji: '💨' },
  { key: 'bus-hunting', title: 'Bus Hunting', description: 'Atropelou ou foi atropelado?', emoji: '🚌' },
  { key: 'longest-ride', title: 'Longest Ride', description: 'A maior viagem de todas', emoji: '🗺️' },
  { key: 'most-blitz', title: 'Most Blitz', description: 'Parado em toda esquina', emoji: '🛡️' },
  { key: 'racha', title: 'Racha', description: 'Velocidade e adrenalina', emoji: '⚡' },
  { key: 'quase-furto', title: 'Quase Furto', description: 'Susto no trânsito', emoji: '🔒' },
  { key: 'first-crash', title: 'First Crash', description: 'A primeira batida', emoji: '🔥' },
  { key: 'first-cine', title: 'First Cine', description: 'Cineminha no carro?', emoji: '🎬' },
  { key: 'waze-incident', title: 'Waze Incident', description: 'Virou na rua errada', emoji: '🗺️' },
  { key: 'marina-incident', title: 'Marina Incident', description: 'Só a Marina entende', emoji: '⚠️' },
  { key: 'bloqueado', title: 'Bloqueado', description: 'Mistério...', emoji: '❗' },
  { key: 'trilha-verde', title: 'Trilha Verde', description: 'Eco-condução em morros', emoji: '⛰️', glowColor: 'emerald' },
  { key: 'eco-conducao', title: 'Eco Condução', description: 'Baixo consumo de CO2', emoji: '🍃', glowColor: 'emerald' },
  { key: 'novato', title: 'Novato', description: 'Primeiro quilômetro rodado', emoji: '🚗', glowColor: 'cyan' },
  { key: 'secreto', title: 'Secreto', description: 'Continue rodando...', emoji: '❓' },
];

async function main() {
  console.log('🌱 Iniciando seed...');

  // Limpa dados existentes em ordem de dependência
  await prisma.userAchievement.deleteMany();
  await prisma.score.deleteMany();
  await prisma.waypoint.deleteMany();
  await prisma.tripMedia.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.address.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.user.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.backgroundOption.deleteMany();

  // Cria achievements
  for (const ach of achievements) {
    await prisma.achievement.create({ data: ach });
  }
  console.log(`✅ ${achievements.length} achievements criados`);

  // Cria imagens de fundo padrão
  const defaultBackgrounds = [
    { key: 'bliss', title: 'Windows XP Bliss (Colinas Verdes)', url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80' },
    { key: 'aqua', title: 'Frutiger Aero Aqua (Gotas de Água)', url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1920&q=80' },
    { key: 'space', title: 'Deep Space (Espaço Sideral)', url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=1920&q=80' },
    { key: 'sunset', title: 'Sunset Beach (Pôr do Sol)', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80' },
    { key: 'stripes', title: 'LeitadApp Stripes (Listras Clássicas)', url: 'stripes' },
  ];

  for (const bg of defaultBackgrounds) {
    await prisma.backgroundOption.create({ data: bg });
  }
  console.log(`✅ ${defaultBackgrounds.length} imagens de fundo criadas`);

  // Cria usuário de teste
  const hashedPassword = hashPassword('astrea123');
  const user = await prisma.user.create({
    data: {
      username: 'Astrea',
      email: 'astrea@email.com',
      password: hashedPassword,
      role: 'driver',
      tripsCount: 6,
    },
  });
  console.log(`✅ Usuário criado: ${user.username} (id: ${user.id})`);

  // Cria usuário admin padrão
  const adminPassword = hashPassword('admin123');
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@email.com',
      password: adminPassword,
      role: 'admin',
      tripsCount: 0,
    },
  });
  console.log(`✅ Usuário Administrador criado: ${adminUser.username} (id: ${adminUser.id})`);

  // Settings padrão
  await prisma.settings.create({
    data: {
      userId: user.id,
      pushNotifications: true,
      xpAlerts: true,
      socialRanking: false,
      publicProfile: true,
      bgType: 'bliss',
      customBgUrl: '',
    },
  });
  await prisma.settings.create({
    data: {
      userId: adminUser.id,
      pushNotifications: true,
      xpAlerts: false,
      socialRanking: false,
      publicProfile: false,
      bgType: 'bliss',
      customBgUrl: '',
    },
  });
  console.log('✅ Settings padrão criadas');

  // Adicionar Endereços para Astrea
  await prisma.address.createMany({
    data: [
      { userId: user.id, street: 'Rua das Flores, 123', city: 'São Paulo', state: 'SP', postalCode: '01001-000' },
      { userId: user.id, street: 'Av. Paulista, 1000', city: 'São Paulo', state: 'SP', postalCode: '01310-100' },
    ]
  });
  console.log('✅ Endereços criados para Astrea');

  // Adicionar Comentários no perfil de Astrea
  await prisma.comment.createMany({
    data: [
      { profileUserId: user.id, authorName: 'admin', content: 'Ótima motorista, sempre no horário!' },
      { profileUserId: user.id, authorName: 'passageiro123', content: 'Carro limpo e boa música.' },
    ]
  });
  console.log('✅ Comentários criados no perfil de Astrea');

  // Score inicial
  await prisma.score.create({
    data: {
      points: 2500,
      userId: user.id,
    },
  });
  await prisma.score.create({
    data: {
      points: 1200,
      userId: user.id,
    },
  });
  console.log('✅ Scores iniciais criados (total: 3700 pts)');

  // Viagens iniciais com Waypoints e Medias
  const trip1 = await prisma.trip.create({
    data: {
      userId: user.id,
      distanceKm: 15.2,
      durationMin: 25,
      avgSpeed: 45.0,
      xpEarned: 152,
      name: 'Corrida Matinal',
      startLocation: 'Rua das Flores, 123',
      endLocation: 'Av. Paulista, 1000',
      passengerCount: 2,
      pointsGenerated: 152,
    }
  });

  await prisma.waypoint.createMany({
    data: [
      { tripId: trip1.id, address: 'Metrô Ana Rosa', order: 1 },
      { tripId: trip1.id, address: 'Parque da Aclimação', order: 2 },
    ]
  });

  await prisma.tripMedia.createMany({
    data: [
      { tripId: trip1.id, type: 'text', content: 'Iniciando trajeto diário' },
      { tripId: trip1.id, type: 'image', content: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=400&q=80' },
    ]
  });

  console.log('✅ Viagens iniciais com Paradas e Mídias criadas');

  // Desbloqueia achievements 1,2,5,12,13,14 (ids baseados na ordem de inserção)
  const allAchievements = await prisma.achievement.findMany({ orderBy: { id: 'asc' } });
  const unlockIndices = [0, 1, 4, 11, 12, 13]; // 0-indexed: achievements 1,2,5,12,13,14
  for (const idx of unlockIndices) {
    await prisma.userAchievement.create({
      data: {
        userId: user.id,
        achievementId: allAchievements[idx].id,
      },
    });
  }
  console.log('✅ 6 achievements desbloqueados para Astrea');

  console.log('🌱 Seed concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
