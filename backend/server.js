import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const settingsFilePath = path.join(__dirname, 'data', 'music_settings.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

let musicSettings = {
  autoplay: false,
  shuffle: false
};

if (fs.existsSync(settingsFilePath)) {
  try {
    musicSettings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
  } catch (err) {
    console.error('Error reading music settings file:', err);
  }
}

function saveMusicSettings() {
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(musicSettings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving music settings file:', err);
  }
}

// ─── Setup ───────────────────────────────────────────────
const fastify = Fastify({ logger: false });
fastify.setErrorHandler((error, request, reply) => {
  console.error(`❌ [Error] ${request.method} ${request.url}:`, error);
  reply.status(error.statusCode || 500).send({ error: error.message });
});
const prisma = new PrismaClient();

async function syncUserScore(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  if (!user) return;

  // Points from trips driven by this user
  const drivenTrips = await prisma.trip.findMany({
    where: { userId }
  });
  const drivenPoints = drivenTrips.reduce((sum, t) => sum + (t.pointsGenerated || 0), 0);

  // Points from trips where they were a passenger
  const passengerMedias = await prisma.tripMedia.findMany({
    where: {
      type: 'passenger',
      content: user.username
    },
    include: {
      trip: true
    }
  });
  const passengerPoints = passengerMedias.reduce((sum, pm) => sum + (pm.trip ? (pm.trip.pointsGenerated || 0) : 0), 0);

  const totalPoints = drivenPoints + passengerPoints;

  await prisma.score.upsert({
    where: { userId },
    update: { points: totalPoints },
    create: { userId, points: totalPoints }
  });
}

async function getUserStats(userId) {
  const scoreObj = await prisma.score.findUnique({ where: { userId } });
  const totalPoints = scoreObj ? scoreObj.points : 0;

  const achievementCount = await prisma.userAchievement.count({ where: { userId } });

  const level = Math.floor(totalPoints / 1000) + 1;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const drivenTrips = await prisma.trip.findMany({ where: { userId } });
  
  // Passenger trips
  let passengerTrips = [];
  if (user) {
    const passengerMedias = await prisma.tripMedia.findMany({
      where: { type: 'passenger', content: user.username },
      include: { trip: true }
    });
    passengerTrips = passengerMedias.map(pm => pm.trip).filter(Boolean);
  }

  // Deduplicate
  const tripMap = new Map();
  for (const t of drivenTrips) {
    tripMap.set(t.id, t);
  }
  for (const t of passengerTrips) {
    tripMap.set(t.id, t);
  }
  const allTrips = Array.from(tripMap.values());

  const totalDistanceKm = allTrips.reduce((acc, t) => acc + t.distanceKm, 0);
  const totalMinutes = allTrips.reduce((acc, t) => acc + t.durationMin, 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const longestTripKm = allTrips.length > 0 ? Math.max(...allTrips.map(t => t.distanceKm)) : 0;
  const totalPassengers = drivenTrips.reduce((acc, t) => acc + t.passengerCount, 0);
  const tripsCount = allTrips.length;

  let longestTrip = null;
  if (allTrips.length > 0) {
    const maxTrip = allTrips.reduce((max, trip) => trip.distanceKm > max.distanceKm ? trip : max, allTrips[0]);
    longestTrip = await prisma.trip.findUnique({
      where: { id: maxTrip.id },
      include: { waypoints: { orderBy: { order: 'asc' } } }
    });
  }

  return {
    totalPoints,
    level,
    achievementCount,
    totalDistanceKm,
    totalHours,
    longestTripKm,
    longestTrip,
    totalPassengers,
    tripsCount
  };
}

function calculatePoints(distanceKm, durationSec) {
  return Math.round(parseFloat(distanceKm) * 1000) + parseInt(durationSec, 10);
}

await fastify.register(cors, { origin: '*' });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for audio files
  }
});
await fastify.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
  decorateReply: false, // prevent conflict with other plugins if any
});

// ─── Auth helpers ────────────────────────────────────────
const sessions = new Map(); // token -> userId

import { hashPassword, verifyPassword } from './utils/crypto.js';

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
const activeTrips = new Map(); // driverId -> tripState

function emitTripEvent(tripState, event, data) {
  if (!tripState) return;
  // Emit to driver
  emitToUser(tripState.driverId, event, data);
  // Emit to passengers
  if (tripState.passengers) {
    for (const p of tripState.passengers) {
      if (p.userId) {
        emitToUser(p.userId, event, data);
      }
    }
  }
}

const lastCarLocation = { lat: null, lon: null };

io.on('connection', async (socket) => {
  const token = socket.handshake.auth?.token;
  const userId = token ? sessions.get(token) : null;

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  // Track user sockets
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socket.id);

  // Send current car location on connection
  socket.emit('car-location-updated', lastCarLocation);

  // Send current trip state on connection if active
  let userTrip = activeTrips.get(userId);
  if (!userTrip) {
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (dbUser) {
      for (const trip of activeTrips.values()) {
        if (trip.passengers.some(p => p.name === dbUser.username)) {
          userTrip = trip;
          break;
        }
      }
    }
  }
  if (userTrip) {
    socket.emit('current-trip-state', userTrip);
  }

  socket.on('update-car-location', (data) => {
    if (userId) {
      prisma.user.findUnique({ where: { id: userId } }).then(dbUser => {
        if (dbUser && dbUser.role === 'admin') {
          lastCarLocation.lat = data.lat;
          lastCarLocation.lon = data.lon;
          io.emit('car-location-updated', lastCarLocation);
        }
      });
    }
  });

  socket.on('ping-dashboard', (data) => {
    socket.emit('pong-dashboard', {
      message: 'Conexão WebSocket ativa!',
      timestamp: new Date().toISOString(),
    });
  });

  // start-trip
  socket.on('start-trip', (data) => {
    const tripState = {
      driverId: userId,
      passengers: data.passengers || [],
      departure: data.departure || '',
      destination: data.destination || '',
      startLat: data.startLat || null,
      startLon: data.startLon || null,
      endLat: data.endLat || null,
      endLon: data.endLon || null,
      routeCoords: data.routeCoords || [],
      keypoints: data.keypoints || [],
      etaMinutes: data.etaMinutes || 0,
      routeDistanceKm: data.routeDistanceKm || 0,
      routeSteps: data.routeSteps || [],
      startTime: data.startTime || Date.now(),
      distanceKm: 0,
      speed: 85,
      rpm: 2800,
      battery: 92,
      useDeviceLocation: data.useDeviceLocation || false,
      currentLat: data.startLat || null,
      currentLon: data.startLon || null
    };
    activeTrips.set(userId, tripState);
    emitTripEvent(tripState, 'trip-started', tripState);
  });

  // passenger-join-trip
  socket.on('passenger-join-trip', async (data) => {
    const driverId = Number(data.driverId);
    const seat = data.seat || 'Passageiro';
    const name = data.username || 'Anônimo';

    const tripState = activeTrips.get(driverId);
    if (tripState) {
      const exists = tripState.passengers.some(p => p.name === name);
      if (!exists) {
        const pUser = await prisma.user.findUnique({ where: { username: name } });
        const pUserId = pUser ? pUser.id : null;
        tripState.passengers.push({
          name: name,
          role: seat,
          status: '⚡ 0 Pontos',
          userId: pUserId
        });
        emitTripEvent(tripState, 'trip-updated', tripState);
      }
    }
  });

  // update-trip
  socket.on('update-trip', (data) => {
    const tripState = activeTrips.get(userId);
    if (tripState) {
      tripState.distanceKm = data.distanceKm || 0;
      tripState.speed = data.speed || 85;
      tripState.rpm = data.rpm || 2800;
      tripState.battery = data.battery || 92;
      if (data.currentLat != null) tripState.currentLat = data.currentLat;
      if (data.currentLon != null) tripState.currentLon = data.currentLon;
      emitTripEvent(tripState, 'trip-updated', tripState);
    }
  });

  // end-trip
  socket.on('end-trip', () => {
    const tripState = activeTrips.get(userId);
    if (tripState) {
      emitTripEvent(tripState, 'trip-ended', null);
      activeTrips.delete(userId);
    }
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
          pointsAlerts: true,
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
      profileTextColor: true,
      bannerPositionY: true,
      settings: {
        select: {
          pushNotifications: true,
          pointsAlerts: true,
          socialRanking: true,
          publicProfile: true,
          bgType: true,
          customBgUrl: true,
          spotifyConnected: true,
        },
      },
    },
  });

  if (!user) return reply.status(404).send({ error: 'Usuário não encontrado' });

  const stats = await getUserStats(userId);

  return {
    ...user,
    ...stats
  };
});

