<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { applyGlobalBackground } from "../globalState";
import { useRouter } from "vue-router";
import { triggerAdminTrackingCheck } from "../utils/adminLocationService";
import {
    sfxSuccess,
    sfxError,
    sfxNavigate,
    sfxModalOpen,
    sfxModalClose,
} from "../sounds";

import AdminLoginScreen from "../components/admin/AdminLoginScreen.vue";
import UsersTab from "../components/admin/UsersTab.vue";
import TripsTab from "../components/admin/TripsTab.vue";
import AchievementsTab from "../components/admin/AchievementsTab.vue";
import AssignmentsTab from "../components/admin/AssignmentsTab.vue";
import BackgroundsTab from "../components/admin/BackgroundsTab.vue";
import MusicTab from "../components/admin/MusicTab.vue";
import RequestsTab from "../components/admin/RequestsTab.vue";
import DatabaseTab from "../components/admin/DatabaseTab.vue";

const router = useRouter();

// Auth and API variables
import { API_URL } from "../utils/api";
const token = ref(localStorage.getItem("token") || "");
const isAuthenticated = ref(false);
const isAdmin = ref(false);
const currentUser = ref(null);

// Display properties and context menu
const selectedBgType = ref(localStorage.getItem("app-background") || "bliss");
const selectedCustomBgUrl = ref(
    localStorage.getItem("app-background-custom") || "",
);
const previewBackgroundStyle = ref("");
const showContextMenu = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });

function openDisplayProperties() {
    const currentBg = localStorage.getItem("app-background") || "bliss";
    const customUrl = localStorage.getItem("app-background-custom") || "";
    selectedBgType.value = currentBg;
    selectedCustomBgUrl.value = customUrl;
    updatePreview();
    activeModal.value = "display-properties";
}

import { defaultBackgrounds } from "../utils/backgrounds";

function updatePreview() {
    let styleVal = "";
    if (defaultBackgrounds[selectedBgType.value]) {
        styleVal = `url('${defaultBackgrounds[selectedBgType.value]}')`;
    } else if (selectedBgType.value === "stripes") {
        styleVal =
            "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
    } else if (selectedBgType.value === "custom") {
        styleVal = selectedCustomBgUrl.value
            ? `url('${selectedCustomBgUrl.value}')`
            : "#999";
    }
    previewBackgroundStyle.value = styleVal;
}

function applyAndSaveBg() {
    localStorage.setItem("app-background", selectedBgType.value);
    if (selectedBgType.value === "custom") {
        localStorage.setItem(
            "app-background-custom",
            selectedCustomBgUrl.value,
        );
    }
    applyGlobalBackground(selectedBgType.value, selectedCustomBgUrl.value);
    window.dispatchEvent(new Event("storage"));
}

function applySaveAndCloseBg() {
    applyAndSaveBg();
    activeModal.value = null;
}

function handleRightClick(event) {
    if (
        event.target.classList.contains("xp-desktop-layout") ||
        event.target.classList.contains("xp-main-panel") ||
        event.target.tagName === "MAIN" ||
        event.target.classList.contains("xp-wrapper")
    ) {
        event.preventDefault();
        contextMenuPos.value = { x: event.clientX, y: event.clientY };
        showContextMenu.value = true;
    } else {
        showContextMenu.value = false;
    }
}

function closeContextMenu() {
    showContextMenu.value = false;
}

function handleStorageChange() {
    const currentBg = localStorage.getItem("app-background") || "bliss";
    const customUrl = localStorage.getItem("app-background-custom") || "";
    applyGlobalBackground(currentBg, customUrl);
}

// Auth Form
const loginForm = ref({ username: "", password: "" });
const loginError = ref("");
const isCheckingAuth = ref(true);

// Navigation
const activeTab = ref("users"); // 'users', 'trips', 'achievements', 'assignments', 'backgrounds', 'music', 'requests'

// CRUD Data State
const users = ref([]);
const trips = ref([]);
const achievements = ref([]);
const userAchievements = ref([]); // for listing and revoking
const backgrounds = ref([]);
const userRequests = ref([]);

// Music state
const musicTracks = ref([]);
const musicForm = ref({
    title: "",
    audioUrl: "",
    coverUrl: "",
});
const musicUploadProgress = ref({
    audioName: "",
    coverName: "",
    isUploadingAudio: false,
    isUploadingCover: false,
});

// UI state
const searchQueries = ref({
    users: "",
    trips: "",
    achievements: "",
    backgrounds: "",
});

// Toasts
const toasts = ref([]);
let toastId = 0;
function showToast(msg, type = "success") {
    const id = ++toastId;
    toasts.value.push({ id, msg, type });
    if (type === "error") sfxError();
    else sfxSuccess();
    setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 4000);
}

// Modal State
const activeModal = ref(null); // 'user', 'trip', 'achievement', 'address', 'comment', 'waypoint', 'media', 'background'
const modalMode = ref("create"); // 'create', 'update'
const modalTargetId = ref(null); // ID of entity being edited
const parentTargetId = ref(null); // Parent ID (e.g. userId for address)

// Modal Forms
const userForm = ref({
    username: "",
    email: "",
    role: "driver",
    tripsCount: 0,
    password: "",
    avatarUrl: "",
    bannerUrl: "",
});
const tripForm = ref({
    userId: "",
    distanceKm: 0,
    durationMin: 0,
    avgSpeed: 0,
    name: "",
    startLocation: "",
    endLocation: "",
    passengerCount: 1,
    pointsGenerated: 0,
    createdAt: "",
    passengerIds: [],
    waypoints: [],
});

function addFormWaypoint() {
    tripForm.value.waypoints.push("");
}

function removeFormWaypoint(index) {
    tripForm.value.waypoints.splice(index, 1);
    calculateRouteAutomatically();
}
const achievementForm = ref({
    key: "",
    title: "",
    description: "",
    emoji: "🏆",
    glowColor: "cyan",
});
const addressForm = ref({ street: "", city: "", state: "", postalCode: "" });
const commentForm = ref({ authorName: "", content: "" });
const waypointForm = ref({ address: "", order: 1 });
const mediaForm = ref({ type: "text", content: "" });
const assignmentForm = ref({ userId: "", achievementId: "" });

// Computed: filter the userAchievements table by the selected user in the assignment form
const filteredUserAchievements = computed(() => {
    if (!assignmentForm.value.userId) return userAchievements.value;
    const uid = parseInt(assignmentForm.value.userId, 10);
    return userAchievements.value.filter((ua) => ua.userId === uid);
});

const isAdvancedMode = ref(false);
const isRouting = ref(false);
const routingError = ref("");
const activeSuggestions = ref({ field: null, index: null, list: [] });
let searchTimeout = null;

import {
    geocodeAddress as geocodeAddressAdmin,
    fetchOSRMRoute as fetchRouteShared,
} from "../utils/routing";

async function fetchOSRMRouteAdmin(coordsList) {
    const data = await fetchRouteShared(coordsList, false);
    if (data) {
        return {
            routeCoords: data.routeCoords,
            etaMinutes: data.etaMinutes,
            routeDistanceKm: data.routeDistanceKm,
        };
    }
    return null;
}

function handleAddressInput(query, field, index = null) {
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (!query || query.trim().length < 3) {
        activeSuggestions.value = { field: null, index: null, list: [] };
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'CommuteQuestDashboard/1.0'
                }
            });
            if (!res.ok) throw new Error('Nominatim suggestions fetch failed');
            const data = await res.json();
            activeSuggestions.value = {
                field,
                index,
                list: data.map(item => ({
                    display_name: item.display_name,
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon)
                }))
            };
        } catch (err) {
            console.error('Error fetching suggestions:', err);
        }
    }, 400);
}

function selectSuggestion(item) {
    if (activeSuggestions.value.field === 'startLocation') {
        tripForm.value.startLocation = item.display_name;
        tripForm.value.startLat = item.lat;
        tripForm.value.startLon = item.lon;
    } else if (activeSuggestions.value.field === 'endLocation') {
        tripForm.value.endLocation = item.display_name;
        tripForm.value.endLat = item.lat;
        tripForm.value.endLon = item.lon;
    } else if (activeSuggestions.value.field === 'waypoint') {
        const idx = activeSuggestions.value.index;
        tripForm.value.waypoints[idx] = item.display_name;
    }
    activeSuggestions.value = { field: null, index: null, list: [] };
    calculateRouteAutomatically();
}

