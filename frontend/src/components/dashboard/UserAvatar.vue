<script setup>
const props = defineProps({
  avatarUrl: String,
  getFullUrl: Function,
  size: {
    type: String,
    default: '34px'
  },
  borderRadius: {
    type: String,
    default: '10px'
  },
  isEditable: {
    type: Boolean,
    default: false
  },
  iconSize: {
    type: String,
    default: '20px'
  }
});
</script>

<template>
  <div 
    class="user-avatar-container"
    :style="{ 
      width: size, 
      height: size, 
      borderRadius: borderRadius, 
      overflow: 'hidden', 
      background: '#e2e8f0', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      flexShrink: 0,
      position: 'relative'
    }"
  >
    <img 
      v-if="avatarUrl" 
      :src="getFullUrl(avatarUrl)" 
      style="width: 100%; height: 100%; object-fit: cover;" 
    />
    <svg 
      v-else 
      fill="currentColor" 
      viewBox="0 0 24 24" 
      :style="{ width: iconSize, height: iconSize, color: '#94a3b8' }"
    >
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
    </svg>
    
    <div 
      v-if="isEditable" 
      style="position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold; pointer-events: none;"
    >
      <span>📷</span>
      <span>Alterar</span>
    </div>
  </div>
</template>