// POST /api/upload
fastify.post('/api/upload', { preHandler: authenticate }, async (request, reply) => {
  const data = await request.file();
  if (!data) {
    reply.status(400);
    return { error: 'Nenhum arquivo enviado' };
  }

  const ext = path.extname(data.filename) || '.jpg';
  const newFilename = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(uploadsDir, newFilename);

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath);
    data.file.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });

  const fileUrl = `/uploads/${newFilename}`;
  return { fileUrl };
});

// PUT /api/profile
fastify.put('/api/profile', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;
  const { username, bio, avatarUrl, bannerUrl, bannerPositionY, customTags, email, highlightedAchievements, profileTextColor } = request.body || {};

  const oldUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!oldUser) return reply.status(404).send({ error: 'Usuário não encontrado' });

  const updateData = {};
  if (bio !== undefined) updateData.bio = bio;
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
  if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
  if (bannerPositionY !== undefined) updateData.bannerPositionY = bannerPositionY;
  if (customTags !== undefined) updateData.customTags = typeof customTags === 'string' ? customTags : JSON.stringify(customTags);
  if (highlightedAchievements !== undefined) updateData.highlightedAchievements = typeof highlightedAchievements === 'string' ? highlightedAchievements : JSON.stringify(highlightedAchievements);
  if (profileTextColor !== undefined) updateData.profileTextColor = profileTextColor;
  if (email !== undefined) updateData.email = email;

  if (username !== undefined && username.trim() !== '') {
    const trimmedUsername = username.trim();
    if (trimmedUsername !== oldUser.username) {
      // Check if username is already taken
      const existingUser = await prisma.user.findUnique({ where: { username: trimmedUsername } });
      if (existingUser) {
        return reply.status(400).send({ error: 'Este nome de usuário já está sendo usado.' });
      }
      updateData.username = trimmedUsername;
    }
  }

  try {
    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (updateData.username) {
        // Update TripMedia
        await tx.tripMedia.updateMany({
          where: { type: 'passenger', content: oldUser.username },
          data: { content: updateData.username }
        });
        
        // Update Comment
        await tx.comment.updateMany({
          where: { authorName: oldUser.username },
          data: { authorName: updateData.username }
        });
      }

      return user;
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
        bannerPositionY: updatedUser.bannerPositionY,
        customTags: updatedUser.customTags,
        highlightedAchievements: updatedUser.highlightedAchievements,
        profileTextColor: updatedUser.profileTextColor,
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
  const { pushNotifications, pointsAlerts, socialRanking, publicProfile, bgType, customBgUrl } = request.body || {};

  const data = {};
  if (pushNotifications !== undefined) data.pushNotifications = pushNotifications;
  if (pointsAlerts !== undefined) data.pointsAlerts = pointsAlerts;
  if (socialRanking !== undefined) data.socialRanking = socialRanking;
  if (publicProfile !== undefined) data.publicProfile = publicProfile;
  if (bgType !== undefined) data.bgType = bgType;
  if (customBgUrl !== undefined) data.customBgUrl = customBgUrl;

  const settings = await prisma.settings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return settings;
});

// GET /api/ranking
fastify.get('/api/ranking', { preHandler: authenticate }, async () => {
  const scores = await prisma.score.findMany({
    where: {
      user: {
        settings: {
          publicProfile: true
        }
      }
    },
    orderBy: { points: 'desc' },
    take: 50,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          customTags: true,
          trips: {
            select: { id: true, distanceKm: true }
          }
        }
      }
    }
  });

  const usernames = scores.map(s => s.user?.username).filter(Boolean);
  const passengerMedias = await prisma.tripMedia.findMany({
    where: {
      type: 'passenger',
      content: { in: usernames }
    },
    include: {
      trip: true
    }
  });

  return scores.map((s, i) => {
    const user = s.user || {};
    const drivenTrips = user.trips || [];
    const userPassengerTrips = passengerMedias
      .filter(pm => pm.content === user.username && pm.trip)
      .map(pm => pm.trip);

    const tripMap = new Map();
    for (const t of drivenTrips) {
      tripMap.set(t.id, t);
    }
    for (const t of userPassengerTrips) {
      tripMap.set(t.id, t);
    }
    const allTrips = Array.from(tripMap.values());
    const totalDistance = allTrips.reduce((acc, trip) => acc + trip.distanceKm, 0);

    return {
      rank: i + 1,
      userId: s.userId,
      username: user.username || 'Desconhecido',
      avatarUrl: user.avatarUrl || '',
      customTags: user.customTags || '',
      tripsCount: allTrips.length,
      totalDistance,
      totalPoints: s.points || 0,
    };
  });
});

