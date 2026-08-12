<template>
  <div class="nav-group" :class="{ 'nav-group--rail': rail }">
    <div v-if="!rail" class="nav-label">{{ label }}</div>

    <div v-if="$slots.default" class="nav-body">
      <slot />
    </div>

    <template v-else>
      <component
        :is="item.to ? RouterLink : 'button'"
        v-for="item in items"
        :key="itemKey(item)"
        class="nav-link"
        :class="{ 'is-active': isActive(item) }"
        :to="item.to"
        type="button"
        :title="rail ? (item.labelKey ? $t(item.labelKey) : item.label) : undefined"
        @click="onItemClick(item)"
      >
        <span class="icon" aria-hidden="true">
          <MdIcon v-if="item.iconType === 'mdi'" :path="item.icon" :size="20" />
          <span v-else>{{ item.icon }}</span>
        </span>

        <span v-if="!rail" class="nav-link__label">
          {{ item.labelKey ? $t(item.labelKey) : item.label }}
        </span>
      </component>
    </template>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

import MdIcon from '@/components/ui/MdIcon.vue'

export interface NavItem {
  to?: string
  icon: string
  iconType?: 'text' | 'mdi'
  labelKey?: string
  label?: string
  onClick?: () => void
}

withDefaults(
  defineProps<{
    label: string
    items?: NavItem[]
    rail?: boolean
  }>(),
  { items: () => [], rail: false }
)

const route = useRoute()

function itemKey(item: NavItem) {
  return item.to ?? item.labelKey ?? item.label ?? item.icon
}

function isActive(item: NavItem) {
  if (!item.to) return false
  return route.path === item.to
}

function onItemClick(item: NavItem) {
  if (!item.to) item.onClick?.()
}
</script>

<style scoped>
.nav-group {
  margin-bottom: 22px;
}

.nav-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  margin-bottom: 8px;
  padding-left: 12px;
}

.nav-body {
  padding: 0 6px;
}

.nav-link {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 12px;
  margin-bottom: 2px;
  border-radius: 12px;
  color: var(--text-2);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition:
    color var(--tr),
    background var(--tr);

  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.nav-link__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-link:hover {
  background: var(--bg-field);
  color: var(--text-0);
}
.nav-link:hover .icon {
  color: var(--text-0);
}

/* Actif : texte blanc + barre d'accent violette (plus jamais vert). */
.nav-link.is-active {
  color: var(--text-0);
  background: linear-gradient(90deg, var(--glow-soft), transparent);
}
.nav-link.is-active .icon {
  color: var(--accent-pink);
}
.nav-link.is-active::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--accent-blue), var(--accent-pink));
  box-shadow: 0 0 12px 1px var(--glow-pink);
}

.icon {
  width: 20px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex: 0 0 auto;
  color: var(--text-2);
  transition: color var(--tr);
}

/* ---- Rail (icônes seules, tablette portrait) ---- */
.nav-group--rail {
  margin-bottom: 12px;
}
.nav-group--rail .nav-link {
  justify-content: center;
  gap: 0;
  padding: 0;
}
.nav-group--rail .nav-link.is-active::before {
  left: -14px;
}
</style>
