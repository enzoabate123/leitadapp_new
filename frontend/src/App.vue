<script setup>
import { onMounted, nextTick } from 'vue';
import { sfxHover, sfxClick } from './sounds';

onMounted(async () => {
  await nextTick();

  // Global hover SFX on all buttons/interactive elements
  const selector = 'button, .sidebar-nav-item, select, .btn-xp, a, .nav-item, .tab-btn, .start-btn';
  document.body.addEventListener('mouseenter', (e) => {
    if (e.target.matches && (e.target.matches(selector) || e.target.closest(selector))) {
      sfxHover();
    }
  }, true);

  // Global click SFX on all buttons
  document.body.addEventListener('click', (e) => {
    if (e.target.matches && (e.target.matches('button, .btn-xp, .sidebar-nav-item') || e.target.closest('button, .btn-xp, .sidebar-nav-item'))) {
      sfxClick();
    }
  }, true);
});
</script>

<template>
  <router-view />
</template>