// GET /api/passengers
fastify.get('/api/passengers', { preHandler: authenticate }, async (request, reply) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      avatarUrl: true
    },
    orderBy: { username: 'asc' }
  });
  return users;
});

// GET /api/users/:id/profile
fastify.get('/api/users/:id/profile', { preHandler: authenticate }, async (request, reply) => {
  const userId = parseInt(request.params.id, 10);
  if (isNaN(userId)) return reply.code(400).send({ error: 'ID inválido' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      bio: true,
      bannerUrl: true,
      customTags: true,
      highlightedAchievements: true,
      profileTextColor: true,
      bannerPositionY: true,
      createdAt: true
    },
  });

  if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' });

  const stats = await getUserStats(userId);
  
  return { 
    ...user, 
    ...stats
  };
});

// POST /api/trips
fastify.post('/api/trips', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;
  const { 
    distanceKm, 
    durationMin, 
    durationSec, 
    avgSpeed, 
    passengerCount, 
    passengers,
    startLocation, 
    endLocation,
    startLat,
    startLon,
    endLat,
    endLon,
    routeCoords
  } = request.body || {};

  if (distanceKm == null || durationMin == null) {
    return reply.status(400).send({ error: 'distanceKm e durationMin são obrigatórios' });
  }

  const durationSecVal = durationSec != null ? parseInt(durationSec, 10) : parseInt(durationMin, 10) * 60;
  const pointsEarned = calculatePoints(distanceKm, durationSecVal);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create trip
      const trip = await tx.trip.create({
        data: {
          userId,
          distanceKm: parseFloat(distanceKm),
          durationMin: parseInt(durationMin, 10),
          avgSpeed: avgSpeed != null ? parseFloat(avgSpeed) : null,
          passengerCount: passengerCount != null ? parseInt(passengerCount, 10) : 1,
          startLocation: startLocation || null,
          endLocation: endLocation || null,
          pointsGenerated: pointsEarned,
          startLat: startLat != null ? parseFloat(startLat) : null,
          startLon: startLon != null ? parseFloat(startLon) : null,
          endLat: endLat != null ? parseFloat(endLat) : null,
          endLon: endLon != null ? parseFloat(endLon) : null,
          routeCoords: routeCoords || null,
        },
      });

      // Save passengers as TripMedia
      if (passengers && Array.isArray(passengers)) {
        for (const p of passengers) {
          const pName = typeof p === 'string' ? p : p.name;
          if (pName) {
            await tx.tripMedia.create({
              data: {
                tripId: trip.id,
                type: 'passenger',
                content: pName
              }
            });
          }
        }
      }

      // Upsert score (add points for driver)
      const existingScore = await tx.score.findFirst({ where: { userId } });
      if (existingScore) {
        await tx.score.update({
          where: { id: existingScore.id },
          data: { points: existingScore.points + pointsEarned },
        });
      } else {
        await tx.score.create({ data: { userId, points: pointsEarned } });
      }

      // Check achievement unlocks for driver using actual total stats (driven + passenger)
      const newAchievements = [];
      const driverUser = await tx.user.findUnique({ where: { id: userId } });
      const driverUsername = driverUser ? driverUser.username : '';

      // Find all driven trips
      const drivenTrips = await tx.trip.findMany({ where: { userId } });
      // Find all passenger trips
      const passengerMedias = await tx.tripMedia.findMany({
        where: { type: 'passenger', content: driverUsername },
        include: { trip: true }
      });
      const passengerTrips = passengerMedias.map(pm => pm.trip).filter(Boolean);

      const tripMap = new Map();
      for (const t of drivenTrips) {
        tripMap.set(t.id, t);
      }
      for (const t of passengerTrips) {
        tripMap.set(t.id, t);
      }

      // Deduplicated total trips and km (plus current trip)
      const totalTrips = tripMap.size + 1;
      const totalKm = Array.from(tripMap.values()).reduce((sum, t) => sum + t.distanceKm, 0) + parseFloat(distanceKm);

      // Already unlocked keys
      const unlocked = await tx.userAchievement.findMany({
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

      const keysToUnlock = rules
        .filter((rule) => rule.condition && !unlockedKeys.has(rule.key))
        .map((rule) => rule.key);

      if (keysToUnlock.length > 0) {
        const achievements = await tx.achievement.findMany({
          where: { key: { in: keysToUnlock } },
        });

        for (const achievement of achievements) {
          await tx.userAchievement.create({
            data: { userId, achievementId: achievement.id },
          });
          const ach = { key: achievement.key, title: achievement.title, emoji: achievement.emoji };
          newAchievements.push(ach);
          emitToUser(userId, 'achievement-unlocked', ach);
        }
      }

      return { trip, pointsGenerated: pointsEarned, newAchievements };
    });

    // Sync score (fully refresh to keep in absolute sync)
    await syncUserScore(userId);

    // Sync score for passengers (real users)
    if (passengers && Array.isArray(passengers)) {
      const passengerNames = passengers.map(p => typeof p === 'string' ? p : p.name).filter(Boolean);
      if (passengerNames.length > 0) {
        const passengerUsers = await prisma.user.findMany({
          where: { username: { in: passengerNames } }
        });
        for (const pu of passengerUsers) {
          await syncUserScore(pu.id);
        }
      }
    }

    return result;
  } catch (err) {
    return reply.status(500).send({ error: 'Erro ao registrar corrida: ' + err.message });
  }
});

// GET /api/achievements
fastify.get('/api/achievements', { preHandler: authenticate }, async (request) => {
  const userId = request.userId;

  const all = await prisma.achievement.findMany({
    orderBy: { id: 'asc' },
    include: {
      users: {
        orderBy: { unlockedAt: 'asc' },
        take: 1,
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true }
          }
        }
      }
    }
  });

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
    firstWinner: a.users.length > 0 ? a.users[0].user : null,
  }));
});

// ─── Admin Routes ────────────────────────────────────────

// GET /api/admin/users
fastify.get('/api/admin/users', { preHandler: authenticateAdmin }, async () => {
  const users = await prisma.user.findMany({
    include: {
      addresses: true,
      profileComments: true,
      score: true,
      achievements: {
        include: {
          achievement: true
        }
      },
      trips: {
        select: { id: true }
      }
    },
    orderBy: { id: 'asc' }
  });

  // Fetch all passenger medias to count passenger trips
  const allPassengerMedias = await prisma.tripMedia.findMany({
    where: { type: 'passenger' }
  });

  return users.map(u => {
    const drivenTripIds = u.trips.map(t => t.id);
    const passengerTripIds = allPassengerMedias
      .filter(pm => pm.content === u.username)
      .map(pm => pm.tripId);
    
    // Deduplicate
    const uniqueTripIds = new Set([...drivenTripIds, ...passengerTripIds]);
    
    const { trips, ...rest } = u;
    return {
      ...rest,
      tripsCount: uniqueTripIds.size
    };
  });
});

