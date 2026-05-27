import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

// ─── Setup ───────────────────────────────────────────────
const fastify = Fastify({ logger: false });
const prisma = new PrismaClient();

await fastify.register(cors, { origin: '*' });

// ─── Auth helpers ────────────────────────────────────────
const sessions = new Map(); // token -> userId

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === attempt;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Auth middleware (decorator) ─────────────────────────
fastify.decorateRequest('userId', null);

async function authenticate(request, reply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Token não fornecido' });
  }
  const token = header.slice(7);
  const userId = sessions.get(token);
  if (!userId) {
    return reply.status(401).send({ error: 'Token inválido ou expirado' });
  }
  request.userId = userId;
}

async function authenticateAdmin(request, reply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  const user = await prisma.user.findUnique({ where: { id: request.userId } });
  if (!user || user.role !== 'admin') {
    return reply.status(403).send({ error: 'Acesso negado: Administradores apenas' });
  }
}

// ─── Socket.io ───────────────────────────────────────────
const io = new Server(fastify.server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Map userId -> Set<socketId> for targeted emits
const userSockets = new Map();

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token;
  const userId = token ? sessions.get(token) : null;

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  // Track user sockets
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socket.id);

  socket.on('ping-dashboard', (data) => {
    socket.emit('pong-dashboard', {
      message: 'Conexão WebSocket ativa!',
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) userSockets.delete(userId);
    }
  });
});

function emitToUser(userId, event, data) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const sid of sockets) {
    io.to(sid).emit(event, data);
  }
}

// ─── Routes ──────────────────────────────────────────────

// POST /api/register
fastify.post('/api/register', async (request, reply) => {
  const { username, password, email } = request.body || {};
  if (!username || !password) {
    return reply.status(400).send({ error: 'username e password são obrigatórios' });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return reply.status(409).send({ error: 'Usuário já existe' });
  }

  const hashed = hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      email: email || null,
      role: 'driver',
      settings: {
        create: {
          pushNotifications: true,
          xpAlerts: true,
          socialRanking: false,
          publicProfile: true,
        },
      },
    },
    select: { id: true, username: true, email: true, role: true, createdAt: true },
  });

  const token = generateToken();
  sessions.set(token, user.id);

  return { token, user };
});

// POST /api/login
fastify.post('/api/login', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) {
    return reply.status(400).send({ error: 'username e password são obrigatórios' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.password)) {
    return reply.status(401).send({ error: 'Credenciais inválidas' });
  }

  const token = generateToken();
  sessions.set(token, user.id);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  };
});

// GET /api/me
fastify.get('/api/me', { preHandler: authenticate }, async (request) => {
  const userId = request.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      avatarUrl: true,
      bio: true,
      bannerUrl: true,
      customTags: true,
      highlightedAchievements: true,
      settings: {
        select: {
          pushNotifications: true,
          xpAlerts: true,
          socialRanking: true,
          publicProfile: true,
        },
      },
    },
  });

  if (!user) return { error: 'Usuário não encontrado' };

  const totalPoints = (await prisma.score.aggregate({
    where: { userId },
    _sum: { points: true },
  }))._sum.points || 0;

  const achievementCount = await prisma.userAchievement.count({ where: { userId } });

  const level = Math.floor(totalPoints / 1000) + 1;

  return {
    ...user,
    totalPoints,
    level,
    achievementCount,
  };
});

// PUT /api/profile
fastify.put('/api/profile', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;
  const { bio, avatarUrl, bannerUrl, customTags, email, highlightedAchievements } = request.body || {};

  const updateData = {};
  if (bio !== undefined) updateData.bio = bio;
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
  if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
  if (customTags !== undefined) updateData.customTags = typeof customTags === 'string' ? customTags : JSON.stringify(customTags);
  if (highlightedAchievements !== undefined) updateData.highlightedAchievements = typeof highlightedAchievements === 'string' ? highlightedAchievements : JSON.stringify(highlightedAchievements);
  if (email !== undefined) updateData.email = email;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    return {
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        bio: updatedUser.bio,
        avatarUrl: updatedUser.avatarUrl,
        bannerUrl: updatedUser.bannerUrl,
        customTags: updatedUser.customTags,
        highlightedAchievements: updatedUser.highlightedAchievements,
      }
    };
  } catch (error) {
    reply.status(400);
    return { error: error.message || 'Erro ao atualizar perfil' };
  }
});

