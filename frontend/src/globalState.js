import { ref, watch } from 'vue';

export const globalBgType = ref(localStorage.getItem('app-background') || 'bliss');
export const globalCustomBgUrl = ref(localStorage.getItem('app-background-custom') || '');

export function applyGlobalBackground(bgType, customUrl = '') {
  let url = '';
  if (bgType === 'bliss') {
    url = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80';
  } else if (bgType === 'aqua') {
    url = 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1920&q=80';
  } else if (bgType === 'space') {
    url = 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=1920&q=80';
  } else if (bgType === 'sunset') {
    url = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80';
  } else if (bgType === 'custom' && customUrl) {
    url = customUrl;
  }
  
  if (bgType === 'stripes' || !url) {
    document.body.style.background = "repeating-linear-gradient(-45deg, #f0f4f8, #f0f4f8 10px, #e2e8f0 10px, #e2e8f0 20px)";
  } else {
    document.body.style.background = `url('${url}') no-repeat center center fixed`;
    document.body.style.backgroundSize = 'cover';
  }

  localStorage.setItem('app-background', bgType);
  localStorage.setItem('app-background-custom', customUrl);
  globalBgType.value = bgType;
  globalCustomBgUrl.value = customUrl;
}

// Initial application
applyGlobalBackground(globalBgType.value, globalCustomBgUrl.value);