async function calculateRouteAutomatically() {
    if (isAdvancedMode.value) return;

    const start = tripForm.value.startLocation.trim();
    const end = tripForm.value.endLocation.trim();
    if (!start || !end) {
        routingError.value = "";
        return;
    }

    isRouting.value = true;
    routingError.value = "";

    try {
        // 1. Geocode Start Location
        const startCoords = await geocodeAddressAdmin(start);
        if (!startCoords) {
            throw new Error(
                `Não foi possível localizar o ponto de partida: "${start}"`,
            );
        }

        // 2. Geocode Waypoints
        const wpCoordsList = [];
        for (let i = 0; i < tripForm.value.waypoints.length; i++) {
            const wpAddr = tripForm.value.waypoints[i].trim();
            if (wpAddr) {
                const wpCoords = await geocodeAddressAdmin(wpAddr);
                if (!wpCoords) {
                    throw new Error(
                        `Não foi possível localizar a parada ${i + 1}: "${wpAddr}"`,
                    );
                }
                wpCoordsList.push(wpCoords);
            }
        }

        // 3. Geocode End Location
        const endCoords = await geocodeAddressAdmin(end);
        if (!endCoords) {
            throw new Error(
                `Não foi possível localizar o ponto de destino: "${end}"`,
            );
        }

        // 4. Combine all coordinates
        const allCoords = [
            [startCoords.lat, startCoords.lon],
            ...wpCoordsList.map((c) => [c.lat, c.lon]),
            [endCoords.lat, endCoords.lon],
        ];

        // 5. Query OSRM
        const routeResult = await fetchOSRMRouteAdmin(allCoords);
        if (routeResult) {
            tripForm.value.distanceKm = routeResult.routeDistanceKm;
            tripForm.value.durationMin = routeResult.etaMinutes;
            tripForm.value.avgSpeed =
                Number(
                    (
                        routeResult.routeDistanceKm /
                        (routeResult.etaMinutes / 60)
                    ).toFixed(1),
                ) || 40.0;
            tripForm.value.pointsGenerated =
                Math.round(routeResult.routeDistanceKm * 1000) +
                routeResult.etaMinutes * 60;

            // Store coordinates for saving
            tripForm.value.startLat = startCoords.lat;
            tripForm.value.startLon = startCoords.lon;
            tripForm.value.endLat = endCoords.lat;
            tripForm.value.endLon = endCoords.lon;
            tripForm.value.routeCoords = JSON.stringify(
                routeResult.routeCoords,
            );
        } else {
            throw new Error("Falha ao calcular rota via OSRM");
        }
    } catch (err) {
        console.error(err);
        routingError.value = err.message;
    } finally {
        isRouting.value = false;
    }
}

// Auto-calculate points when distance/duration change in trip form
watch(
    () => [tripForm.value.distanceKm, tripForm.value.durationMin],
    ([dist, dur]) => {
        if (activeModal.value === "trip") {
            const d = parseFloat(dist) || 0;
            const m = parseInt(dur, 10) || 0;
            tripForm.value.pointsGenerated = Math.round(d * 1000) + m * 60;
        }
    },
);
const backgroundForm = ref({ key: "", title: "", url: "" });
const bgUploading = ref(false);

const activeMenu = ref(null);

function toggleMenu(menu) {
    activeMenu.value = activeMenu.value === menu ? null : menu;
}

function closeMenus(event) {
    if (!event.target.closest('.xp-menubar')) {
        activeMenu.value = null;
    }
}

// Quick Add / Actions
function quickAdd(type) {
    activeMenu.value = null;
    if (type === 'music') {
        activeTab.value = 'music';
        showToast("Selecione os arquivos abaixo para adicionar uma nova música.");
    } else if (type === 'wallpaper') {
        activeTab.value = 'backgrounds';
        openBackgroundModal('create');
    } else if (type === 'trip') {
        activeTab.value = 'trips';
        openTripModal('create');
    } else if (type === 'user') {
        activeTab.value = 'users';
        openUserModal('create');
    }
}

