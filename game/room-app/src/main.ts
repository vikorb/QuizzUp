import '@/assets/styles/main.css'

import { createApp } from 'vue'

import App from '@/App.vue'
import { createAppI18n } from '@/plugins/i18n'
import { createRoomRouter } from '@/router'
import { isRoomReady, refreshRoomAccount } from '@/state/roomAuth'

const router = createRoomRouter()

// Jeton expiré ou révoqué : retour à la connexion (une partie interrompue se reprend ensuite).
void refreshRoomAccount().then(() => {
  const current = router.currentRoute.value
  if (!isRoomReady.value && !current.meta.public) {
    void router.replace({ name: 'login' })
  }
})

createApp(App).use(router).use(createAppI18n()).mount('#app')
