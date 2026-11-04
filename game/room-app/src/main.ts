import '@/assets/styles/main.css'

import { UiSoundPlayer, WebAudioExtractPlayer } from '@quizzup/audio'
import { createApp } from 'vue'

import App from '@/App.vue'
import { configureRoomGame } from '@/game/useRoomGame'
import { createAppI18n } from '@/plugins/i18n'
import { createRoomRouter } from '@/router'
import { isRoomReady, refreshRoomAccount } from '@/state/roomAuth'
import { authHeaders, getRoomToken } from '@/utils/auth'

// Extraits en Web Audio (décodés en mémoire) et sons d'interface sur le même AudioContext.
const extracts = new WebAudioExtractPlayer()
configureRoomGame({
  player: extracts,
  sounds: UiSoundPlayer.sharing(extracts),
  fetchMedia: (url) => {
    const token = getRoomToken()
    return fetch(url, token ? { headers: authHeaders(token) } : {})
  },
})

const router = createRoomRouter()

// Jeton expiré ou révoqué : retour à la connexion (une partie interrompue se reprend ensuite).
void refreshRoomAccount().then(() => {
  const current = router.currentRoute.value
  if (!isRoomReady.value && !current.meta.public) {
    void router.replace({ name: 'login' })
  }
})

createApp(App).use(router).use(createAppI18n()).mount('#app')
