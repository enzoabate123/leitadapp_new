import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3002,
    strictPort: true,
    host: true, // Expõe o servidor na rede local do Raspberry Pi
    allowedHosts: true
  }
});
