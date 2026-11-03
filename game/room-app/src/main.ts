import '@/assets/styles/main.css'

import { createApp } from 'vue'

import App from '@/App.vue'
import { createAppI18n } from '@/plugins/i18n'
import { createRoomRouter } from '@/router'
import { refreshRoomAccount } from '@/state/roomAuth'

void refreshRoomAccount()

createApp(App).use(createRoomRouter()).use(createAppI18n()).mount('#app')
