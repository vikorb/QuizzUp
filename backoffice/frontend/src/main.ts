import { createApp } from 'vue'

import App from '@/App.vue'
import { createAppI18n } from '@/plugins/i18n'
import { router } from '@/router'

createApp(App).use(router).use(createAppI18n()).mount('#app')