// POST /api/settings
fastify.post('/api/settings', { preHandler: authenticate }, async (request) => {
  const userId = request.userId;
  const { pushNotifications, xpAlerts, socialRanking, publicProfile } = request.body || {};

  const data = {};
  if (pushNotifications !== undefined) data.pushNotifications = pushNotifications;
  if (xpAlerts !== undefined) data.xpAlerts = xpAlerts;
  if (socialRanking !== undefined) data.socialRanking = socialRanking;
  if (publicProfile !== undefined) data.publicProfile = publicProfile;

  const settings = await prisma.settings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return settings;
});

// GET /api/ranking
fastify.get('/api/ranking', { preHandler: authenticate }, async () => {
  const ranking = await prisma.score.groupBy({
    by: ['userId'],
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 10,
  });

  const userIds = ranking.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.username]));

  return ranking.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    username: userMap.get(r.userId) || 'Desconhecido',
    totalPoints: r._sum.points || 0,
  }));
});

// POST /api/trips
fastify.post('/api/trips', { preHandler: authenticate }, async (request) => {
  const userId = request.userId;
  const { distanceKm, durationMin, avgSpeed } = request.body || {};

  if (distanceKm == null || durationMin == null) {
    return { error: 'distanceKm e durationMin são obrigatórios' };
  }

  const xpEarned = Math.round(distanceKm * 10);

  // Create trip
  const trip = await prisma.trip.create({
    data: {
      userId,
      distanceKm: parseFloat(distanceKm),
      durationMin: parseInt(durationMin, 10),
      avgSpeed: avgSpeed != null ? parseFloat(avgSpeed) : null,
      xpEarned,
    },
  });

  // Upsert score (add points)
  const existingScore = await prisma.score.findFirst({ where: { userId } });
  if (existingScore) {
    await prisma.score.update({
      where: { id: existingScore.id },
      data: { points: existingScore.points + xpEarned },
    });
  } else {
    await prisma.score.create({ data: { userId, points: xpEarned } });
  }

  // Check achievement unlocks
  const newAchievements = [];

  // Total km
  const totalKm = (await prisma.trip.aggregate({
    where: { userId },
    _sum: { distanceKm: true },
  }))._sum.distanceKm || 0;

  // Total trips
  const totalTrips = await prisma.trip.count({ where: { userId } });

  // Already unlocked keys
  const unlocked = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: true },
  });
  const unlockedKeys = new Set(unlocked.map((ua) => ua.achievement.key));

  // Achievement rules
  const rules = [
    { key: 'novato', condition: totalKm >= 1 },
    { key: 'longest-ride', condition: totalTrips >= 5 },
    { key: 'eco-conducao', condition: totalKm >= 50 && (avgSpeed == null || avgSpeed <= 60) },
    { key: 'trilha-verde', condition: totalKm >= 100 },
    { key: 'racha', condition: avgSpeed != null && avgSpeed >= 120 },
    { key: 'leitado-silencioso', condition: durationMin >= 60 && totalTrips >= 3 },
    { key: 'bus-hunting', condition: totalTrips >= 10 },
  ];

  for (const rule of rules) {
    if (rule.condition && !unlockedKeys.has(rule.key)) {
      const achievement = await prisma.achievement.findUnique({ where: { key: rule.key } });
      if (achievement) {
        await prisma.userAchievement.create({
          data: { userId, achievementId: achievement.id },
        });
        const ach = { key: achievement.key, title: achievement.title, emoji: achievement.emoji };
        newAchievements.push(ach);
        emitToUser(userId, 'achievement-unlocked', ach);
      }
    }
  }

  return { trip, xpEarned, newAchievements };
});