// POST /api/admin/users
fastify.post('/api/admin/users', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { username, password, email, role, avatarUrl, bannerUrl } = request.body || {};
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
      avatarUrl: avatarUrl || null,
      bannerUrl: bannerUrl || null,
      settings: {
        create: {
          pushNotifications: true,
          pointsAlerts: true,
          socialRanking: false,
          publicProfile: true,
        },
      },
    },
    include: {
      addresses: true,
      profileComments: true,
      trips: { select: { id: true } }
    }
  });

  const { trips, ...rest } = user;
  return {
    ...rest,
    tripsCount: 0
  };
});

// PUT /api/admin/users/:id
fastify.put('/api/admin/users/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { username, email, role, password, avatarUrl, bannerUrl } = request.body || {};

  const updateData = {};
  if (username !== undefined) updateData.username = username;
  if (email !== undefined) updateData.email = email || null;
  if (role !== undefined) updateData.role = role;
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
  if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
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
        trips: { select: { id: true } }
      }
    });
    const { trips, ...rest } = user;
    return {
      ...rest,
      tripsCount: trips.length
    };
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
  const { 
    userId, 
    distanceKm, 
    durationMin, 
    avgSpeed, 
    name, 
    startLocation, 
    endLocation, 
    pointsGenerated,
    createdAt,
    passengerIds,
    waypoints,
    startLat,
    startLon,
    endLat,
    endLon,
    routeCoords,
    achievementIds
  } = request.body || {};

  if (!userId || distanceKm == null || durationMin == null) {
    return reply.status(400).send({ error: 'userId, distanceKm e durationMin são obrigatórios' });
  }

  const driverId = parseInt(userId, 10);
  const dist = parseFloat(distanceKm);
  const durMin = parseInt(durationMin, 10);
  const pointsEarned = calculatePoints(dist, durMin * 60);

  const passengerIdsArr = Array.isArray(passengerIds) ? passengerIds.map(id => parseInt(id, 10)) : [];
  const passengerUsers = await prisma.user.findMany({
    where: { id: { in: passengerIdsArr } }
  });

  const achievementIdsArr = Array.isArray(achievementIds) ? achievementIds.map(id => parseInt(id, 10)) : [];
  const validAchievements = await prisma.achievement.findMany({
    where: { id: { in: achievementIdsArr } }
  });

  const parsedDate = createdAt ? new Date(createdAt) : new Date();

  // Build media items (passengers & achievements)
  const mediaItems = [
    ...passengerUsers.map(u => ({
      type: 'passenger',
      content: u.username
    })),
    ...validAchievements.map(ach => ({
      type: 'achievement',
      content: String(ach.id)
    }))
  ];

  const trip = await prisma.trip.create({
    data: {
      userId: driverId,
      distanceKm: dist,
      durationMin: durMin,
      avgSpeed: avgSpeed != null ? parseFloat(avgSpeed) : null,
      name: name || null,
      startLocation: startLocation || null,
      endLocation: endLocation || null,
      startLat: startLat != null ? parseFloat(startLat) : null,
      startLon: startLon != null ? parseFloat(startLon) : null,
      endLat: endLat != null ? parseFloat(endLat) : null,
      endLon: endLon != null ? parseFloat(endLon) : null,
      routeCoords: routeCoords || null,
      passengerCount: passengerUsers.length || 1,
      pointsGenerated: pointsEarned,
      createdAt: parsedDate,
      waypoints: {
        create: (Array.isArray(waypoints) ? waypoints : []).map((addr, idx) => ({
          address: addr,
          order: idx
        }))
      },
      media: {
        create: mediaItems
      }
    },
    include: {
      waypoints: true,
      media: true
    }
  });

  // Sync Scores using helper
  await syncUserScore(driverId);
  for (const passengerUser of passengerUsers) {
    await syncUserScore(passengerUser.id);
  }

  return trip;
});