async function quickExport() {
    activeMenu.value = null;
    try {
        showToast("Iniciando exportação do banco de dados...");
        const res = await fetch(`${API_URL}/api/admin/db/export`, {
            headers: {
                'Authorization': `Bearer ${token.value}`
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
        showToast("Banco de dados exportado com sucesso!");
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Tracks the last active/selected items for editing
const lastSelectedUser = ref(null);
const lastSelectedTrip = ref(null);
const lastSelectedAchievement = ref(null);
const lastSelectedBackground = ref(null);

// Watch lists to populate default lastSelected items when loaded
watch(users, (newUsers) => {
    if (newUsers && newUsers.length > 0 && !lastSelectedUser.value) {
        lastSelectedUser.value = newUsers[0];
    }
});
watch(trips, (newTrips) => {
    if (newTrips && newTrips.length > 0 && !lastSelectedTrip.value) {
        lastSelectedTrip.value = newTrips[0];
    }
});
watch(achievements, (newAchs) => {
    if (newAchs && newAchs.length > 0 && !lastSelectedAchievement.value) {
        lastSelectedAchievement.value = newAchs[0];
    }
});
watch(backgrounds, (newBgs) => {
    if (newBgs && newBgs.length > 0 && !lastSelectedBackground.value) {
        lastSelectedBackground.value = newBgs[0];
    }
});

function quickEdit(type) {
    activeMenu.value = null;
    if (type === 'user') {
        if (!lastSelectedUser.value) {
            showToast("Nenhum usuário disponível para editar.", "error");
            return;
        }
        activeTab.value = 'users';
        openUserModal('update', lastSelectedUser.value);
    } else if (type === 'trip') {
        if (!lastSelectedTrip.value) {
            showToast("Nenhuma corrida disponível para editar.", "error");
            return;
        }
        activeTab.value = 'trips';
        openTripModal('update', lastSelectedTrip.value);
    } else if (type === 'achievement') {
        if (!lastSelectedAchievement.value) {
            showToast("Nenhuma conquista disponível para editar.", "error");
            return;
        }
        activeTab.value = 'achievements';
        openAchievementModal('update', lastSelectedAchievement.value);
    } else if (type === 'background') {
        if (!lastSelectedBackground.value) {
            showToast("Nenhum wallpaper disponível para editar.", "error");
            return;
        }
        activeTab.value = 'backgrounds';
        openBackgroundModal('update', lastSelectedBackground.value);
    }
}

// Expanded rows
const expandedUsers = ref(new Set());
const expandedTrips = ref(new Set());

// --- API Helpers ---
async function apiFetch(endpoint, options = {}) {
    const headers = { ...options.headers };
    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    if (token.value) headers["Authorization"] = `Bearer ${token.value}`;
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

async function verifyAccess() {
    isCheckingAuth.value = true;
    if (!token.value) {
        isAuthenticated.value = false;
        isAdmin.value = false;
        isCheckingAuth.value = false;
        return;
    }

    try {
        const me = await apiFetch("/api/me");
        currentUser.value = me;
        isAuthenticated.value = true;
        if (me.role === "admin") {
            isAdmin.value = true;
            await loadAllData();
        } else {
            isAdmin.value = false;
            showToast("Acesso negado: Apenas administradores.", "error");
        }
    } catch (err) {
        console.error(err);
        isAuthenticated.value = false;
        isAdmin.value = false;
        token.value = "";
        localStorage.removeItem("token");
    } finally {
        isCheckingAuth.value = false;
        triggerAdminTrackingCheck();
    }
}

async function handleLogin() {
    try {
        loginError.value = "";
        const data = await apiFetch("/api/login", {
            method: "POST",
            body: JSON.stringify(loginForm.value),
        });
        token.value = data.token;
        localStorage.setItem("token", data.token);
        showToast("Login efetuado com sucesso!");
        await verifyAccess();
    } catch (err) {
        loginError.value = err.message || "Erro na autenticação";
        showToast(loginError.value, "error");
    }
}

function handleLogout() {
    token.value = "";
    localStorage.removeItem("token");
    isAuthenticated.value = false;
    isAdmin.value = false;
    currentUser.value = null;
    triggerAdminTrackingCheck();
    router.push("/");
}

// --- Data Loading ---
async function loadAllData() {
    if (!isAdmin.value) return;
    try {
        await Promise.all([
            loadUsers(),
            loadTrips(),
            loadAchievements(),
            loadBackgrounds(),
            loadMusicTracks(),
            loadUserRequests(),
        ]);
        // loadUserAchievements depends on users.value being populated, so run after
        await loadUserAchievements();
    } catch (err) {
        showToast("Erro ao carregar dados do banco: " + err.message, "error");
    }
}

async function loadUsers() {
    users.value = await apiFetch("/api/admin/users");
}

async function loadTrips() {
    trips.value = await apiFetch("/api/admin/trips");
}

async function loadAchievements() {
    achievements.value = await apiFetch("/api/admin/achievements");
}

async function loadBackgrounds() {
    backgrounds.value = await apiFetch("/api/admin/backgrounds");
}

async function loadMusicTracks() {
    musicTracks.value = await apiFetch("/api/admin/music");
}

async function loadUserRequests() {
    userRequests.value = await apiFetch("/api/admin/requests");
}

async function processRequest(requestId, action) {
    try {
        const data = await apiFetch(`/api/admin/requests/${requestId}/action`, {
            method: "POST",
            body: JSON.stringify({ action }),
        });
        if (data.error) {
            showToast("Erro ao processar solicitação: " + data.error, "error");
        } else {
            showToast(`Solicitação ${action === "approve" ? "aprovada" : "rejeitada"} com sucesso!`);
            await loadAllData();
        }
    } catch (err) {
        showToast("Erro ao processar solicitação: " + err.message, "error");
    }
}

async function loadUserAchievements() {
    const list = [];
    users.value.forEach((u) => {
        if (u.achievements) {
            u.achievements.forEach((ua) => {
                list.push({
                    userId: u.id,
                    username: u.username,
                    achievementId: ua.achievementId,
                    title: ua.achievement.title,
                    emoji: ua.achievement.emoji,
                    unlockedAt: ua.unlockedAt,
                });
            });
        }
    });
    userAchievements.value = list;
}

// --- CRUD Operations ---

// Users
function openUserModal(mode, user = null) {
    modalMode.value = mode;
    activeModal.value = "user";
    if (mode === "create") {
        userForm.value = {
            username: "",
            email: "",
            role: "driver",
            tripsCount: 0,
            password: "",
            avatarUrl: "",
            bannerUrl: "",
        };
    } else if (mode === "update" && user) {
        lastSelectedUser.value = user;
        modalTargetId.value = user.id;
        userForm.value = {
            username: user.username,
            email: user.email || "",
            role: user.role,
            tripsCount: user.tripsCount || 0,
            avatarUrl: user.avatarUrl || "",
            bannerUrl: user.bannerUrl || "",
            password: "",
        };
    }
}

async function submitUser() {
    try {
        if (modalMode.value === "create") {
            await apiFetch("/api/admin/users", {
                method: "POST",
                body: JSON.stringify(userForm.value),
            });
            showToast("Usuário criado com sucesso!");
        } else {
            const payload = { ...userForm.value };
            if (!payload.password) delete payload.password;
            await apiFetch(`/api/admin/users/${modalTargetId.value}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            showToast("Usuário atualizado com sucesso!");
        }
        activeModal.value = null;
        await loadUsers();
        await loadUserAchievements();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteUser(id) {
    if (
        !confirm(
            "Tem certeza de que deseja excluir este usuário? Todos os dados vinculados serão removidos.",
        )
    )
        return;
    try {
        await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
        showToast("Usuário removido com sucesso!");
        await loadUsers();
        await loadUserAchievements();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Addresses inside User Details
function openAddressModal(userId) {
    parentTargetId.value = userId;
    activeModal.value = "address";
    addressForm.value = { street: "", city: "", state: "", postalCode: "" };
}

async function submitAddress() {
    try {
        await apiFetch(`/api/admin/users/${parentTargetId.value}/addresses`, {
            method: "POST",
            body: JSON.stringify(addressForm.value),
        });
        showToast("Endereço adicionado com sucesso!");
        activeModal.value = null;
        await loadUsers();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteAddress(addressId) {
    if (!confirm("Deseja excluir este endereço?")) return;
    try {
        await apiFetch(`/api/admin/addresses/${addressId}`, {
            method: "DELETE",
        });
        showToast("Endereço removido!");
        await loadUsers();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Comments inside User Details
function openCommentModal(userId) {
    parentTargetId.value = userId;
    activeModal.value = "comment";
    commentForm.value = {
        authorName: currentUser.value?.username || "admin",
        content: "",
    };
}

async function submitComment() {
    try {
        await apiFetch(`/api/admin/users/${parentTargetId.value}/comments`, {
            method: "POST",
            body: JSON.stringify(commentForm.value),
        });
        showToast("Comentário adicionado!");
        activeModal.value = null;
        await loadUsers();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteComment(commentId) {
    if (!confirm("Deseja excluir este comentário?")) return;
    try {
        await apiFetch(`/api/admin/comments/${commentId}`, {
            method: "DELETE",
        });
        showToast("Comentário removido!");
        await loadUsers();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Trips
function openTripModal(mode, trip = null) {
    modalMode.value = mode;
    activeModal.value = "trip";
    routingError.value = "";
    isRouting.value = false;
    activeSuggestions.value = { field: null, index: null, list: [] };
    if (mode === "create") {
        isAdvancedMode.value = false;
        tripForm.value = {
            userId: users.value[0]?.id || "",
            distanceKm: 1.0,
            durationMin: 5,
            avgSpeed: 40.0,
            name: "",
            startLocation: "",
            endLocation: "",
            passengerCount: 1,
            pointsGenerated: 10,
            createdAt: new Date(
                Date.now() - new Date().getTimezoneOffset() * 60000,
            )
                .toISOString()
                .slice(0, 16),
            passengerIds: [],
            waypoints: [],
            achievementIds: [],
            startLat: null,
            startLon: null,
            endLat: null,
            endLon: null,
            routeCoords: null,
        };
    } else if (mode === "update" && trip) {
        lastSelectedTrip.value = trip;
        isAdvancedMode.value = true;
        modalTargetId.value = trip.id;

        const localIsoDate = trip.createdAt
            ? new Date(
                  new Date(trip.createdAt).getTime() -
                      new Date().getTimezoneOffset() * 60000,
              )
                  .toISOString()
                  .slice(0, 16)
            : new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);

        const pIds = trip.media
            ? trip.media
                  .filter((m) => m.type === "passenger")
                  .map(
                      (m) =>
                          users.value.find((u) => u.username === m.content)?.id,
                  )
                  .filter(Boolean)
            : [];

        const achIds = trip.media
            ? trip.media
                  .filter((m) => m.type === "achievement")
                  .map((m) => parseInt(m.content, 10))
                  .filter(Boolean)
            : [];

        const wpts = trip.waypoints
            ? [...trip.waypoints]
                  .sort((a, b) => a.order - b.order)
                  .map((w) => w.address)
            : [];

        tripForm.value = {
            userId: trip.userId,
            distanceKm: trip.distanceKm,
            durationMin: trip.durationMin,
            avgSpeed: trip.avgSpeed || 0,
            name: trip.name || "",
            startLocation: trip.startLocation || "",
            endLocation: trip.endLocation || "",
            passengerCount: trip.passengerCount,
            pointsGenerated: trip.pointsGenerated,
            createdAt: localIsoDate,
            passengerIds: pIds,
            waypoints: wpts,
            achievementIds: achIds,
            startLat: trip.startLat || null,
            startLon: trip.startLon || null,
            endLat: trip.endLat || null,
            endLon: trip.endLon || null,
            routeCoords:
                typeof trip.routeCoords === "string"
                    ? trip.routeCoords
                    : JSON.stringify(trip.routeCoords || null),
        };
    }
}

async function submitTrip() {
    try {
        const payload = { ...tripForm.value };
        payload.userId = parseInt(payload.userId, 10);
        payload.distanceKm = parseFloat(payload.distanceKm);
        payload.durationMin = parseInt(payload.durationMin, 10);
        payload.avgSpeed = payload.avgSpeed
            ? parseFloat(payload.avgSpeed)
            : null;
        payload.passengerIds = tripForm.value.passengerIds.map((id) =>
            parseInt(id, 10),
        );
        payload.achievementIds = (tripForm.value.achievementIds || []).map((id) =>
            parseInt(id, 10),
        );
        payload.passengerCount = payload.passengerIds.length || 1;
        payload.pointsGenerated = parseInt(payload.pointsGenerated, 10);
        payload.waypoints = tripForm.value.waypoints.filter(
            (w) => w.trim() !== "",
        );
        payload.createdAt = tripForm.value.createdAt
            ? new Date(tripForm.value.createdAt).toISOString()
            : new Date().toISOString();

        if (modalMode.value === "create") {
            await apiFetch("/api/admin/trips", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            showToast("Corrida registrada com sucesso!");
        } else {
            await apiFetch(`/api/admin/trips/${modalTargetId.value}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            showToast("Corrida atualizada!");
        }
        activeModal.value = null;
        await loadTrips();
        await loadUsers();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteTrip(id) {
    if (!confirm("Deseja excluir esta corrida?")) return;
    try {
        await apiFetch(`/api/admin/trips/${id}`, { method: "DELETE" });
        showToast("Corrida removida!");
        await loadTrips();
        await loadUsers();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Waypoints inside Trip Details
function openWaypointModal(tripId) {
    parentTargetId.value = tripId;
    activeModal.value = "waypoint";
    const trip = trips.value.find((t) => t.id === tripId);
    const nextOrder = (trip?.waypoints?.length || 0) + 1;
    waypointForm.value = { address: "", order: nextOrder };
}

async function submitWaypoint() {
    try {
        await apiFetch(`/api/admin/trips/${parentTargetId.value}/waypoints`, {
            method: "POST",
            body: JSON.stringify(waypointForm.value),
        });
        showToast("Parada adicionada!");
        activeModal.value = null;
        await loadTrips();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteWaypoint(waypointId) {
    if (!confirm("Deseja remover esta parada?")) return;
    try {
        await apiFetch(`/api/admin/waypoints/${waypointId}`, {
            method: "DELETE",
        });
        showToast("Parada removida!");
        await loadTrips();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Media inside Trip Details
function openMediaModal(tripId) {
    parentTargetId.value = tripId;
    activeModal.value = "media";
    mediaForm.value = { type: "text", content: "" };
}

async function submitMedia() {
    try {
        await apiFetch(`/api/admin/trips/${parentTargetId.value}/medias`, {
            method: "POST",
            body: JSON.stringify(mediaForm.value),
        });
        showToast("Mídia adicionada!");
        activeModal.value = null;
        await loadTrips();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteMedia(mediaId) {
    if (!confirm("Deseja remover esta mídia?")) return;
    try {
        await apiFetch(`/api/admin/medias/${mediaId}`, { method: "DELETE" });
        showToast("Mídia removida!");
        await loadTrips();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Achievements
function openAchievementModal(mode, ach = null) {
    modalMode.value = mode;
    activeModal.value = "achievement";
    if (mode === "create") {
        achievementForm.value = {
            key: "",
            title: "",
            description: "",
            emoji: "🏆",
            glowColor: "cyan",
        };
    } else if (mode === "update" && ach) {
        lastSelectedAchievement.value = ach;
        modalTargetId.value = ach.id;
        achievementForm.value = {
            key: ach.key,
            title: ach.title,
            description: ach.description,
            emoji: ach.emoji,
            glowColor: ach.glowColor || "cyan",
        };
    }
}

async function submitAchievement() {
    try {
        if (modalMode.value === "create") {
            await apiFetch("/api/admin/achievements", {
                method: "POST",
                body: JSON.stringify(achievementForm.value),
            });
            showToast("Conquista criada!");
        } else {
            await apiFetch(`/api/admin/achievements/${modalTargetId.value}`, {
                method: "PUT",
                body: JSON.stringify(achievementForm.value),
            });
            showToast("Conquista atualizada!");
        }
        activeModal.value = null;
        await loadAchievements();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteAchievement(id) {
    if (!confirm("Deseja excluir esta conquista permanentemente?")) return;
    try {
        await apiFetch(`/api/admin/achievements/${id}`, { method: "DELETE" });
        showToast("Conquista excluída!");
        await loadAchievements();
        await loadUsers();
        await loadUserAchievements();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Backgrounds
function openBackgroundModal(mode, bg = null) {
    modalMode.value = mode;
    activeModal.value = "background";
    if (mode === "create") {
        backgroundForm.value = { key: "", title: "", url: "" };
    } else if (mode === "update" && bg) {
        lastSelectedBackground.value = bg;
        modalTargetId.value = bg.id;
        backgroundForm.value = {
            key: bg.key,
            title: bg.title,
            url: bg.url,
        };
    }
}

async function handleBgUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    bgUploading.value = true;
    try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_URL}/api/upload`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token.value}`,
            },
            body: formData,
        });

        if (!res.ok) throw new Error("Falha no upload da imagem de fundo");
        const data = await res.json();
        backgroundForm.value.url = `${API_URL}${data.fileUrl}`;
        showToast("Imagem de fundo enviada com sucesso!");
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        bgUploading.value = false;
    }
}

async function submitBackground() {
    try {
        if (modalMode.value === "create") {
            await apiFetch("/api/admin/backgrounds", {
                method: "POST",
                body: JSON.stringify(backgroundForm.value),
            });
            showToast("Imagem de fundo adicionada!");
        } else {
            await apiFetch(`/api/admin/backgrounds/${modalTargetId.value}`, {
                method: "PUT",
                body: JSON.stringify(backgroundForm.value),
            });
            showToast("Imagem de fundo atualizada!");
        }
        activeModal.value = null;
        await loadBackgrounds();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteBackground(id) {
    if (!confirm("Deseja excluir esta imagem de fundo?")) return;
    try {
        await apiFetch(`/api/admin/backgrounds/${id}`, { method: "DELETE" });
        showToast("Imagem de fundo excluída!");
        await loadBackgrounds();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// --- Music Manager CRUD ---
async function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const isAudio = type === "audio";
    if (isAudio) {
        musicUploadProgress.value.audioName = file.name;
        musicUploadProgress.value.isUploadingAudio = true;
    } else {
        musicUploadProgress.value.coverName = file.name;
        musicUploadProgress.value.isUploadingCover = true;
    }

    try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_URL}/api/upload`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token.value}`,
            },
            body: formData,
        });

        if (!res.ok)
            throw new Error(
                `Falha no upload ${isAudio ? "do áudio" : "da capa"}`,
            );
        const data = await res.json();
        if (isAudio) {
            musicForm.value.audioUrl = data.fileUrl;
            showToast("Arquivo de áudio enviado com sucesso!");
        } else {
            musicForm.value.coverUrl = data.fileUrl;
            showToast("Imagem de capa enviada com sucesso!");
        }
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        if (isAudio) {
            musicUploadProgress.value.isUploadingAudio = false;
        } else {
            musicUploadProgress.value.isUploadingCover = false;
        }
    }
}

async function handleAudioUpload(event) {
    await handleFileUpload(event, "audio");
}

async function handleCoverUpload(event) {
    await handleFileUpload(event, "cover");
}

async function createMusicTrack() {
    if (!musicForm.value.title || !musicForm.value.audioUrl) {
        showToast("Título e arquivo de áudio são obrigatórios", "error");
        return;
    }

    try {
        await apiFetch("/api/admin/music", {
            method: "POST",
            body: JSON.stringify(musicForm.value),
        });

        showToast("Música adicionada!");

        // Clear form
        musicForm.value = { title: "", audioUrl: "", coverUrl: "" };
        musicUploadProgress.value = {
            audioName: "",
            coverName: "",
            isUploadingAudio: false,
            isUploadingCover: false,
        };

        // Reset file input elements
        const audioInput = document.getElementById("music-audio-input");
        if (audioInput) audioInput.value = "";
        const coverInput = document.getElementById("music-cover-input");
        if (coverInput) coverInput.value = "";

        await loadMusicTracks();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function activateMusicTrack(id) {
    try {
        await apiFetch(`/api/admin/music/${id}/activate`, { method: "PUT" });
        showToast("Música definida como ativa!");
        await loadMusicTracks();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteMusicTrack(id) {
    if (!confirm("Deseja realmente excluir esta música?")) return;
    try {
        await apiFetch(`/api/admin/music/${id}`, { method: "DELETE" });
        showToast("Música excluída com sucesso!");
        await loadMusicTracks();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Deliver Achievement to User
async function assignAchievement() {
    if (!assignmentForm.value.userId || !assignmentForm.value.achievementId) {
        showToast("Selecione o usuário e a conquista", "error");
        return;
    }
    try {
        await apiFetch("/api/admin/user-achievements", {
            method: "POST",
            body: JSON.stringify({
                userId: parseInt(assignmentForm.value.userId, 10),
                achievementId: parseInt(assignmentForm.value.achievementId, 10),
            }),
        });
        showToast("Conquista entregue com sucesso!");
        assignmentForm.value = { userId: "", achievementId: "" };
        await loadUsers();
        await loadUserAchievements();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function revokeAchievement(userId, achievementId) {
    if (!confirm("Deseja revogar esta conquista deste usuário?")) return;
    try {
        await apiFetch(
            `/api/admin/user-achievements/${userId}/${achievementId}`,
            {
                method: "DELETE",
            },
        );
        showToast("Conquista revogada!");
        await loadUsers();
        await loadUserAchievements();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Expanding row actions
function toggleUserExpand(userId) {
    if (expandedUsers.value.has(userId)) {
        expandedUsers.value.delete(userId);
    } else {
        expandedUsers.value.add(userId);
    }
}

function toggleTripExpand(tripId) {
    if (expandedTrips.value.has(tripId)) {
        expandedTrips.value.delete(tripId);
    } else {
        expandedTrips.value.add(tripId);
    }
}

onMounted(async () => {
    await verifyAccess();
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("click", closeMenus);
    applyGlobalBackground(selectedBgType.value, selectedCustomBgUrl.value);
});

onUnmounted(() => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener("click", closeContextMenu);
    window.removeEventListener("click", closeMenus);
});

// SFX: play navigate sound when switching tabs
watch(activeTab, () => {
    sfxNavigate();
});

// SFX: play modal open/close sounds
watch(activeModal, (newVal, oldVal) => {
    if (newVal && !oldVal) sfxModalOpen();
    else if (!newVal && oldVal) sfxModalClose();
});
</script>

<template>
    <div class="xp-wrapper" @contextmenu="handleRightClick">
        <!-- Spinner Check -->
        <div
            v-if="isCheckingAuth"
            class="xp-dialog center-dialog loader-dialog"
        >
            <div class="xp-spinner"></div>
            <p style="margin-top: 10px; font-weight: bold">
                Carregando o sistema...
            </p>
        </div>

        <!-- Login Form (if not logged in) -->
        <div
            v-else-if="!isAuthenticated"
            class="animate-scale-up"
            style="margin: auto"
        >
            <AdminLoginScreen
                :loginForm="loginForm"
                :loginError="loginError"
                @update:username="loginForm.username = $event"
                @update:password="loginForm.password = $event"
                @submit="handleLogin"
            />
        </div>

        <!-- Main Panel (if logged in and admin) -->
        <div v-else-if="isAdmin" class="xp-desktop-layout animate-fade-in">
            <div class="xp-window main-window">
                <!-- Menu bar -->
                <div class="xp-menubar" style="display: flex; gap: 15px; position: relative;">
                    <!-- Arquivo -->
                    <div style="position: relative;">
                        <span @click.stop="toggleMenu('file')" style="cursor: pointer; padding: 2px 6px; border-radius: 3px; display: inline-block;" :style="activeMenu === 'file' ? { background: '#316ac5', color: '#fff' } : {}">Arquivo</span>
                        <div v-if="activeMenu === 'file'" class="xp-context-menu animate-scale-up" style="position: absolute; top: 100%; left: 0; width: 190px; margin-top: 2px; box-shadow: 2px 2px 5px rgba(0,0,0,0.3);">
                            <div @click="quickAdd('music')" class="context-item">
                                <span>🎵 Adicionar Música</span>
                            </div>
                            <div @click="quickAdd('wallpaper')" class="context-item">
                                <span>🖼️ Adicionar Wallpaper</span>
                            </div>
                            <div @click="quickAdd('trip')" class="context-item">
                                <span>🚗 Adicionar Corrida</span>
                            </div>
                            <div @click="quickAdd('user')" class="context-item">
                                <span>👤 Adicionar Usuário</span>
                            </div>
                            <div style="height: 1px; background: #d4d0c8; margin: 4px 0;"></div>
                            <div @click="quickExport" class="context-item">
                                <span>📥 Exportar Banco (.db)</span>
                            </div>
                        </div>
                    </div>

                    <!-- Editar -->
                    <div style="position: relative;">
                        <span @click.stop="toggleMenu('edit')" style="cursor: pointer; padding: 2px 6px; border-radius: 3px; display: inline-block;" :style="activeMenu === 'edit' ? { background: '#316ac5', color: '#fff' } : {}">Editar</span>
                        <div v-if="activeMenu === 'edit'" class="xp-context-menu animate-scale-up" style="position: absolute; top: 100%; left: 0; width: 220px; margin-top: 2px; box-shadow: 2px 2px 5px rgba(0,0,0,0.3);">
                            <div @click="quickEdit('user')" class="context-item" :style="!lastSelectedUser ? { color: '#888', cursor: 'not-allowed' } : {}">
                                <span>👤 Editar Último Usuário</span>
                                <span style="font-size: 9px; color: #666;" v-if="lastSelectedUser">({{ lastSelectedUser.username }})</span>
                            </div>
                            <div @click="quickEdit('trip')" class="context-item" :style="!lastSelectedTrip ? { color: '#888', cursor: 'not-allowed' } : {}">
                                <span>🚗 Editar Última Corrida</span>
                                <span style="font-size: 9px; color: #666;" v-if="lastSelectedTrip">(#{{ lastSelectedTrip.id }})</span>
                            </div>
                            <div @click="quickEdit('achievement')" class="context-item" :style="!lastSelectedAchievement ? { color: '#888', cursor: 'not-allowed' } : {}">
                                <span>🏆 Editar Última Conquista</span>
                                <span style="font-size: 9px; color: #666;" v-if="lastSelectedAchievement">({{ lastSelectedAchievement.title }})</span>
                            </div>
                            <div @click="quickEdit('background')" class="context-item" :style="!lastSelectedBackground ? { color: '#888', cursor: 'not-allowed' } : {}">
                                <span>🖼️ Editar Último Wallpaper</span>
                                <span style="font-size: 9px; color: #666;" v-if="lastSelectedBackground">({{ lastSelectedBackground.title }})</span>
                            </div>
                        </div>
                    </div>

                    <span @click="openDisplayProperties" style="cursor: pointer; padding: 2px 6px; border-radius: 3px;"
                        >Exibir</span
                    >
                    <span style="cursor: pointer; padding: 2px 6px; border-radius: 3px;" @click="showToast('Adicionado aos favoritos de controle!')">Favoritos</span>
                    <span @click="openDisplayProperties" style="cursor: pointer; padding: 2px 6px; border-radius: 3px;"
                        >Ferramentas</span
                    >
                    <span style="cursor: pointer; padding: 2px 6px; border-radius: 3px;" @click="showToast('Sistema Admin CMS Retro v1.0 - Use o painel para gerenciar o BD.')">Ajuda</span>
                </div>

                <div class="xp-window-body">
                    <div class="admin-content-layout">
                        <!-- Sidebar Navigation (Windows XP Common Tasks Style) -->
                        <aside class="xp-sidebar">
                            <div class="xp-sidebar-panel">
                                <header class="panel-header">
                                    <span>Tarefas de Banco</span>
                                    <span class="chevron">▼</span>
                                </header>
                                <div class="panel-body">
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'users'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'users'"
                                    >
                                        👤 Gerenciar Usuários
                                    </button>
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'trips'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'trips'"
                                    >
                                        🚗 Gerenciar Corridas
                                    </button>
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'achievements'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'achievements'"
                                    >
                                        🏆 Classes de Conquistas
                                    </button>
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'assignments'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'assignments'"
                                    >
                                        👑 Entregar Conquistas
                                    </button>
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'backgrounds'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'backgrounds'"
                                    >
                                        🖼️ Imagens de Fundo
                                    </button>
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'music'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'music'"
                                    >
                                        🎵 Gerenciador de Músicas
                                    </button>
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'requests'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'requests'"
                                    >
                                        📥 Solicitações
                                    </button>
                                    <button
                                        :class="[
                                            'sidebar-nav-item',
                                            activeTab === 'database'
                                                ? 'active'
                                                : '',
                                        ]"
                                        @click="activeTab = 'database'"
                                    >
                                        🗄️ Explorer Banco de Dados
                                    </button>
                                </div>
                            </div>

                            <div class="xp-sidebar-panel">
                                <header
                                    class="panel-header"
                                    style="
                                        background: linear-gradient(
                                            to right,
                                            #4ade80,
                                            #388e3c
                                        );
                                    "
                                >
                                    <span>Outros Locais</span>
                                    <span class="chevron">▼</span>
                                </header>
                                <div class="panel-body">
                                    <router-link
                                        to="/"
                                        class="sidebar-nav-item text-shadow"
                                        style="text-decoration: none"
                                    >
                                        🎛️ Dashboard Público
                                    </router-link>
                                    <button
                                        @click="handleLogout"
                                        class="sidebar-nav-item"
                                        style="text-align: left; color: #b91c1c"
                                    >
                                        🚪 Logoff
                                    </button>
                                </div>
                            </div>
                        </aside>

                        <!-- Main Database Viewer/Editor -->
                        <main class="xp-main-panel">
                            <!-- Users view -->
                            <UsersTab
                                v-if="activeTab === 'users'"
                                :users="users"
                                :expandedUsers="expandedUsers"
                                v-model:searchQuery="searchQueries.users"
                                @open-user-modal="openUserModal"
                                @delete-user="deleteUser"
                                @toggle-user-expand="toggleUserExpand"
                                @open-address-modal="openAddressModal"
                                @delete-address="deleteAddress"
                                @open-comment-modal="openCommentModal"
                                @delete-comment="deleteComment"
                            />

                            <!-- Trips view -->
                            <TripsTab
                                v-else-if="activeTab === 'trips'"
                                :trips="trips"
                                :expandedTrips="expandedTrips"
                                :achievements="achievements"
                                v-model:searchQuery="searchQueries.trips"
                                @open-trip-modal="openTripModal"
                                @delete-trip="deleteTrip"
                                @toggle-trip-expand="toggleTripExpand"
                                @open-waypoint-modal="openWaypointModal"
                                @delete-waypoint="deleteWaypoint"
                                @open-media-modal="openMediaModal"
                                @delete-media="deleteMedia"
                            />

                            <!-- Achievements view -->
                            <AchievementsTab
                                v-else-if="activeTab === 'achievements'"
                                :achievements="achievements"
                                v-model:searchQuery="searchQueries.achievements"
                                @open-achievement-modal="openAchievementModal"
                                @delete-achievement="deleteAchievement"
                            />

                            <!-- Assignments view -->
                            <AssignmentsTab
                                v-else-if="activeTab === 'assignments'"
                                :users="users"
                                :achievements="achievements"
                                :assignmentForm="assignmentForm"
                                :filteredUserAchievements="
                                    filteredUserAchievements
                                "
                                @update:userId="assignmentForm.userId = $event"
                                @update:achievementId="
                                    assignmentForm.achievementId = $event
                                "
                                @assign-achievement="assignAchievement"
                                @revoke-achievement="revokeAchievement"
                            />

                            <!-- Backgrounds view -->
                            <BackgroundsTab
                                v-else-if="activeTab === 'backgrounds'"
                                :backgrounds="backgrounds"
                                @open-background-modal="openBackgroundModal"
                                @delete-background="deleteBackground"
                            />

                            <!-- Music view -->
                            <MusicTab
                                v-else-if="activeTab === 'music'"
                                :API_URL="API_URL"
                                :musicForm="musicForm"
                                :musicUploadProgress="musicUploadProgress"
                                :musicTracks="musicTracks"
                                @handle-audio-upload="handleAudioUpload"
                                @handle-cover-upload="handleCoverUpload"
                                @create-music-track="createMusicTrack"
                                @activate-music-track="activateMusicTrack"
                                @delete-music-track="deleteMusicTrack"
                            />

                            <!-- Requests view -->
                            <RequestsTab
                                v-else-if="activeTab === 'requests'"
                                :requests="userRequests"
                                @process-request="processRequest"
                            />

                            <!-- Database view -->
                            <DatabaseTab
                                v-else-if="activeTab === 'database'"
                            />
                        </main>
                    </div>
                </div>
            </div>
        </div>

        <!-- Retro Windows XP Context Menu -->
        <div
            v-if="showContextMenu"
            class="xp-context-menu"
            :style="{
                top: contextMenuPos.y + 'px',
                left: contextMenuPos.x + 'px',
            }"
        >
            <div
                @click="
                    openDisplayProperties();
                    showContextMenu = false;
                "
                class="context-item"
            >
                <span>Propriedades</span>
            </div>
        </div>

        <!-- Modais Exagerados Windows XP (Thick borders + Bevels) -->
        <div v-if="activeModal" class="xp-modal-backdrop animate-fade-in">
            <!-- DISPLAY PROPERTIES MODAL -->
            <div
                v-if="activeModal === 'display-properties'"
                class="xp-window animate-scale-up"
                style="max-width: 450px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">🖥️</span>
                        <h2>Propriedades de Vídeo</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <div class="xp-window-body" style="padding: 10px">
                    <!-- Tabs -->
                    <div class="xp-dialog-tabs">
                        <div class="xp-dialog-tab active">Área de Trabalho</div>
                    </div>

                    <div
                        class="xp-dialog-tab-body"
                        style="
                            padding: 15px;
                            display: flex;
                            flex-direction: column;
                            gap: 15px;
                            border: 1.5px solid #fff;
                            box-shadow: inset 1px 1px 0 #fff;
                            background: #f1efe2;
                            margin-top: -11px;
                        "
                    >
                        <!-- Monitor Preview -->
                        <div
                            class="xp-monitor-preview"
                            style="
                                position: relative;
                                width: 140px;
                                height: 110px;
                                margin: 0 auto;
                                background: #333;
                                border: 4px solid #555;
                                border-radius: 6px;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
                            "
                        >
                            <div
                                class="xp-monitor-screen"
                                :style="{
                                    background: previewBackgroundStyle,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                }"
                                style="
                                    width: 124px;
                                    height: 80px;
                                    border: 2px solid #000;
                                    border-radius: 2px;
                                    overflow: hidden;
                                    position: relative;
                                "
                            >
                                <div
                                    style="
                                        position: absolute;
                                        top: 10px;
                                        left: 10px;
                                        width: 50px;
                                        height: 30px;
                                        background: #ece9d8;
                                        border: 1.5px solid #0058e3;
                                        border-radius: 1px;
                                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                                        display: flex;
                                        flex-direction: column;
                                    "
                                >
                                    <div
                                        style="
                                            background: linear-gradient(
                                                to right,
                                                #0058e3,
                                                #3080f0
                                            );
                                            height: 6px;
                                            width: 100%;
                                        "
                                    ></div>
                                    <div
                                        style="
                                            flex: 1;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            font-size: 5px;
                                            color: #555;
                                            transform: scale(0.85);
                                        "
                                    >
                                        XP Preview
                                    </div>
                                </div>
                            </div>
                            <!-- stand -->
                            <div
                                style="
                                    position: absolute;
                                    bottom: -8px;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    width: 24px;
                                    height: 8px;
                                    background: #444;
                                    border-radius: 1px;
                                "
                            ></div>
                            <div
                                style="
                                    position: absolute;
                                    bottom: -12px;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    width: 50px;
                                    height: 4px;
                                    background: #555;
                                    border-radius: 3px 3px 0 0;
                                "
                            ></div>
                        </div>

                        <!-- Options -->
                        <div
                            style="
                                display: flex;
                                flex-direction: column;
                                gap: 6px;
                                margin-top: 5px;
                            "
                        >
                            <label
                                style="
                                    font-weight: bold;
                                    font-size: 11px;
                                    font-family: Tahoma, sans-serif;
                                "
                                >Plano de Fundo da Área de Trabalho:</label
                            >
                            <select
                                v-model="selectedBgType"
                                @change="updatePreview"
                                style="
                                    width: 100%;
                                    padding: 4px;
                                    border: 2px solid #7f9db9;
                                    font-family: Tahoma, sans-serif;
                                    font-size: 11px;
                                    background: white;
                                    outline: none;
                                "
                            >
                                <option value="bliss">
                                    Windows XP Bliss (Colinas Verdes)
                                </option>
                                <option value="aqua">
                                    Frutiger Aero Aqua (Gotas de Água)
                                </option>
                                <option value="space">
                                    Deep Space (Espaço Sideral)
                                </option>
                                <option value="sunset">
                                    Sunset Beach (Pôr do Sol)
                                </option>
                                <option value="stripes">
                                    LeitadApp Stripes (Listras Clássicas)
                                </option>
                                <option value="custom">
                                    Outro (URL Personalizada...)
                                </option>
                            </select>
                        </div>

                        <!-- Custom URL -->
                        <div
                            v-if="selectedBgType === 'custom'"
                            style="
                                display: flex;
                                flex-direction: column;
                                gap: 4px;
                            "
                        >
                            <label
                                style="
                                    font-size: 10px;
                                    font-weight: bold;
                                    font-family: Tahoma, sans-serif;
                                "
                                >Link URL da Imagem:</label
                            >
                            <input
                                v-model="selectedCustomBgUrl"
                                @input="updatePreview"
                                type="text"
                                placeholder="https://exemplo.com/imagem.jpg"
                                style="
                                    width: 100%;
                                    padding: 4px 6px;
                                    border: 2px solid #7f9db9;
                                    font-size: 11px;
                                    font-family: Tahoma, sans-serif;
                                    box-sizing: border-box;
                                "
                            />
                        </div>
                    </div>

                    <footer
                        class="xp-modal-footer"
                        style="
                            margin-top: 10px;
                            display: flex;
                            justify-content: flex-end;
                            gap: 8px;
                        "
                    >
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                            style="min-width: 70px"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            @click="applyAndSaveBg"
                            class="btn-xp green-btn"
                            style="min-width: 70px"
                        >
                            Aplicar
                        </button>
                        <button
                            type="button"
                            @click="applySaveAndCloseBg"
                            class="btn-xp green-btn"
                            style="min-width: 70px; font-weight: bold"
                        >
                            OK
                        </button>
                    </footer>
                </div>
            </div>

            <!-- USER MODAL -->
            <div
                v-if="activeModal === 'user'"
                class="xp-window animate-scale-up"
                style="max-width: 460px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">👤</span>
                        <h2>Propriedades do Usuário</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitUser" class="xp-form-modal">
                    <div class="input-group">
                        <label>Nome de Usuário (Username):</label>
                        <input
                            v-model="userForm.username"
                            type="text"
                            required
                            placeholder="Astrea"
                        />
                    </div>
                    <div class="input-group">
                        <label>Endereço de E-mail:</label>
                        <input
                            v-model="userForm.email"
                            type="email"
                            placeholder="usuario@email.com"
                        />
                    </div>
                    <div class="input-group">
                        <label>Cargo (Role):</label>
                        <select v-model="userForm.role">
                            <option value="driver">Driver (Usuário)</option>
                            <option value="admin">Administrador (Admin)</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Contador de Corridas:</label>
                        <input
                            v-model="userForm.tripsCount"
                            type="number"
                            min="0"
                            required
                        />
                    </div>
                    <div class="input-group">
                        <label>URL da Foto de Perfil (Avatar):</label>
                        <input
                            v-model="userForm.avatarUrl"
                            type="text"
                            placeholder="https://exemplo.com/avatar.jpg"
                        />
                    </div>
                    <div class="input-group">
                        <label>URL do Banner do Perfil:</label>
                        <input
                            v-model="userForm.bannerUrl"
                            type="text"
                            placeholder="https://exemplo.com/banner.jpg"
                        />
                    </div>
                    <div class="input-group">
                        <label>{{
                            modalMode === "create"
                                ? "Senha de Acesso:"
                                : "Senha (deixe em branco para não alterar):"
                        }}</label>
                        <input
                            v-model="userForm.password"
                            type="password"
                            :required="modalMode === 'create'"
                            placeholder="••••••••"
                        />
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn">
                            Salvar Alterações
                        </button>
                    </footer>
                </form>
            </div>

            <!-- TRIP MODAL -->
            <div
                v-if="activeModal === 'trip'"
                class="xp-window animate-scale-up"
                style="max-width: 480px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">🚗</span>
                        <h2>Propriedades da Corrida</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitTrip" class="xp-form-modal">
                    <!-- Modo Avançado Toggle -->
                    <div
                        style="
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            margin-bottom: 6px;
                            background: #ece9d8;
                            padding: 6px 10px;
                            border-top: 1px solid #fff;
                            border-left: 1px solid #fff;
                            border-bottom: 1.5px solid #888;
                            border-right: 1.5px solid #888;
                            box-sizing: border-box;
                        "
                    >
                        <input
                            type="checkbox"
                            id="advanced-mode-toggle"
                            v-model="isAdvancedMode"
                            style="
                                cursor: pointer;
                                margin: 0;
                                width: 14px;
                                height: 14px;
                            "
                        />
                        <label
                            for="advanced-mode-toggle"
                            style="
                                font-weight: bold;
                                cursor: pointer;
                                margin: 0;
                                font-size: 11px;
                                font-family: Tahoma, sans-serif;
                                color: #000;
                            "
                            >Modo Avançado (Digitação Manual)</label
                        >
                    </div>

                    <!-- Banners de Status de Roteamento -->
                    <div
                        v-if="isRouting"
                        style="
                            background: #ffffe1;
                            border: 1px solid #000;
                            padding: 6px 10px;
                            margin-bottom: 6px;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 11px;
                            font-family: Tahoma, sans-serif;
                            color: #000;
                            box-shadow: 2px 2px 2px rgba(0, 0, 0, 0.15);
                        "
                    >
                        <div
                            style="
                                border: 2.5px solid #d6d2c2;
                                border-top: 2.5px solid #0058e3;
                                border-radius: 50%;
                                width: 14px;
                                height: 14px;
                                animation: spinXp 0.8s linear infinite;
                                box-sizing: border-box;
                            "
                        ></div>
                        <span>Calculando rota via OSRM...</span>
                    </div>
                    <div
                        v-if="routingError"
                        style="
                            background: #fee2e2;
                            border: 1px solid #ef4444;
                            padding: 6px 10px;
                            margin-bottom: 6px;
                            font-size: 11px;
                            color: #b91c1c;
                            font-family: Tahoma, sans-serif;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        "
                    >
                        <span
                            >⚠️ <strong>Erro:</strong> {{ routingError }}</span
                        >
                    </div>

                    <div class="input-group" v-if="modalMode === 'create'">
                        <label>Selecione o Usuário:</label>
                        <select v-model="tripForm.userId" required>
                            <option
                                v-for="u in users"
                                :key="u.id"
                                :value="u.id"
                            >
                                {{ u.username }}
                            </option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Nome Opcional da Corrida:</label>
                        <input
                            v-model="tripForm.name"
                            type="text"
                            placeholder="Ex: Viagem Matinal"
                        />
                    </div>
                    <div class="grid-2-col-xp">
                        <div class="input-group">
                            <label>Distância (km):</label>
                            <input
                                v-model="tripForm.distanceKm"
                                type="number"
                                step="0.1"
                                required
                                :disabled="!isAdvancedMode"
                            />
                        </div>
                        <div class="input-group">
                            <label>Duração (min):</label>
                            <input
                                v-model="tripForm.durationMin"
                                type="number"
                                required
                                :disabled="!isAdvancedMode"
                            />
                        </div>
                    </div>
                    <div class="grid-2-col-xp">
                        <div class="input-group">
                            <label>Velocidade Média (km/h):</label>
                            <input
                                v-model="tripForm.avgSpeed"
                                type="number"
                                step="0.1"
                                :disabled="!isAdvancedMode"
                            />
                        </div>
                        <div class="input-group">
                            <label>Data/Hora da Corrida:</label>
                            <input
                                v-model="tripForm.createdAt"
                                type="datetime-local"
                                required
                            />
                        </div>
                    </div>
                    <div class="grid-2-col-xp">
                        <div class="input-group" :class="{ 'active-autocomplete': activeSuggestions.field === 'startLocation' && activeSuggestions.list.length > 0 }">
                            <label>Ponto Inicial (Partida):</label>
                            <input
                                v-model="tripForm.startLocation"
                                type="text"
                                placeholder="Rua..."
                                @change="calculateRouteAutomatically"
                                @input="handleAddressInput($event.target.value, 'startLocation')"
                            />
                            <!-- Suggestions Dropdown -->
                            <div v-if="activeSuggestions.field === 'startLocation' && activeSuggestions.list.length > 0" class="suggestions-dropdown">
                                <div 
                                    v-for="(item, idx) in activeSuggestions.list" 
                                    :key="idx" 
                                    @mousedown.prevent="selectSuggestion(item)"
                                    class="suggestion-item"
                                >
                                    {{ item.display_name }}
                                </div>
                            </div>
                        </div>
                        <div class="input-group" :class="{ 'active-autocomplete': activeSuggestions.field === 'endLocation' && activeSuggestions.list.length > 0 }">
                            <label>Ponto Final (Destino):</label>
                            <input
                                v-model="tripForm.endLocation"
                                type="text"
                                placeholder="Av..."
                                @change="calculateRouteAutomatically"
                                @input="handleAddressInput($event.target.value, 'endLocation')"
                            />
                            <!-- Suggestions Dropdown -->
                            <div v-if="activeSuggestions.field === 'endLocation' && activeSuggestions.list.length > 0" class="suggestions-dropdown">
                                <div 
                                    v-for="(item, idx) in activeSuggestions.list" 
                                    :key="idx" 
                                    @mousedown.prevent="selectSuggestion(item)"
                                    class="suggestion-item"
                                >
                                    {{ item.display_name }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Paradas Intermediárias -->
                    <div class="input-group" style="margin-top: 8px">
                        <label
                            style="
                                font-weight: bold;
                                display: block;
                                margin-bottom: 4px;
                            "
                            >Paradas Intermediárias (Waypoints):</label
                        >
                        <div
                            v-for="(wp, idx) in tripForm.waypoints"
                            :key="idx"
                            style="
                                display: flex;
                                gap: 6px;
                                align-items: center;
                                margin-bottom: 6px;
                            "
                        >
                            <div 
                                style="position: relative; flex: 1; display: flex;"
                                :class="{ 'active-autocomplete': activeSuggestions.field === 'waypoint' && activeSuggestions.index === idx && activeSuggestions.list.length > 0 }"
                            >
                                <input
                                    v-model="tripForm.waypoints[idx]"
                                    type="text"
                                    placeholder="Endereço da parada"
                                    required
                                    style="
                                        width: 100%;
                                        padding: 4px 8px;
                                        border: 1px solid #7f9db9;
                                        font-size: 12px;
                                        height: 26px;
                                        box-sizing: border-box;
                                    "
                                    @change="calculateRouteAutomatically"
                                    @input="handleAddressInput($event.target.value, 'waypoint', idx)"
                                />
                                <!-- Suggestions Dropdown -->
                                <div v-if="activeSuggestions.field === 'waypoint' && activeSuggestions.index === idx && activeSuggestions.list.length > 0" class="suggestions-dropdown">
                                    <div 
                                        v-for="(item, sIdx) in activeSuggestions.list" 
                                        :key="sIdx" 
                                        @mousedown.prevent="selectSuggestion(item)"
                                        class="suggestion-item"
                                    >
                                        {{ item.display_name }}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                @click="removeFormWaypoint(idx)"
                                style="
                                    background: #f0f0f0;
                                    border: 1px solid #7f9db9;
                                    padding: 2px 6px;
                                    color: #ef4444;
                                    cursor: pointer;
                                    font-weight: bold;
                                    font-size: 11px;
                                    height: 26px;
                                    box-sizing: border-box;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                "
                            >
                                ✕
                            </button>
                        </div>
                        <button
                            type="button"
                            @click="addFormWaypoint"
                            class="btn-xp secondary-btn"
                            style="
                                padding: 2px 8px;
                                font-size: 11px;
                                align-self: flex-start;
                                cursor: pointer;
                                background: #f0f0f0;
                                border: 1px solid #7f9db9;
                                margin-top: 2px;
                                height: 24px;
                            "
                        >
                            ➕ Adicionar Parada
                        </button>
                    </div>

                    <!-- Passageiros Participantes -->
                    <div class="input-group" style="margin-top: 8px">
                        <label
                            style="
                                font-weight: bold;
                                display: block;
                                margin-bottom: 4px;
                            "
                            >Passageiros da Corrida:</label
                        >
                        <div
                            style="
                                max-height: 100px;
                                overflow-y: auto;
                                border: 1px solid #7f9db9;
                                padding: 6px;
                                background: white;
                                box-sizing: border-box;
                            "
                        >
                            <div
                                v-for="u in users.filter(
                                    (usr) =>
                                        usr.id !==
                                        parseInt(tripForm.userId, 10),
                                )"
                                :key="u.id"
                                style="
                                    display: flex;
                                    align-items: center;
                                    gap: 8px;
                                    margin-bottom: 4px;
                                "
                            >
                                <input
                                    type="checkbox"
                                    :id="'pass-' + u.id"
                                    :value="u.id"
                                    v-model="tripForm.passengerIds"
                                    style="margin: 0; cursor: pointer"
                                />
                                <label
                                    :for="'pass-' + u.id"
                                    style="
                                        font-weight: normal;
                                        margin: 0;
                                        cursor: pointer;
                                        font-size: 12px;
                                        color: #333;
                                    "
                                    >{{ u.username }}</label
                                >
                            </div>
                            <div
                                v-if="
                                    users.filter(
                                        (usr) =>
                                            usr.id !==
                                            parseInt(tripForm.userId, 10),
                                    ).length === 0
                                "
                                style="
                                    font-size: 11px;
                                    color: #666;
                                    font-style: italic;
                                    text-align: center;
                                    padding: 4px;
                                "
                            >
                                Nenhum outro usuário disponível
                            </div>
                        </div>
                    </div>

                    <!-- Conquistas da Viagem -->
                    <div class="input-group" style="margin-top: 8px">
                        <label
                            style="
                                font-weight: bold;
                                display: block;
                                margin-bottom: 4px;
                            "
                            >Conquistas da Viagem (Surgidas nesta corrida):</label
                        >
                        <div
                            style="
                                max-height: 100px;
                                overflow-y: auto;
                                border: 1px solid #7f9db9;
                                padding: 6px;
                                background: white;
                                box-sizing: border-box;
                            "
                        >
                            <div
                                v-for="ach in achievements"
                                :key="ach.id"
                                style="
                                    display: flex;
                                    align-items: center;
                                    gap: 8px;
                                    margin-bottom: 4px;
                                "
                            >
                                <input
                                    type="checkbox"
                                    :id="'ach-' + ach.id"
                                    :value="ach.id"
                                    v-model="tripForm.achievementIds"
                                    style="margin: 0; cursor: pointer"
                                />
                                <label
                                    :for="'ach-' + ach.id"
                                    style="
                                        font-weight: normal;
                                        margin: 0;
                                        cursor: pointer;
                                        font-size: 12px;
                                        color: #333;
                                    "
                                    >{{ ach.emoji }} {{ ach.title }}</label
                                >
                            </div>
                            <div
                                v-if="achievements.length === 0"
                                style="
                                    font-size: 11px;
                                    color: #666;
                                    font-style: italic;
                                    text-align: center;
                                    padding: 4px;
                                "
                            >
                                Nenhuma conquista disponível
                            </div>
                        </div>
                    </div>

                    <div class="input-group" style="margin-top: 8px">
                        <label>Pontos Gerados (calculados automaticamente):</label>
                        <input
                            v-model="tripForm.pointsGenerated"
                            type="number"
                            disabled
                            style="background-color: #f3f4f6; color: #4b5563; cursor: not-allowed;"
                        />
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn">
                            Salvar Corrida
                        </button>
                    </footer>
                </form>
            </div>

            <!-- ADDRESS MODAL -->
            <div
                v-if="activeModal === 'address'"
                class="xp-window animate-scale-up"
                style="max-width: 400px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">📍</span>
                        <h2>Novo Endereço Postal</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitAddress" class="xp-form-modal">
                    <div class="input-group">
                        <label>Rua e Número (Logradouro):</label>
                        <input
                            v-model="addressForm.street"
                            type="text"
                            required
                            placeholder="Av. Paulista, 1000"
                        />
                    </div>
                    <div class="grid-2-col-xp">
                        <div class="input-group">
                            <label>Cidade:</label>
                            <input
                                v-model="addressForm.city"
                                type="text"
                                required
                                placeholder="São Paulo"
                            />
                        </div>
                        <div class="input-group">
                            <label>Estado (UF):</label>
                            <input
                                v-model="addressForm.state"
                                type="text"
                                required
                                placeholder="SP"
                                maxLength="2"
                            />
                        </div>
                    </div>
                    <div class="input-group">
                        <label>Código Postal (CEP):</label>
                        <input
                            v-model="addressForm.postalCode"
                            type="text"
                            required
                            placeholder="01310-100"
                        />
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn">
                            Cadastrar Endereço
                        </button>
                    </footer>
                </form>
            </div>

            <!-- COMMENT MODAL -->
            <div
                v-if="activeModal === 'comment'"
                class="xp-window animate-scale-up"
                style="max-width: 400px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">💬</span>
                        <h2>Escrever Comentário na Conta</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitComment" class="xp-form-modal">
                    <div class="input-group">
                        <label>Autor:</label>
                        <input
                            v-model="commentForm.authorName"
                            type="text"
                            required
                            readonly
                        />
                    </div>
                    <div class="input-group">
                        <label>Mensagem do Comentário:</label>
                        <textarea
                            v-model="commentForm.content"
                            required
                            placeholder="Escreva observações sobre a conduta ou notas internas..."
                            style="
                                width: 100%;
                                min-height: 80px;
                                font-family: Tahoma, sans-serif;
                                border: 2px solid #7f9db9;
                                padding: 4px;
                                box-sizing: border-box;
                                resize: vertical;
                            "
                        ></textarea>
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn">
                            Inserir Nota
                        </button>
                    </footer>
                </form>
            </div>

            <!-- WAYPOINT MODAL -->
            <div
                v-if="activeModal === 'waypoint'"
                class="xp-window animate-scale-up"
                style="max-width: 400px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">🚩</span>
                        <h2>Adicionar Parada na Rota</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitWaypoint" class="xp-form-modal">
                    <div class="input-group">
                        <label>Endereço / Local:</label>
                        <input
                            v-model="waypointForm.address"
                            type="text"
                            required
                            placeholder="Estação da Luz"
                        />
                    </div>
                    <div class="input-group">
                        <label>Ordem da Parada:</label>
                        <input
                            v-model="waypointForm.order"
                            type="number"
                            min="1"
                            required
                        />
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn">
                            Adicionar Parada
                        </button>
                    </footer>
                </form>
            </div>

            <!-- MEDIA MODAL -->
            <div
                v-if="activeModal === 'media'"
                class="xp-window animate-scale-up"
                style="max-width: 400px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">📸</span>
                        <h2>Nova Mídia de Rota</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitMedia" class="xp-form-modal">
                    <div class="input-group">
                        <label>Tipo de Mídia:</label>
                        <select v-model="mediaForm.type">
                            <option value="text">Texto / Relato</option>
                            <option value="image">Imagem (URL)</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Conteúdo (Texto ou URL da imagem):</label>
                        <input
                            v-model="mediaForm.content"
                            type="text"
                            required
                            placeholder="Texto ou link da foto..."
                        />
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn">
                            Vincular Mídia
                        </button>
                    </footer>
                </form>
            </div>

            <!-- ACHIEVEMENT MODAL -->
            <div
                v-if="activeModal === 'achievement'"
                class="xp-window animate-scale-up"
                style="max-width: 400px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">🏆</span>
                        <h2>Propriedades da Conquista</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitAchievement" class="xp-form-modal">
                    <div class="input-group">
                        <label>Identificador Único (Chave):</label>
                        <input
                            v-model="achievementForm.key"
                            type="text"
                            required
                            placeholder="first_trip"
                            :disabled="modalMode === 'update'"
                        />
                    </div>
                    <div class="input-group">
                        <label>Título da Conquista:</label>
                        <input
                            v-model="achievementForm.title"
                            type="text"
                            required
                            placeholder="Primeira Aventura"
                        />
                    </div>
                    <div class="input-group">
                        <label>Descrição do Objetivo:</label>
                        <input
                            v-model="achievementForm.description"
                            type="text"
                            required
                            placeholder="Complete a primeira corrida no LeitadApp"
                        />
                    </div>
                    <div class="grid-2-col-xp">
                        <div class="input-group">
                            <label>Emoji Representativo:</label>
                            <input
                                v-model="achievementForm.emoji"
                                type="text"
                                required
                                placeholder="🏆"
                                maxLength="2"
                            />
                        </div>
                        <div class="input-group">
                            <label>Cor do Brilho (Neon):</label>
                            <select v-model="achievementForm.glowColor">
                                <option value="cyan">Ciano (Neon)</option>
                                <option value="gold">Dourado (Premium)</option>
                                <option value="emerald">Esmeralda (Eco)</option>
                                <option value="purple">
                                    Púrpura (Místico)
                                </option>
                                <option value="crimson">
                                    Carmesim (Speed)
                                </option>
                            </select>
                        </div>
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn">
                            Salvar Conquista
                        </button>
                    </footer>
                </form>
            </div>

            <!-- BACKGROUND MODAL -->
            <div
                v-if="activeModal === 'background'"
                class="xp-window animate-scale-up"
                style="max-width: 400px"
            >
                <header class="xp-titlebar">
                    <div class="titlebar-logo">
                        <span class="logo-icon">🖼️</span>
                        <h2>Nova Imagem de Fundo Padrão</h2>
                    </div>
                    <button @click="activeModal = null" class="win-btn close">
                        X
                    </button>
                </header>
                <form @submit.prevent="submitBackground" class="xp-form-modal">
                    <div class="input-group">
                        <label>Chave da Imagem (Key):</label>
                        <input
                            v-model="backgroundForm.key"
                            type="text"
                            required
                            placeholder="autumn"
                        />
                    </div>
                    <div class="input-group">
                        <label>Título Exibido:</label>
                        <input
                            v-model="backgroundForm.title"
                            type="text"
                            required
                            placeholder="Outono Lindo"
                        />
                    </div>
                    <div class="input-group">
                        <label>Fazer Upload de Imagem:</label>
                        <input
                            type="file"
                            accept="image/*"
                            @change="handleBgUpload"
                            style="width: 100%;"
                        />
                        <span v-if="bgUploading" style="font-size: 10px; color: #0284c7; display: block; margin-top: 2px;">⏳ Enviando...</span>
                        <span v-else-if="backgroundForm.url" style="font-size: 10px; color: #16a34a; display: block; margin-top: 2px;">✅ Pronto!</span>
                    </div>
                    <div class="input-group">
                        <label>URL Absoluta da Imagem:</label>
                        <input
                            v-model="backgroundForm.url"
                            type="text"
                            required
                            placeholder="https://exemplo.com/outono.jpg"
                        />
                    </div>
                    <footer class="xp-modal-footer">
                        <button
                            type="button"
                            @click="activeModal = null"
                            class="btn-xp secondary-btn"
                        >
                            Cancelar
                        </button>
                        <button type="submit" class="btn-xp green-btn" :disabled="bgUploading">
                            Salvar Fundo
                        </button>
                    </footer>
                </form>
            </div>
        </div>

        <!-- Toasts (Windows XP Style alerts) -->
        <div v-if="toasts.length > 0" class="xp-toast-container">
            <div
                v-for="t in toasts"
                :key="t.id"
                :class="['xp-toast', t.type]"
                @click="toasts = toasts.filter((item) => item.id !== t.id)"
                style="cursor: pointer; display: flex; align-items: center; gap: 8px;"
            >
                <span style="font-size: 14px;">
                    {{ t.type === 'error' ? '❌' : 'ℹ️' }}
                </span>
                <div style="display: flex; flex-direction: column; gap: 1px;">
                    <div style="font-weight: bold; font-size: 10px; color: #555;">
                        {{ t.type === 'error' ? 'Erro do Sistema' : 'LeitadApp Alerta' }}
                    </div>
                    <div style="font-size: 11px; font-weight: 500;">{{ t.msg }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style>
@import "../styles/admin.css";
</style>