// GET /api/achievements
fastify.get('/api/achievements', { preHandler: authenticate }, async (request) => {
  const userId = request.userId;

  const all = await prisma.achievement.findMany({ orderBy: { id: 'asc' } });
  const unlocked = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true },
  });
  const unlockedIds = new Set(unlocked.map((ua) => ua.achievementId));

  return all.map((a) => ({
    id: a.id,
    key: a.key,
    title: a.title,
    description: a.description,
    emoji: a.emoji,
    glowColor: a.glowColor,
    unlocked: unlockedIds.has(a.id),
  }));
});

// ─── Admin Routes ────────────────────────────────────────

// GET /api/admin/users
fastify.get('/api/admin/users', { preHandler: authenticateAdmin }, async () => {
  return prisma.user.findMany({
    include: {
      addresses: true,
      profileComments: true,
      scores: true,
      achievements: {
        include: {
          achievement: true
        }
      }
    },
    orderBy: { id: 'asc' }
  });
});

// POST /api/admin/users
fastify.post('/api/admin/users', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { username, password, email, role, tripsCount } = request.body || {};
  if (!username || !password) {
    return reply.status(400).send({ error: 'username e password são obrigatórios' });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return reply.status(409).send({ error: 'Usuário já existe' });
  }

  const hashed = hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      email: email || null,
      role: role || 'driver',
      tripsCount: tripsCount != null ? parseInt(tripsCount, 10) : 0,
      settings: {
        create: {
          pushNotifications: true,
          xpAlerts: true,
          socialRanking: false,
          publicProfile: true,
        },
      },
    },
    include: {
      addresses: true,
      profileComments: true,
    }
  });

  return user;
});

// PUT /api/admin/users/:id
fastify.put('/api/admin/users/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { username, email, role, tripsCount, password } = request.body || {};

  const updateData = {};
  if (username !== undefined) updateData.username = username;
  if (email !== undefined) updateData.email = email || null;
  if (role !== undefined) updateData.role = role;
  if (tripsCount !== undefined) updateData.tripsCount = parseInt(tripsCount, 10);
  if (password) {
    updateData.password = hashPassword(password);
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        addresses: true,
        profileComments: true,
      }
    });
    return user;
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao atualizar usuário: ' + err.message });
  }
});

// DELETE /api/admin/users/:id
fastify.delete('/api/admin/users/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  try {
    await prisma.user.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao deletar usuário: ' + err.message });
  }
});

// POST /api/admin/users/:id/addresses
fastify.post('/api/admin/users/:id/addresses', { preHandler: authenticateAdmin }, async (request, reply) => {
  const userId = parseInt(request.params.id, 10);
  const { street, city, state, postalCode } = request.body || {};
  if (!street || !city || !state || !postalCode) {
    return reply.status(400).send({ error: 'Todos os campos de endereço são obrigatórios' });
  }

  const address = await prisma.address.create({
    data: { userId, street, city, state, postalCode }
  });
  return address;
});

// DELETE /api/admin/addresses/:id
fastify.delete('/api/admin/addresses/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  await prisma.address.delete({ where: { id } });
  return { success: true };
});

// POST /api/admin/users/:id/comments
fastify.post('/api/admin/users/:id/comments', { preHandler: authenticateAdmin }, async (request, reply) => {
  const profileUserId = parseInt(request.params.id, 10);
  const { authorName, content } = request.body || {};
  if (!authorName || !content) {
    return reply.status(400).send({ error: 'Nome do autor e conteúdo são obrigatórios' });
  }

  const comment = await prisma.comment.create({
    data: { profileUserId, authorName, content }
  });
  return comment;
});

// DELETE /api/admin/comments/:id
fastify.delete('/api/admin/comments/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  await prisma.comment.delete({ where: { id } });
  return { success: true };
});

