<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  loginForm: {
    type: Object,
    required: true
  },
  loginError: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['submit']);
</script>

<template>
  <div class="xp-window center-window animate-scale-up" style="max-width: 420px; margin: auto;">
    <header class="xp-titlebar">
      <div class="titlebar-logo">
        <span class="logo-icon">🔑</span>
        <h2>Segurança do Windows XP - LeitadApp</h2>
      </div>
      <div class="window-controls">
        <button class="win-btn close" disabled>X</button>
      </div>
    </header>
    <div class="xp-window-body" style="padding: 20px;">
      <div style="display: flex; gap: 15px; margin-bottom: 20px; align-items: center;">
        <div style="font-size: 40px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));">🛡️</div>
        <div>
          <h3 style="margin: 0; font-size: 15px; color: #003399; font-weight: bold;">Identificação Necessária</h3>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">Faça logon para acessar o console CMS.</p>
        </div>
      </div>

      <form @submit.prevent="emit('submit')" class="xp-form">
        <div class="input-group">
          <label>Usuário Administrador:</label>
          <input :value="loginForm.username" @input="loginForm.username = $event.target.value" type="text" placeholder="Ex: admin" required />
        </div>
        <div class="input-group">
          <label>Senha do Sistema:</label>
          <input :value="loginForm.password" @input="loginForm.password = $event.target.value" type="password" placeholder="••••••••" required />
        </div>

        <p v-if="loginError" class="xp-error-text">{{ loginError }}</p>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
          <router-link to="/" class="btn-xp secondary-btn text-center" style="display: inline-flex; align-items:center; text-decoration:none;">Cancelar</router-link>
          <button type="submit" class="btn-xp green-btn">Logon 🔑</button>
        </div>
      </form>
    </div>
  </div>
</template>
