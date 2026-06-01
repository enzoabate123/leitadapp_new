<script setup>
const props = defineProps({
  activeRankingList: Array,
  getFullUrl: Function
});

const emit = defineEmits(['open-public-profile']);
</script>

<template>
  <div class="flex flex-col h-full gap-5">
    <!-- Header -->
    <div class="achievements-header" style="display: flex; align-items: center; gap: 12px;">
      <div class="achievements-icon-box" style="background-color: #fef08a; font-size: 24px;">🏆</div>
      <div>
        <h1 class="title-main" style="margin: 0;">Ranking Global</h1>
        <p style="color:#64748b; font-size:14px; font-weight:500; margin: 2px 0 0 0;">Veja quem são os melhores motoristas</p>
      </div>
    </div>

    <!-- Ranking List -->
    <div class="flex-1 overflow-y-auto no-scroll" style="display: flex; flex-direction: column; gap: 8px; padding: 12px; margin: -12px -12px -12px -12px;">
      <div 
        v-for="user in activeRankingList" 
        :key="user.userId"
        @click="$emit('open-public-profile', user.userId)"
        :class="['activity-row', user.active ? 'active-user' : '']"
        style="cursor: pointer; transition: all 0.2s;"
        onmouseover="this.style.transform='scale(1.01)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)';"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
      >
        <div style="font-weight: 800; font-size: 16px; color: #64748b; width: 28px; text-align: center;">
          {{ user.pos }}º
        </div>
        <div class="activity-avatar">
          <img v-if="user.avatarUrl" :src="getFullUrl(user.avatarUrl)" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;" />
          <span v-else style="background: #e2e8f0; width: 100%; height: 100%; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #94a3b8;">
            <svg fill="currentColor" viewBox="0 0 24 24" style="width: 20px; height: 20px;">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </span>
        </div>
        <div class="activity-info" style="display: flex; flex-direction: column; justify-content: center;">
          <span class="activity-title" :style="{ color: user.active ? '#2563eb' : '#334155' }">{{ user.name }}</span>
          <div style="display: flex; gap: 6px; margin-top: 4px;">
            <span v-for="(tag, idx) in user.customTags.slice(0, 2)" :key="idx" :style="{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '40' }" style="padding: 2px 6px; border-radius: 6px; font-size: 9px; font-weight: 700; border: 1px solid;">
              {{ tag.text }}
            </span>
            <span v-if="user.customTags.length > 2" style="font-size: 9px; color: #94a3b8; font-weight: bold; align-self: center;">+{{ user.customTags.length - 2 }}</span>
          </div>
        </div>
        
        <!-- Stats -->
        <div style="display: flex; gap: 16px; align-items: center;">
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <span style="font-size: 13px; font-weight: 700; color: #1e293b;">{{ user.tripsCount }}</span>
            <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">Viagens</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <span style="font-size: 13px; font-weight: 700; color: #1e293b;">{{ user.totalDistance.toFixed(1) }}</span>
            <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">km</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; min-width: 60px;">
            <span class="activity-xp text-emerald-500" style="font-size: 14px;">+{{ user.pts }}</span>
            <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">Pontos</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
