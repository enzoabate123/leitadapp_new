<script setup>
const props = defineProps({
  achievementsList: Array,
  getFullUrl: Function
});

const emit = defineEmits(['open-public-profile']);
</script>

<template>
  <div class="flex flex-col h-full gap-5">

    <!-- Achievements Grid -->
    <div class="grid achievements-grid-responsive flex-1 overflow-y-auto no-scroll" style="display: grid; gap: 16px; padding: 12px; margin: -12px -12px -12px -12px;">
      <div 
        v-for="ach in achievementsList" 
        :key="ach.id" 
        :class="['ach-card', ach.unlocked ? 'unlocked' : 'locked']"
        style="position: relative;"
      >
        <div v-if="ach.firstWinner" @click.stop="$emit('open-public-profile', ach.firstWinner.id)" class="first-winner-badge" style="position: absolute; top: -12px; right: -12px; z-index: 10; display: flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.98); padding: 4px 8px; border-radius: 20px; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4); border: 2px solid #fbbf24; cursor: pointer; transition: transform 0.2s;">
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

<style scoped>
.first-winner-badge:hover {
  transform: scale(1.05);
}
</style>
