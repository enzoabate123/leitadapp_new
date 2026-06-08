<script setup>
import UserAvatar from './UserAvatar.vue';

const props = defineProps({
  rank: {
    type: Object,
    required: true
  },
  getFullUrl: {
    type: Function,
    required: true
  },
  isCompact: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['open-public-profile']);
</script>

<template>
  <!-- Compact layout (HomeTab style) -->
  <div 
    v-if="isCompact"
    @click="$emit('open-public-profile', rank.userId)"
    :class="['ranking-row', rank.active ? 'active-user' : '']"
  >
    <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
      <span style="font-weight: 800; font-size: 13px; color: #64748b; width: 28px; text-align: center; flex-shrink: 0;">{{ rank.pos }}º</span>
      
      <UserAvatar 
        :avatar-url="rank.avatarUrl" 
        :get-full-url="getFullUrl" 
        size="34px" 
        border-radius="10px" 
        icon-size="14px"
        style="border: 1.5px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"
      />

      <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
        <span style="font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1;">{{ rank.name }}</span>
        
        <div v-if="rank.customTags && rank.customTags.length > 0" style="display: flex; gap: 4px; flex-shrink: 0; align-items: center;">
          <span 
            v-for="(tag, idx) in rank.customTags.slice(0, 1)" 
            :key="idx" 
            :style="{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '30' }" 
            style="padding: 2px 6px; border-radius: 6px; font-size: 9px; font-weight: 700; border: 0.5px solid; white-space: nowrap; line-height: 1;"
          >
            {{ tag.text }}
          </span>
          <span v-if="rank.customTags.length > 1" style="font-size: 9px; color: #94a3b8; font-weight: bold; line-height: 1;">+{{ rank.customTags.length - 1 }}</span>
        </div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; margin-left: 8px; line-height: 1.1;">
      <span style="font-size: 14px; font-weight: 800; color: #10b981;">{{ rank.pts.toLocaleString('pt-BR') }}</span>
      <span style="font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">pts</span>
    </div>
  </div>

  <!-- Full layout (RankingTab style) -->
  <div 
    v-else
    @click="$emit('open-public-profile', rank.userId)"
    :class="['activity-row', rank.active ? 'active-user' : '']"
    class="ranking-row-hoverable"
  >
    <div style="font-weight: 800; font-size: 16px; color: #64748b; width: 28px; text-align: center;">
      {{ rank.pos }}º
    </div>
    
    <div class="activity-avatar">
      <UserAvatar 
        :avatar-url="rank.avatarUrl" 
        :get-full-url="getFullUrl" 
        size="100%" 
        border-radius="12px" 
        icon-size="20px"
      />
    </div>

    <div class="activity-info" style="display: flex; flex-direction: column; justify-content: center;">
      <span class="activity-title" :style="{ color: rank.active ? '#2563eb' : '#334155' }">{{ rank.name }}</span>
      <div style="display: flex; gap: 6px; margin-top: 4px;">
        <span v-for="(tag, idx) in rank.customTags.slice(0, 2)" :key="idx" :style="{ backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '40' }" style="padding: 2px 6px; border-radius: 6px; font-size: 9px; font-weight: 700; border: 1px solid;">
          {{ tag.text }}
        </span>
        <span v-if="rank.customTags.length > 2" style="font-size: 9px; color: #94a3b8; font-weight: bold; align-self: center;">+{{ rank.customTags.length - 2 }}</span>
      </div>
    </div>
    
    <!-- Stats -->
    <div style="display: flex; gap: 16px; align-items: center;">
      <div class="hide-on-mobile" style="display: flex; flex-direction: column; align-items: flex-end;">
        <span style="font-size: 13px; font-weight: 700; color: #1e293b;">{{ rank.tripsCount }}</span>
        <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">Viagens</span>
      </div>
      <div class="hide-on-mobile" style="display: flex; flex-direction: column; align-items: flex-end;">
        <span style="font-size: 13px; font-weight: 700; color: #1e293b;">{{ rank.totalDistance.toFixed(1) }}</span>
        <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">km</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; min-width: 60px;">
        <span class="activity-xp text-emerald-500" style="font-size: 14px;">+{{ rank.pts }}</span>
        <span style="font-size: 9px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">Pontos</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-row-hoverable {
  cursor: pointer;
  transition: all 0.2s;
}
.ranking-row-hoverable:hover {
  transform: scale(1.01);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}
</style>
