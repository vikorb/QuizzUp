import { createApp } from 'vue'

import App from '@/App.vue'
import { createAppI18n } from '@/plugins/i18n'

createApp(App).use(createAppI18n()).mount('#app')
