import { ref, watch } from 'vue';

import { defaultBackgrounds } from './utils/backgrounds';

export const globalBgType = ref(localStorage.getItem('app-background') || 'bliss');
export const globalCustomBgUrl = ref(localStorage.getItem('app-background-custom') || '');

export function applyGlobalBackground(bgType, customUrl = '') {
  let url = '';
  if (defaultBackgrounds[bgType]) {
    url = defaultBackgrounds[bgType];
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