// PUT /api/admin/trips/:id
fastify.put('/api/admin/trips/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { 
    userId,
    distanceKm, 
    durationMin, 
    avgSpeed, 
    name, 
    startLocation, 
    endLocation, 
    pointsGenerated,
    createdAt,
    passengerIds,
    waypoints,
    startLat,
    startLon,
    endLat,
    endLon,
    routeCoords,
    achievementIds
  } = request.body || {};

  try {
    // Fetch old trip state to know which users to re-sync
    const oldTrip = await prisma.trip.findUnique({
      where: { id },
      include: { media: true }
    });
    if (!oldTrip) return reply.status(404).send({ error: 'Corrida não encontrada' });

    const oldDriverId = oldTrip.userId;
    const oldPassengerUsernames = oldTrip.media.filter(m => m.type === 'passenger').map(m => m.content);
    const oldPassengerUsers = oldPassengerUsernames.length > 0
      ? await prisma.user.findMany({ where: { username: { in: oldPassengerUsernames } } })
      : [];

    const passengerIdsArr = Array.isArray(passengerIds) ? passengerIds.map(id => parseInt(id, 10)) : [];
    const newPassengerUsers = passengerIds !== undefined
      ? await prisma.user.findMany({ where: { id: { in: passengerIdsArr } } })
      : [];

    // Execute all database actions inside a transaction to ensure atomic execution
    const trip = await prisma.$transaction(async (tx) => {
      const updateData = {};
      if (distanceKm !== undefined) updateData.distanceKm = parseFloat(distanceKm);
      if (durationMin !== undefined) updateData.durationMin = parseInt(durationMin, 10);
      if (avgSpeed !== undefined) updateData.avgSpeed = avgSpeed != null ? parseFloat(avgSpeed) : null;
      if (name !== undefined) updateData.name = name || null;
      if (startLocation !== undefined) updateData.startLocation = startLocation || null;
      if (endLocation !== undefined) updateData.endLocation = endLocation || null;
      if (startLat !== undefined) updateData.startLat = startLat != null ? parseFloat(startLat) : null;
      if (startLon !== undefined) updateData.startLon = startLon != null ? parseFloat(startLon) : null;
      if (endLat !== undefined) updateData.endLat = endLat != null ? parseFloat(endLat) : null;
      if (endLon !== undefined) updateData.endLon = endLon != null ? parseFloat(endLon) : null;
      if (routeCoords !== undefined) updateData.routeCoords = routeCoords || null;
      if (createdAt !== undefined) updateData.createdAt = new Date(createdAt);
      if (userId !== undefined) updateData.userId = parseInt(userId, 10);

      // Recalculate pointsGenerated automatically (ignore manual override)
      if (distanceKm !== undefined || durationMin !== undefined || pointsGenerated !== undefined) {
        const newDist = distanceKm !== undefined ? parseFloat(distanceKm) : oldTrip.distanceKm;
        const newDurMin = durationMin !== undefined ? parseInt(durationMin, 10) : oldTrip.durationMin;
        const recalcPoints = calculatePoints(newDist, newDurMin * 60);
        updateData.pointsGenerated = recalcPoints;
      }

      // Update passengers
      if (passengerIds !== undefined) {
        await tx.tripMedia.deleteMany({
          where: { tripId: id, type: 'passenger' }
        });
        await tx.tripMedia.createMany({
          data: newPassengerUsers.map(u => ({
            tripId: id,
            type: 'passenger',
            content: u.username
          }))
        });
        updateData.passengerCount = newPassengerUsers.length || 1;
      }

      // Update achievements
      if (achievementIds !== undefined) {
        await tx.tripMedia.deleteMany({
          where: { tripId: id, type: 'achievement' }
        });
        const achievementIdsArr = Array.isArray(achievementIds) ? achievementIds.map(i => parseInt(i, 10)) : [];
        const validAchievements = await prisma.achievement.findMany({
          where: { id: { in: achievementIdsArr } }
        });
        await tx.tripMedia.createMany({
          data: validAchievements.map(ach => ({
            tripId: id,
            type: 'achievement',
            content: String(ach.id)
          }))
        });
      }

      // Update waypoints
      if (waypoints !== undefined) {
        await tx.waypoint.deleteMany({ where: { tripId: id } });
        await tx.waypoint.createMany({
          data: (Array.isArray(waypoints) ? waypoints : []).map((addr, idx) => ({
            tripId: id,
            address: addr,
            order: idx
          }))
        });
      }

      return tx.trip.update({
        where: { id },
        data: updateData,
        include: {
          waypoints: true,
          media: true
        }
      });
    });

    // Sync scores for all affected users (old and new drivers + passengers)
    const userIdsToSync = new Set();
    userIdsToSync.add(oldDriverId);
    userIdsToSync.add(trip.userId);
    oldPassengerUsers.forEach(u => userIdsToSync.add(u.id));
    newPassengerUsers.forEach(u => userIdsToSync.add(u.id));
    for (const uid of userIdsToSync) {
      await syncUserScore(uid);
    }

    return trip;
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao atualizar corrida: ' + err.message });
  }
});

// DELETE /api/admin/trips/:id
fastify.delete('/api/admin/trips/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  try {
    // Fetch trip before deleting to know which users to re-sync
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: { media: true }
    });
    if (!trip) return reply.status(404).send({ error: 'Corrida não encontrada' });

    const driverId = trip.userId;
    const passengerUsernames = trip.media.filter(m => m.type === 'passenger').map(m => m.content);
    const passengerUsers = passengerUsernames.length > 0
      ? await prisma.user.findMany({ where: { username: { in: passengerUsernames } } })
      : [];

    await prisma.trip.delete({ where: { id } });

    // Re-sync scores for driver and passengers
    await syncUserScore(driverId);
    for (const pu of passengerUsers) {
      await syncUserScore(pu.id);
    }

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

// GET /api/backgrounds
fastify.get('/api/backgrounds', { preHandler: authenticate }, async () => {
  return prisma.backgroundOption.findMany({
    orderBy: { id: 'asc' }
  });
});

// GET /api/admin/backgrounds
fastify.get('/api/admin/backgrounds', { preHandler: authenticateAdmin }, async () => {
  return prisma.backgroundOption.findMany({
    orderBy: { id: 'asc' }
  });
});

// POST /api/admin/backgrounds
fastify.post('/api/admin/backgrounds', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { key, title, url } = request.body || {};
  if (!key || !title || !url) {
    return reply.status(400).send({ error: 'key, title e url são obrigatórios' });
  }

  const existing = await prisma.backgroundOption.findUnique({ where: { key } });
  if (existing) {
    return reply.status(409).send({ error: 'Imagem de fundo com esta chave já existe' });
  }

  const background = await prisma.backgroundOption.create({
    data: { key, title, url }
  });
  return background;
});

// PUT /api/admin/backgrounds/:id
fastify.put('/api/admin/backgrounds/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { key, title, url } = request.body || {};
  if (!key || !title || !url) {
    return reply.status(400).send({ error: 'key, title e url são obrigatórios' });
  }

  const existing = await prisma.backgroundOption.findFirst({
    where: {
      key,
      id: { not: id }
    }
  });
  if (existing) {
    return reply.status(409).send({ error: 'Imagem de fundo com esta chave já existe' });
  }

  try {
    const updated = await prisma.backgroundOption.update({
      where: { id },
      data: { key, title, url }
    });
    return updated;
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao editar imagem de fundo: ' + err.message });
  }
});

// DELETE /api/admin/backgrounds/:id
fastify.delete('/api/admin/backgrounds/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  try {
    await prisma.backgroundOption.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao deletar imagem de fundo: ' + err.message });
  }
});

// ─── Embedded Database Explorer Endpoints ─────────────────

const modelMapper = {
  User: prisma.user,
  Score: prisma.score,
  Achievement: prisma.achievement,
  UserAchievement: prisma.userAchievement,
  Trip: prisma.trip,
  Address: prisma.address,
  Comment: prisma.comment,
  Waypoint: prisma.waypoint,
  TripMedia: prisma.tripMedia,
  Settings: prisma.settings,
  BackgroundOption: prisma.backgroundOption,
  MusicTrack: prisma.musicTrack,
  UserRequest: prisma.userRequest
};

// GET /api/admin/db/tables/:tableName
fastify.get('/api/admin/db/tables/:tableName', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { tableName } = request.params;
  const dbModel = modelMapper[tableName];
  if (!dbModel) {
    return reply.status(400).send({ error: 'Tabela inválida' });
  }

  try {
    const records = await dbModel.findMany({
      take: 500,
      orderBy: { id: 'desc' }
    });
    return records;
  } catch (err) {
    try {
      const records = await dbModel.findMany({ take: 500 });
      return records;
    } catch (innerErr) {
      return reply.status(400).send({ error: 'Erro ao buscar dados: ' + innerErr.message });
    }
  }
});

