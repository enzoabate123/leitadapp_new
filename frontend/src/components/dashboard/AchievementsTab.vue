<script setup>
const props = defineProps({
  level: Number,
  achievementsList: Array,
  userId: String,
  getFullUrl: Function
});

const emit = defineEmits(['open-public-profile']);
</script>

<template>
  <div class="flex flex-col h-full gap-5">
    <!-- Header -->
    <div class="achievements-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div class="achievements-title-block" style="display: flex; align-items: center; gap: 12px;">
        <div class="achievements-icon-box" style="font-size: 24px;">👑</div>
        <div>
          <h1 class="title-main" style="margin: 0;">Galeria de Prêmios</h1>
          <p style="color:#64748b; font-size:14px; font-weight:500; margin: 2px 0 0 0;">Colecione todos os selos!</p>
        </div>
      </div>
      <div class="achievements-progress-meta" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        <span class="profile-section-title" style="margin-bottom:0">Nível {{ level }}</span>
        <div class="achievements-progress-bar" style="width: 120px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
          <div class="progress-fill" style="width:80%; height: 100%; background: #3b82f6;"></div>
        </div>
      </div>
    </div>

    <!-- Achievements Grid -->
    <div class="grid achievements-grid-responsive flex-1 overflow-y-auto no-scroll" style="display: grid; gap: 16px; padding: 12px; margin: -12px -12px -12px -12px;">
      <div 
        v-for="ach in achievementsList" 
        :key="ach.id" 
        :class="['ach-card', ach.unlocked ? 'unlocked' : 'locked']"
        style="position: relative;"
      >
        <div v-if="ach.firstWinner" @click.stop="$emit('open-public-profile', ach.firstWinner.id)" class="first-winner-badge" style="position: absolute; top: -12px; right: -12px; z-index: 10; display: flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.98); padding: 4px 8px; border-radius: 20px; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4); border: 2px solid #fbbf24; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          <img v-if="ach.firstWinner.avatarUrl" :src="getFullUrl(ach.firstWinner.avatarUrl)" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid #fbbf24;" />
          <span style="font-size: 9px; font-weight: 800; color: #b45309; text-transform: uppercase;">{{ ach.firstWinner.username }}</span>
          <span style="font-size: 10px;">👑</span>
        </div>
        <div class="ach-icon-wrapper">
          <div v-if="ach.unlocked && ach.glowColor" :class="['ach-glow', ach.glowColor]"></div>
          <span class="ach-emoji">{{ ach.emoji || '❓' }}</span>
          <div class="ach-star-badge" v-if="ach.unlocked">⭐</div>
        </div>
        <h3 class="ach-title">{{ ach.title }}</h3>
        <p class="ach-desc">{{ ach.description }}</p>
      </div>
    </div>
  </div>
</template>
