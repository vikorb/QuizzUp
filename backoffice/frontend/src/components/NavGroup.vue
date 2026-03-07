<template>
  <div class="nav-group">
    <div class="nav-label">{{ label }}</div>

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
        @click="onItemClick(item)"
      >
        <span class="icon" aria-hidden="true">
          <MdIcon v-if="item.iconType === 'mdi'" :path="item.icon" :size="18" />
          <span v-else>{{ item.icon }}</span>
        </span>

        {{ item.labelKey ? $t(item.labelKey) : item.label }}
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
  }>(),
  { items: () => [] }
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
  margin-bottom: 24px;
}

.nav-label {
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
  padding-left: 12px;
}

.nav-body {
  padding: 0 6px;
}

.nav-link {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  color: var(--text-1);
  text-decoration: none;
  transition: var(--tr);

  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-0);
}

.nav-link.is-active {
  background: rgba(139, 92, 246, 0.1);
  color: var(--accent-cyan);
}

.icon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
}
</style>