// DELETE /api/admin/db/tables/:tableName/:id
fastify.delete('/api/admin/db/tables/:tableName/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { tableName } = request.params;
  const id = parseInt(request.params.id, 10);
  const dbModel = modelMapper[tableName];
  if (!dbModel) {
    return reply.status(400).send({ error: 'Tabela inválida' });
  }

  try {
    await dbModel.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao deletar registro: ' + err.message });
  }
});

// GET /api/admin/db/export
fastify.get('/api/admin/db/export', { preHandler: authenticateAdmin }, async (request, reply) => {
  const dbPath = path.join(__dirname, 'prisma', 'dev.db');
  if (!fs.existsSync(dbPath)) {
    return reply.status(404).send({ error: 'Arquivo do banco de dados não encontrado' });
  }

  reply.header('Content-Type', 'application/x-sqlite3');
  reply.header('Content-Disposition', 'attachment; filename="dev.db"');
  return fs.createReadStream(dbPath);
});

// ─── Spotify Configuration & Helpers ─────────────────────
const SPOTIFY_CLIENT_ID = '6209183f5ad2414eab70484c49c3d69c';
const SPOTIFY_CLIENT_SECRET = 'a1b7776db87547038216efab62d7d39d';
const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:3003/api/spotify/callback';

async function getSpotifyAccessToken(refreshToken) {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const authHeader = 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Failed to refresh Spotify token: ' + errText);
  }

  const data = await response.json();
  return data.access_token;
}

async function getSpotifyCurrentlyPlaying(userId) {
  const settings = await prisma.settings.findUnique({
    where: { userId }
  });

  if (!settings || !settings.spotifyConnected || !settings.spotifyRefreshToken) {
    return null;
  }

  try {
    const accessToken = await getSpotifyAccessToken(settings.spotifyRefreshToken);

    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.status === 204 || response.status === 404) {
      return { isSpotify: true, isPlaying: false };
    }

    if (!response.ok) {
      throw new Error('Spotify API returned status ' + response.status);
    }

    const data = await response.json();
    if (!data || !data.item) {
      return { isSpotify: true, isPlaying: false };
    }

    return {
      id: `spotify-${data.item.id}`,
      title: data.item.name,
      artist: data.item.artists.map(a => a.name).join(', '),
      coverUrl: data.item.album?.images?.[0]?.url || null,
      audioUrl: '',
      isSpotify: true,
      isPlaying: data.is_playing,
      progressMs: data.progress_ms,
      durationMs: data.item.duration_ms
    };
  } catch (err) {
    console.error('Error fetching Spotify currently playing:', err);
    return null;
  }
}

async function skipSpotifyTrack(userId, direction) {
  const settings = await prisma.settings.findUnique({
    where: { userId }
  });

  if (!settings || !settings.spotifyConnected || !settings.spotifyRefreshToken) {
    return false;
  }

  try {
    const accessToken = await getSpotifyAccessToken(settings.spotifyRefreshToken);
    const endpoint = direction === 'next'
      ? 'https://api.spotify.com/v1/me/player/next'
      : 'https://api.spotify.com/v1/me/player/previous';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return response.ok;
  } catch (err) {
    console.error(`Error skipping Spotify track (${direction}):`, err);
    return false;
  }
}

async function isUserInActiveTrip(userId) {
  if (!userId) return false;
  const numUserId = Number(userId);

  // Check if user is the driver
  if (activeTrips.has(numUserId)) return true;

  // Also check entries to verify if any driver ID matches numerically
  for (const [driverId, trip] of activeTrips.entries()) {
    if (Number(driverId) === numUserId) return true;
  }

  // Check if user is a passenger
  const dbUser = await prisma.user.findUnique({ where: { id: numUserId } });
  if (!dbUser) return false;

  for (const trip of activeTrips.values()) {
    if (trip.passengers && Array.isArray(trip.passengers)) {
      const isPassenger = trip.passengers.some(p => 
        (p && Number(p.userId) === numUserId) || 
        (p && p.name === dbUser.username)
      );
      if (isPassenger) return true;
    }
  }
  return false;
}

async function toggleSpotifyPlayback(userId, action) {
  const settings = await prisma.settings.findUnique({
    where: { userId }
  });

  if (!settings || !settings.spotifyConnected || !settings.spotifyRefreshToken) {
    return false;
  }

  try {
    const accessToken = await getSpotifyAccessToken(settings.spotifyRefreshToken);
    const endpoint = action === 'play'
      ? 'https://api.spotify.com/v1/me/player/play'
      : 'https://api.spotify.com/v1/me/player/pause';

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return response.ok || response.status === 204;
  } catch (err) {
    console.error(`Error toggling Spotify playback (${action}):`, err);
    return false;
  }
}

// ─── Music Routes ────────────────────────────────────────

// GET /api/music/active
fastify.get('/api/music/active', async (request, reply) => {
  let userId = null;
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    userId = sessions.get(token);
  }

  if (!userId && activeTrips.size > 0) {
    const firstTrip = activeTrips.values().next().value;
    if (firstTrip) {
      userId = firstTrip.driverId;
    }
  }

  if (userId && await isUserInActiveTrip(userId)) {
    const spotifyTrack = await getSpotifyCurrentlyPlaying(userId);
    if (spotifyTrack && spotifyTrack.title) {
      return spotifyTrack;
    }
  }

  const activeMusic = await prisma.musicTrack.findFirst({
    where: { isActive: true }
  });
  if (activeMusic) {
    return {
      ...activeMusic,
      autoplay: musicSettings.autoplay,
      shuffle: musicSettings.shuffle
    };
  }
  return null;
});

// GET /api/spotify/login
fastify.get('/api/spotify/login', async (request, reply) => {
  const token = request.query.token;
  const frontendUrl = request.query.frontend_url || 'http://127.0.0.1:3002';
  if (!token) {
    return reply.status(400).send({ error: 'Token de sessão é obrigatório' });
  }

  const scopes = [
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');

  const host = request.headers.host;
  const protocol = request.headers['x-forwarded-proto'] || (request.raw.socket.encrypted ? 'https' : 'http');
  const redirectUri = `${protocol}://${host}/api/spotify/callback`;

  const stateValue = Buffer.from(JSON.stringify({ token, frontendUrl, redirectUri })).toString('base64');

  const spotifyAuthUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: redirectUri,
    state: stateValue
  }).toString();

  return reply.redirect(spotifyAuthUrl);
});

