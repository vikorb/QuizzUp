// Surface « centre » : l'espace des centres clients. Aucun écran de la console de l'éditeur.
// Le build de production et le build `--mode centre` lisent ce module (alias `@surface`,
// voir vite.config.ts). Ne rien importer de la console ici : ce serait la rouvrir.
import type { RouteRecordRaw } from 'vue-router'

import type { NavItem } from '@/components/NavGroup.vue'

export const routes: RouteRecordRaw[] = []

export const navItems: NavItem[] = []
