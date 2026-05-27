import { createRouter, createWebHistory } from 'vue-router';
import DriverDashboard from './pages/DriverDashboard.vue';
import AdminCMS from './pages/AdminCMS.vue';

const routes = [
  {
    path: '/',
    name: 'driver-dashboard',
    component: DriverDashboard
  },
  {
    path: '/admin',
    name: 'admin-cms',
    component: AdminCMS
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