// GET /api/spotify/callback
fastify.get('/api/spotify/callback', async (request, reply) => {
  const { code, state, error } = request.query;

  if (!state) {
    return reply.status(400).send({ error: 'Estado inválido' });
  }

  let token = null;
  let frontendUrl = 'http://127.0.0.1:3002';
  let redirectUri = '';
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    token = stateData.token;
    frontendUrl = stateData.frontendUrl;
    redirectUri = stateData.redirectUri;
  } catch (e) {
    return reply.status(400).send({ error: 'Estado corrompido ou malformado' });
  }

  if (error) {
    return reply.redirect(`${frontendUrl}/?spotify_error=` + encodeURIComponent(error));
  }

  if (!code || !token) {
    return reply.status(400).send({ error: 'Código ou token inválido' });
  }

  const userId = sessions.get(token);
  if (!userId) {
    return reply.status(401).send({ error: 'Sessão inválida ou expirada' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);

    const authHeader = 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64');

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error('Failed to exchange code: ' + errText);
    }

    const tokenData = await tokenResponse.json();
    const refreshToken = tokenData.refresh_token;

    await prisma.settings.update({
      where: { userId },
      data: {
        spotifyConnected: true,
        spotifyRefreshToken: refreshToken
      }
    });

    return reply.redirect(`${frontendUrl}/?spotify_success=true`);
  } catch (err) {
    console.error('Error during Spotify OAuth callback:', err);
    return reply.redirect(`${frontendUrl}/?spotify_error=` + encodeURIComponent(err.message));
  }
});

// POST /api/spotify/disconnect
fastify.post('/api/spotify/disconnect', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;
  try {
    await prisma.settings.update({
      where: { userId },
      data: {
        spotifyConnected: false,
        spotifyRefreshToken: null
      }
    });
    return { success: true };
  } catch (err) {
    return reply.status(500).send({ error: 'Erro ao desconectar Spotify: ' + err.message });
  }
});

// GET /api/admin/music/settings
fastify.get('/api/admin/music/settings', { preHandler: authenticate }, async () => {
  return musicSettings;
});

// PUT /api/admin/music/settings
fastify.put('/api/admin/music/settings', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { autoplay, shuffle } = request.body || {};
  musicSettings.autoplay = !!autoplay;
  musicSettings.shuffle = !!shuffle;
  saveMusicSettings();
  return { success: true, settings: musicSettings };
});

// GET /api/admin/music
fastify.get('/api/admin/music', { preHandler: authenticateAdmin }, async () => {
  return prisma.musicTrack.findMany({
    orderBy: { createdAt: 'desc' }
  });
});

// POST /api/admin/music
fastify.post('/api/admin/music', { preHandler: authenticateAdmin }, async (request, reply) => {
  const { title, audioUrl, coverUrl } = request.body || {};
  if (!title || !audioUrl) {
    return reply.status(400).send({ error: 'Título e arquivo de áudio são obrigatórios' });
  }

  const track = await prisma.musicTrack.create({
    data: {
      title,
      audioUrl,
      coverUrl,
      isActive: false
    }
  });
  return track;
});

// PUT /api/admin/music/:id/activate
fastify.put('/api/admin/music/:id/activate', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id)) {
    return reply.status(400).send({ error: 'ID inválido' });
  }

  try {
    const updatedTrack = await prisma.$transaction(async (tx) => {
      await tx.musicTrack.updateMany({
        data: { isActive: false }
      });

      return tx.musicTrack.update({
        where: { id },
        data: { isActive: true }
      });
    });

    return updatedTrack;
  } catch (err) {
    return reply.status(500).send({ error: 'Erro ao ativar música: ' + err.message });
  }
});

// DELETE /api/admin/music/:id
fastify.delete('/api/admin/music/:id', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id)) {
    return reply.status(400).send({ error: 'ID inválido' });
  }

  try {
    await prisma.musicTrack.delete({
      where: { id }
    });
    return { success: true };
  } catch (err) {
    return reply.status(400).send({ error: 'Erro ao deletar música: ' + err.message });
  }
});

// ─── Music Navigation Routes ─────────────────────────────

// POST /api/music/next
fastify.post('/api/music/next', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;

  // Check if user has Spotify connected, active AND they are in an active trip
  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (settings && settings.spotifyConnected && settings.spotifyRefreshToken && await isUserInActiveTrip(userId)) {
    const activeSpotify = await getSpotifyCurrentlyPlaying(userId);
    if (activeSpotify && activeSpotify.isSpotify && activeSpotify.title) {
      const success = await skipSpotifyTrack(userId, 'next');
      if (success) {
        await new Promise(resolve => setTimeout(resolve, 800)); // wait for Spotify to advance
        const newTrack = await getSpotifyCurrentlyPlaying(userId);
        return newTrack || { isSpotify: true, isPlaying: true };
      }
    }
  }

  try {
    const tracks = await prisma.musicTrack.findMany({
      orderBy: { id: 'asc' }
    });
    if (tracks.length === 0) return null;

    const activeTrack = await prisma.musicTrack.findFirst({
      where: { isActive: true }
    });

    let nextIndex = 0;
    if (musicSettings.shuffle) {
      if (tracks.length > 1) {
        const activeIndex = activeTrack ? tracks.findIndex(t => t.id === activeTrack.id) : -1;
        do {
          nextIndex = Math.floor(Math.random() * tracks.length);
        } while (nextIndex === activeIndex);
      } else {
        nextIndex = 0;
      }
    } else {
      if (activeTrack) {
        const activeIndex = tracks.findIndex(t => t.id === activeTrack.id);
        if (activeIndex !== -1) {
          nextIndex = (activeIndex + 1) % tracks.length;
        }
      }
    }

    const nextTrack = tracks[nextIndex];
    await prisma.$transaction([
      prisma.musicTrack.updateMany({ data: { isActive: false } }),
      prisma.musicTrack.update({ where: { id: nextTrack.id }, data: { isActive: true } })
    ]);

    return {
      ...nextTrack,
      autoplay: musicSettings.autoplay,
      shuffle: musicSettings.shuffle
    };
  } catch (err) {
    return reply.status(500).send({ error: 'Erro ao avançar música: ' + err.message });
  }
});

