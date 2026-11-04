import '@/assets/styles/main.css'

import { UiSoundPlayer, WebAudioExtractPlayer } from '@quizzup/audio'
import { createApp } from 'vue'

import App from '@/App.vue'
import { createDemoSynthPlayer, createRoutingExtractPlayer } from '@/audio/demoSynthPlayer'
import { configureRoomGame } from '@/game/useRoomGame'
import { syncHardwareWithRoom } from '@/hardware/hardwareSync'
import { createAppI18n } from '@/plugins/i18n'
import { createRoomRouter } from '@/router'
import { isRoomReady, refreshRoomAccount } from '@/state/roomAuth'
import { authHeaders, getRoomToken } from '@/utils/auth'

// Extraits en Web Audio (décodés en mémoire), extraits de démo synthétisés et sons
// d'interface : tout partage le même AudioContext.
const extracts = new WebAudioExtractPlayer()
configureRoomGame({
  player: createRoutingExtractPlayer(
    extracts,
    createDemoSynthPlayer(() => extracts.getContext())
  ),
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
    return
  }
  // Config matérielle relue depuis le compte de la salle (copie locale en secours).
  void syncHardwareWithRoom()
})

createApp(App).use(router).use(createAppI18n()).mount('#app')