// GET /api/admin/trips
fastify.get('/api/admin/trips', { preHandler: authenticateAdmin }, async () => {
  return prisma.trip.findMany({
    include: {
      user: true,
      waypoints: true,
      media: true
    },
    orderBy: { id: 'desc' }
  });
});

// POST /api/admin/trips
fastify.post('/api/admin/trips', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { userId, distanceKm, durationMin, avgSpeed, name, startLocation, endLocation, passengerCount, pointsGenerated } = request.body || {};
  if (!userId || distanceKm == null || durationMin == null) {
    return reply.status(400).send({ error: 'userId, distanceKm e durationMin são obrigatórios' });
  }

  const xpEarned = Math.round(parseFloat(distanceKm) * 10);

  const trip = await prisma.trip.create({
    data: {
      userId: parseInt(userId, 10),
      distanceKm: parseFloat(distanceKm),
      durationMin: parseInt(durationMin, 10),
      avgSpeed: avgSpeed != null ? parseFloat(avgSpeed) : null,
      xpEarned,
      name: name || null,
      startLocation: startLocation || null,
      endLocation: endLocation || null,
      passengerCount: passengerCount != null ? parseInt(passengerCount, 10) : 1,
      pointsGenerated: pointsGenerated != null ? parseInt(pointsGenerated, 10) : xpEarned,
    },
    include: {
      waypoints: true,
      media: true
    }
  });

  return trip;
});

// PUT /api/admin/trips/:id
fastify.put('/api/admin/trips/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { distanceKm, durationMin, avgSpeed, name, startLocation, endLocation, passengerCount, pointsGenerated } = request.body || {};

  const updateData = {};
  if (distanceKm !== undefined) updateData.distanceKm = parseFloat(distanceKm);
  if (durationMin !== undefined) updateData.durationMin = parseInt(durationMin, 10);
  if (avgSpeed !== undefined) updateData.avgSpeed = avgSpeed != null ? parseFloat(avgSpeed) : null;
  if (name !== undefined) updateData.name = name || null;
  if (startLocation !== undefined) updateData.startLocation = startLocation || null;
  if (endLocation !== undefined) updateData.endLocation = endLocation || null;
  if (passengerCount !== undefined) updateData.passengerCount = parseInt(passengerCount, 10);
  if (pointsGenerated !== undefined) updateData.pointsGenerated = parseInt(pointsGenerated, 10);

  try {
    const trip = await prisma.trip.update({
      where: { id },
      data: updateData,
      include: {
        waypoints: true,
        media: true
      }
    });
    return trip;
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao atualizar corrida: ' + err.message });
  }
});

// DELETE /api/admin/trips/:id
fastify.delete('/api/admin/trips/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  try {
    await prisma.trip.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao deletar corrida: ' + err.message });
  }
});

// POST /api/admin/trips/:id/waypoints
fastify.post('/api/admin/trips/:id/waypoints', { preHandler: authenticateAdmin }, async (request, reply) => {
  const tripId = parseInt(request.params.id, 10);
  const { address, order } = request.body || {};
  if (!address || order == null) {
    return reply.status(400).send({ error: 'Endereço e ordem são obrigatórios' });
  }

  const waypoint = await prisma.waypoint.create({
    data: { tripId, address, order: parseInt(order, 10) }
  });
  return waypoint;
});

// DELETE /api/admin/waypoints/:id
fastify.delete('/api/admin/waypoints/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  await prisma.waypoint.delete({ where: { id } });
  return { success: true };
});

// POST /api/admin/trips/:id/medias
fastify.post('/api/admin/trips/:id/medias', { preHandler: authenticateAdmin }, async (request, reply) => {
  const tripId = parseInt(request.params.id, 10);
  const { type, content } = request.body || {};
  if (!type || !content) {
    return reply.status(400).send({ error: 'Tipo e conteúdo são obrigatórios' });
  }

  const media = await prisma.tripMedia.create({
    data: { tripId, type, content }
  });
  return media;
});

