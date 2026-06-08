<script setup>
import RankingRow from './RankingRow.vue';

const props = defineProps({
  activeRankingList: Array,
  getFullUrl: Function
});

const emit = defineEmits(['open-public-profile']);
</script>

<template>
  <div class="flex flex-col h-full gap-5">

    <!-- Ranking List -->
    <div class="flex-1 overflow-y-auto no-scroll" style="display: flex; flex-direction: column; gap: 8px; padding: 12px; margin: -12px -12px -12px -12px;">
      <RankingRow
        v-for="user in activeRankingList" 
        :key="user.userId"
        :rank="user"
        :get-full-url="getFullUrl"
        :is-compact="false"
        @open-public-profile="$emit('open-public-profile', $event)"
      />
    </div>
  </div>
</template>
