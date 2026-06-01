<script setup>
import { ref } from 'vue';

const props = defineProps({
  authError: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['submit-auth']);

const authMode = ref('login');
const authForm = ref({ username: '', password: '', email: '' });

const handleSubmit = () => {
  emit('submit-auth', {
    mode: authMode.value,
    form: { ...authForm.value }
  });
};
</script>

<template>
  <div class="glass login-screen" style="max-width: 400px; margin: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; gap: 20px;">
    <h1 class="title-main" style="text-align: center;">{{ authMode === 'login' ? 'Bem-vindo de volta' : 'Criar Conta' }}</h1>
    <p class="subtitle-meta" style="text-align: center; margin-bottom: 20px;">{{ authMode === 'login' ? 'Entre para continuar' : 'Junte-se à jornada' }}</p>
    
    <form @submit.prevent="handleSubmit" style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">Usuário</label>
        <input v-model="authForm.username" type="text" required placeholder="Ex: Astrea" style="padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 14px; outline: none; transition: all 0.2s; width: 100%; box-sizing: border-box;" />
      </div>
      <div v-if="authMode === 'register'" style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">E-mail</label>
        <input v-model="authForm.email" type="email" required placeholder="astrea@email.com" style="padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 14px; outline: none; transition: all 0.2s; width: 100%; box-sizing: border-box;" />
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569;">Senha</label>
        <input v-model="authForm.password" type="password" required placeholder="••••••••" style="padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.8); font-size: 14px; outline: none; transition: all 0.2s; width: 100%; box-sizing: border-box;" />
      </div>

      <p v-if="authError" style="color: #ef4444; font-size: 13px; font-weight: 500; text-align: center; margin: 0;">{{ authError }}</p>

      <button type="submit" style="margin-top: 10px; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; font-weight: 700; font-size: 16px; cursor: pointer; transition: opacity 0.2s; width: 100%;">
        {{ authMode === 'login' ? 'Entrar' : 'Registrar' }}
      </button>
    </form>

    <p style="margin-top: 24px; font-size: 13px; color: #64748b; text-align: center;">
      {{ authMode === 'login' ? 'Não tem uma conta?' : 'Já possui uma conta?' }}
      <span @click="authMode = authMode === 'login' ? 'register' : 'login'" style="color: #3b82f6; font-weight: 600; cursor: pointer; margin-left: 4px;">
        {{ authMode === 'login' ? 'Registre-se' : 'Faça login' }}
      </span>
    </p>
  </div>
</template>
