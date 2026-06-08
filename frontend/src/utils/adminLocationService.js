import { ref } from 'vue';
import { io } from 'socket.io-client';
import { API_URL } from './api';

export const adminLocation = ref({ lat: null, lon: null });
export const adminSpeed = ref(0);

let adminSocket = null;
let watchId = null;
let isChecking = false;

async function checkAdminAndStart() {
  const token = localStorage.getItem('token');
  if (!token) {
    stopAdminTracking();
    return;
  }

  if (isChecking) return;
  isChecking = true;

  try {
    const res = await fetch(`${API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch user');
    const user = await res.json();

    if (user && user.role === 'admin') {
      startAdminTracking(token);
    } else {
      stopAdminTracking();
    }
  } catch (err) {
    console.error('Error in checkAdminAndStart:', err);
    // Do not stop tracking on network failure if we were already tracking
    if (watchId === null) {
      stopAdminTracking();
    }
  } finally {
    isChecking = false;
  }
}

function startAdminTracking(token) {
  if (watchId !== null) return; // Already tracking

  if (!navigator.geolocation) {
    console.warn('Geolocation not supported by this browser.');
    return;
  }

  // Connect socket if not already connected
  if (!adminSocket || !adminSocket.connected) {
    adminSocket = io(API_URL, { auth: { token } });
    adminSocket.on('connect', () => {
      console.log('Admin background location socket connected.');
    });
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      adminLocation.value = { lat, lon };
      
      const speedMs = position.coords.speed;
      if (speedMs != null) {
        adminSpeed.value = Math.round(speedMs * 3.6);
      }

      if (adminSocket && adminSocket.connected) {
        adminSocket.emit('update-car-location', { lat, lon });
      }
    },
    (err) => {
      console.warn('Error in continuous admin geolocation tracking:', err);
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
  );
}

export function stopAdminTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (adminSocket) {
    adminSocket.disconnect();
    adminSocket = null;
  }
  adminLocation.value = { lat: null, lon: null };
  adminSpeed.value = 0;
}

export function initAdminLocationService() {
  // Check on init
  checkAdminAndStart();

  // Watch for local storage changes (e.g. login/logout in other tabs)
  window.addEventListener('storage', (e) => {
    if (e.key === 'token') {
      checkAdminAndStart();
    }
  });
}

// Expose a way to manually trigger checking (e.g. after login/logout in current tab)
export function triggerAdminTrackingCheck() {
  checkAdminAndStart();
}