// DELETE /api/admin/medias/:id
fastify.delete('/api/admin/medias/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  await prisma.tripMedia.delete({ where: { id } });
  return { success: true };
});

// GET /api/admin/achievements
fastify.get('/api/admin/achievements', { preHandler: authenticateAdmin }, async () => {
  return prisma.achievement.findMany({
    orderBy: { id: 'asc' }
  });
});

// POST /api/admin/achievements
fastify.post('/api/admin/achievements', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { key, title, description, emoji, glowColor } = request.body || {};
  if (!key || !title || !description || !emoji) {
    return reply.status(400).send({ error: 'key, title, description e emoji são obrigatórios' });
  }

  const existing = await prisma.achievement.findUnique({ where: { key } });
  if (existing) {
    return reply.status(409).send({ error: 'Conquista com esta chave já existe' });
  }

  const achievement = await prisma.achievement.create({
    data: { key, title, description, emoji, glowColor: glowColor || null }
  });
  return achievement;
});

// PUT /api/admin/achievements/:id
fastify.put('/api/admin/achievements/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { key, title, description, emoji, glowColor } = request.body || {};

  const updateData = {};
  if (key !== undefined) updateData.key = key;
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (emoji !== undefined) updateData.emoji = emoji;
  if (glowColor !== undefined) updateData.glowColor = glowColor || null;

  try {
    const achievement = await prisma.achievement.update({
      where: { id },
      data: updateData
    });
    return achievement;
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao atualizar conquista: ' + err.message });
  }
});

// DELETE /api/admin/achievements/:id
fastify.delete('/api/admin/achievements/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  try {
    await prisma.achievement.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao deletar conquista: ' + err.message });
  }
});

// POST /api/admin/user-achievements
fastify.post('/api/admin/user-achievements', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { userId, achievementId } = request.body || {};
  if (!userId || !achievementId) {
    return reply.status(400).send({ error: 'userId e achievementId são obrigatórios' });
  }

  const uId = parseInt(userId, 10);
  const aId = parseInt(achievementId, 10);

  const existing = await prisma.userAchievement.findUnique({
    where: {
      userId_achievementId: {
        userId: uId,
        achievementId: aId
      }
    }
  });

  if (existing) {
    return reply.status(409).send({ error: 'O usuário já possui esta conquista' });
  }

  const userAchievement = await prisma.userAchievement.create({
    data: { userId: uId, achievementId: aId }
  });

  // Emit event to notify driver UI in real time
  const achievement = await prisma.achievement.findUnique({ where: { id: aId } });
  if (achievement) {
    emitToUser(uId, 'achievement-unlocked', {
      key: achievement.key,
      title: achievement.title,
      emoji: achievement.emoji
    });
  }

  return userAchievement;
});

// DELETE /api/admin/user-achievements/:userId/:achievementId
fastify.delete('/api/admin/user-achievements/:userId/:achievementId', { preHandler: authenticateAdmin }, async (request, reply) => {
  const userId = parseInt(request.params.userId, 10);
  const achievementId = parseInt(request.params.achievementId, 10);

  try {
    await prisma.userAchievement.delete({
      where: {
        userId_achievementId: { userId, achievementId }
      }
    });
    return { success: true };
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao revogar conquista: ' + err.message });
  }
});

// ─── Health check ────────────────────────────────────────
fastify.get('/api/test', async () => {
  const userCount = await prisma.user.count();
  return {
    status: 'ok',
    message: 'Backend rodando!',
    usersCount: userCount,
  };
});

// ─── Shutdown ────────────────────────────────────────────
const shutdown = async () => {
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start ───────────────────────────────────────────────
try {
  await fastify.listen({ port: 3001, host: '0.0.0.0' });
  console.log('🚀 Backend rodando em http://0.0.0.0:3001');
} catch (err) {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
}