// POST /api/music/prev
fastify.post('/api/music/prev', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;

  // Check if user has Spotify connected, active AND they are in an active trip
  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (settings && settings.spotifyConnected && settings.spotifyRefreshToken && await isUserInActiveTrip(userId)) {
    const activeSpotify = await getSpotifyCurrentlyPlaying(userId);
    if (activeSpotify && activeSpotify.isSpotify && activeSpotify.title) {
      const success = await skipSpotifyTrack(userId, 'prev');
      if (success) {
        await new Promise(resolve => setTimeout(resolve, 800)); // wait for Spotify to change
        const newTrack = await getSpotifyCurrentlyPlaying(userId);
        return newTrack || { isSpotify: true, isPlaying: true };
      }
    }
  }

  try {
    const tracks = await prisma.musicTrack.findMany({
      orderBy: { id: 'asc' }
    });
    if (tracks.length === 0) return null;

    const activeTrack = await prisma.musicTrack.findFirst({
      where: { isActive: true }
    });

    let prevIndex = tracks.length - 1;
    if (musicSettings.shuffle) {
      if (tracks.length > 1) {
        const activeIndex = activeTrack ? tracks.findIndex(t => t.id === activeTrack.id) : -1;
        do {
          prevIndex = Math.floor(Math.random() * tracks.length);
        } while (prevIndex === activeIndex);
      } else {
        prevIndex = 0;
      }
    } else {
      if (activeTrack) {
        const activeIndex = tracks.findIndex(t => t.id === activeTrack.id);
        if (activeIndex !== -1) {
          prevIndex = (activeIndex - 1 + tracks.length) % tracks.length;
        }
      }
    }

    const prevTrack = tracks[prevIndex];
    await prisma.$transaction([
      prisma.musicTrack.updateMany({ data: { isActive: false } }),
      prisma.musicTrack.update({ where: { id: prevTrack.id }, data: { isActive: true } })
    ]);

    return {
      ...prevTrack,
      autoplay: musicSettings.autoplay,
      shuffle: musicSettings.shuffle
    };
  } catch (err) {
    return reply.status(500).send({ error: 'Erro ao voltar música: ' + err.message });
  }
});

// POST /api/music/toggle
fastify.post('/api/music/toggle', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;
  const { action } = request.body || {};

  if (!action || (action !== 'play' && action !== 'pause')) {
    return reply.status(400).send({ error: 'Ação inválida. Use "play" ou "pause"' });
  }

  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (settings && settings.spotifyConnected && settings.spotifyRefreshToken && await isUserInActiveTrip(userId)) {
    const activeSpotify = await getSpotifyCurrentlyPlaying(userId);
    if (activeSpotify && activeSpotify.isSpotify && activeSpotify.title) {
      const success = await toggleSpotifyPlayback(userId, action);
      return { success, isSpotify: true };
    }
  }

  return { success: true, isSpotify: false };
});

// ─── User Requests Routes ───────────────────────────────

// POST /api/requests
fastify.post('/api/requests', { preHandler: authenticate }, async (request, reply) => {
  const userId = request.userId;
  const { type, details } = request.body || {};
  if (!type || !details) {
    return reply.status(400).send({ error: 'Tipo e detalhes são obrigatórios' });
  }

  try {
    const userRequest = await prisma.userRequest.create({
      data: {
        userId,
        type,
        details: typeof details === 'string' ? details : JSON.stringify(details),
        status: 'pending'
      }
    });
    return userRequest;
  } catch (err) {
    return reply.status(500).send({ error: 'Erro ao criar solicitação: ' + err.message });
  }
});

// GET /api/requests
fastify.get('/api/requests', { preHandler: authenticate }, async (request) => {
  const userId = request.userId;
  return prisma.userRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
});

// GET /api/admin/requests
fastify.get('/api/admin/requests', { preHandler: authenticateAdmin }, async () => {
  return prisma.userRequest.findMany({
    include: {
      user: {
        select: { id: true, username: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
});

// POST /api/admin/requests/:id/action
fastify.post('/api/admin/requests/:id/action', { preHandler: authenticateAdmin }, async (request, reply) => {
  const id = parseInt(request.params.id, 10);
  const { action } = request.body || {}; // "approve" | "reject"
  if (isNaN(id) || !['approve', 'reject'].includes(action)) {
    return reply.status(400).send({ error: 'Ação ou ID inválido' });
  }

  try {
    const userRequest = await prisma.userRequest.findUnique({
      where: { id },
      include: { user: true }
    });
    if (!userRequest) return reply.status(404).send({ error: 'Solicitação não encontrada' });

    if (action === 'reject') {
      return prisma.userRequest.update({
        where: { id },
        data: { status: 'rejected' }
      });
    }

    const details = typeof userRequest.details === 'string' ? JSON.parse(userRequest.details) : userRequest.details;

    const updatedRequest = await prisma.$transaction(async (tx) => {
      if (userRequest.type === 'background') {
        await tx.backgroundOption.create({
          data: {
            key: details.key || `bg-${Date.now()}`,
            title: details.title,
            url: details.url
          }
        });
      } else if (userRequest.type === 'music') {
        await tx.musicTrack.create({
          data: {
            title: details.title,
            audioUrl: details.audioUrl || '',
            coverUrl: details.coverUrl || null,
            isActive: false
          }
        });
      } else if (userRequest.type === 'achievement') {
        await tx.achievement.create({
          data: {
            key: details.key || `ach-${Date.now()}`,
            title: details.title,
            description: details.description,
            emoji: details.emoji,
            glowColor: details.glowColor || null
          }
        });
      } else if (userRequest.type === 'trip') {
        const dist = parseFloat(details.distanceKm);
        const durMin = parseInt(details.durationMin, 10);
        const pointsGenerated = calculatePoints(dist, durMin * 60);

        await tx.trip.create({
          data: {
            userId: userRequest.userId,
            distanceKm: dist,
            durationMin: durMin,
            avgSpeed: details.avgSpeed != null ? parseFloat(details.avgSpeed) : null,
            name: details.name || 'Corrida Sugerida',
            startLocation: details.startLocation || null,
            endLocation: details.endLocation || null,
            pointsGenerated: pointsGenerated,
            passengerCount: parseInt(details.passengerCount, 10) || 1,
            startLat: details.startLat != null ? parseFloat(details.startLat) : null,
            startLon: details.startLon != null ? parseFloat(details.startLon) : null,
            endLat: details.endLat != null ? parseFloat(details.endLat) : null,
            endLon: details.endLon != null ? parseFloat(details.endLon) : null,
            routeCoords: details.routeCoords || null,
          }
        });

        const existingScore = await tx.score.findFirst({ where: { userId: userRequest.userId } });
        if (existingScore) {
          await tx.score.update({
            where: { id: existingScore.id },
            data: { points: existingScore.points + pointsGenerated }
          });
        } else {
          await tx.score.create({ data: { userId: userRequest.userId, points: pointsGenerated } });
        }
      }

      return tx.userRequest.update({
        where: { id },
        data: { status: 'approved' }
      });
    });

    if (userRequest.type === 'trip') {
      await syncUserScore(userRequest.userId);
    }

    return updatedRequest;
  } catch (err) {
    return reply.status(500).send({ error: 'Erro ao processar solicitação: ' + err.message });
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
  await fastify.listen({ port: 3003, host: '0.0.0.0' });
  console.log('🚀 Backend rodando em http://0.0.0.0:3003');
} catch (err) {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
}
