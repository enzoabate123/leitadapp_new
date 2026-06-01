<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  show: Boolean,
  achievementsList: Array,
  initialHighlights: Array
});

const emit = defineEmits(['close', 'save']);

const pendingHighlights = ref([]);

watch(() => props.show, (newVal) => {
  if (newVal) {
    pendingHighlights.value = [...(props.initialHighlights || [])];
  }
});

const toggleHighlight = (id) => {
  if (pendingHighlights.value.includes(id)) {
    pendingHighlights.value = pendingHighlights.value.filter(h => h !== id);
  } else {
    if (pendingHighlights.value.length < 3) {
      pendingHighlights.value.push(id);
    }
  }
};

const handleSave = () => {
  emit('save', pendingHighlights.value);
};
</script>

<template>
  <div v-if="show" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);">
    <div class="glass" style="max-width: 480px; width: 90%; padding: 28px; display: flex; flex-direction: column; gap: 20px; background: rgba(255,255,255,0.95); box-shadow: 0 10px 25px rgba(0,0,0,0.15);">
      <h2 style="font-weight: 800; font-size: 20px; color: #1e293b; margin: 0;">Editar Destaques</h2>
      <p style="font-size: 14px; color: #64748b; margin: 0;">Selecione até 3 conquistas desbloqueadas para exibir no seu perfil.</p>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; max-height: 40vh; overflow-y: auto; padding: 4px;">
        <div 
          v-for="ach in achievementsList.filter(a => a.unlocked)" 
          :key="ach.id"
          @click="toggleHighlight(ach.id)"
          :style="{
            border: pendingHighlights.includes(ach.id) ? `2px solid ${ach.glowColor || '#3b82f6'}` : '2px solid transparent',
            background: pendingHighlights.includes(ach.id) ? `${ach.glowColor}15` : 'rgba(0,0,0,0.03)',
            opacity: (!pendingHighlights.includes(ach.id) && pendingHighlights.length >= 3) ? '0.5' : '1',
            cursor: (!pendingHighlights.includes(ach.id) && pendingHighlights.length >= 3) ? 'not-allowed' : 'pointer'
          }"
          style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 8px; border-radius: 16px; transition: all 0.2s;"
        >
          <div style="font-size: 28px; margin-bottom: 8px;">{{ ach.emoji || '🏆' }}</div>
          <span style="font-size: 11px; font-weight: 700; text-align: center; color: #334155; line-height: 1.2;">{{ ach.title || ach.name }}</span>
        </div>
        <div v-if="achievementsList.filter(a => a.unlocked).length === 0" style="grid-column: 1 / -1; text-align: center; color: #64748b; font-size: 14px; padding: 20px 0;">
          Você ainda não desbloqueou nenhuma conquista.
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;">
        <button @click="$emit('close')" style="padding: 10px 16px; border-radius: 99px; font-size: 14px; font-weight: 700; color: #64748b; border: none; background: rgba(0,0,0,0.05); cursor: pointer;">Cancelar</button>
        <button @click="handleSave" style="padding: 10px 20px; border-radius: 99px; font-size: 14px; font-weight: 700; color: white; border: none; background: #3b82f6; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">Salvar Destaques</button>
      </div>
    </div>
  </div>
</template>
