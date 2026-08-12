<template>
  <BaseCard class="toolbar-card" :neon="false" :no-hover="true">
    <div class="toolbar" :class="{ 'toolbar--collapsed': isCollapsed }" :style="toolbarStyle">
      <div class="toolbar__header">
        <div
          class="toolbar__toggle"
          :class="{ 'toolbar__toggle--clickable': collapsible }"
          :role="collapsible ? 'button' : undefined"
          :tabindex="collapsible ? 0 : undefined"
          :aria-expanded="collapsible ? !isCollapsed : undefined"
          :aria-label="collapsible ? toggleLabel : undefined"
          @click="collapsible && toggleCollapsed()"
          @keydown.enter.prevent="collapsible && toggleCollapsed()"
          @keydown.space.prevent="collapsible && toggleCollapsed()"
        >
          <MdIcon v-if="collapsible" class="toolbar__chevron" :path="toggleIcon" :size="20" />
          <span class="toolbar__title">{{ title }}</span>

          <div v-if="activeFilters.length > 0" class="toolbar__chips">
            <span v-for="filter in activeFilters" :key="filter.key" class="toolbar__chip">
              <span class="toolbar__chip-text">{{ filter.label }}</span>
              <button
                v-if="filter.onRemove"
                class="toolbar__chip-remove"
                type="button"
                :aria-label="`${removeLabel} ${filter.label}`"
                @click.stop="filter.onRemove"
              >
                <MdIcon :path="mdiClose" :size="12" />
              </button>
            </span>
          </div>
        </div>

        <div class="toolbar__actions">
          <UiButton
            v-if="showReset && !isCollapsed"
            variant="default"
            type="button"
            :disabled="resetDisabled"
            @click="$emit('reset')"
          >
            <span class="toolbar__button-content">
              <MdIcon v-if="resetIcon" :path="resetIcon" :size="18" />
              <span>{{ resetLabel }}</span>
            </span>
          </UiButton>

          <UiButton v-if="showPrimary" variant="primary" type="button" @click="$emit('primary')">
            <span class="toolbar__button-content">
              <MdIcon v-if="primaryIcon" :path="primaryIcon" :size="18" />
              <span>{{ primaryLabel }}</span>
            </span>
          </UiButton>
        </div>
      </div>

      <div v-if="!isCollapsed" class="toolbar__filters">
        <slot />
      </div>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiChevronDown, mdiChevronUp, mdiClose } from '@mdi/js'
import type { CSSProperties } from 'vue'
import { computed, ref } from 'vue'

import BaseCard from '@/components/ui/BaseCard.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'

export type ActiveFilter = {
  key: string
  label: string
  onRemove?: () => void
}

const props = withDefaults(
  defineProps<{
    title?: string
    collapsible?: boolean
    defaultCollapsed?: boolean
    resetLabel?: string
    resetIcon?: string
    resetDisabled?: boolean
    showReset?: boolean
    primaryLabel?: string
    primaryIcon?: string
    showPrimary?: boolean
    filterMinWidth?: string
    filterGap?: string
    activeFilters?: ActiveFilter[]
    removeLabel?: string
  }>(),
  {
    title: 'Filtres',
    collapsible: true,
    defaultCollapsed: false,
    resetLabel: '',
    resetIcon: undefined,
    resetDisabled: false,
    showReset: true,
    primaryLabel: '',
    primaryIcon: undefined,
    showPrimary: false,
    filterMinWidth: '170px',
    filterGap: '12px',
    activeFilters: () => [],
    removeLabel: 'Retirer',
  }
)

defineEmits<{
  (event: 'reset'): void
  (event: 'primary'): void
}>()

const isCollapsed = ref(props.defaultCollapsed)

const toolbarStyle = computed(
  () =>
    ({
      '--toolbar-filter-min-width': props.filterMinWidth,
      '--toolbar-filter-gap': props.filterGap,
    }) as CSSProperties
)

const toggleIcon = computed(() => (isCollapsed.value ? mdiChevronDown : mdiChevronUp))

const toggleLabel = computed(() =>
  isCollapsed.value ? 'Afficher les filtres' : 'Masquer les filtres'
)

function toggleCollapsed(): void {
  isCollapsed.value = !isCollapsed.value
}
</script>

<style scoped>
.toolbar-card {
  position: relative;
  width: 100%;
  min-width: 0;
  overflow: visible;
  /* Au-dessus de la table (dont l'en-tête sticky) pour que les menus de select
     ouverts passent par-dessus tout. */
  z-index: 50;
}

/* Barre de filtres plus compacte : ce ne sont que des filtres. */
.toolbar-card.toolbar-card {
  padding: 11px 14px;
}

.toolbar {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 14px;
  overflow: visible;
}

.toolbar__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  min-width: 0;
  overflow: visible;
}

.toolbar__toggle {
  flex: 1 1 auto;
  min-width: 0;

  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;

  min-height: 34px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: inherit;
}

.toolbar__toggle--clickable {
  cursor: pointer;
}

.toolbar__toggle--clickable:hover .toolbar__title,
.toolbar__toggle--clickable:hover .toolbar__chevron {
  color: var(--primary);
}

.toolbar__chevron {
  flex: 0 0 auto;
}

.toolbar__title {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: currentColor;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar__actions {
  flex: 0 0 auto;
  margin-left: auto;

  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.toolbar__button-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Balises des filtres actifs : à droite du titre, panneau déplié ou non. */
.toolbar__chips {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: var(--glow-soft);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  animation: toolbar-chip-in 0.22s cubic-bezier(0.4, 0, 0.2, 1) both;
}

@keyframes toolbar-chip-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.toolbar__chip-remove {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  line-height: 0;
  border: 0;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  transition: var(--tr);
}

.toolbar__chip-remove:hover {
  color: var(--danger);
  background: var(--danger-bg);
}

.toolbar__chip-remove :deep(svg) {
  display: block;
}

.toolbar__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--toolbar-filter-min-width)), 1fr));
  align-items: end;
  gap: var(--toolbar-filter-gap);
  width: 100%;
  min-width: 0;
  overflow: visible;
}

.toolbar__filters :deep(*) {
  min-width: 0;
}

.toolbar__filters :deep(.form-field),
.toolbar__filters :deep(.select-field),
.toolbar__filters :deep(.ui-btn) {
  width: 100%;
  max-width: 100%;
}

.toolbar__filters :deep(select),
.toolbar__filters :deep(input),
.toolbar__filters :deep(textarea),
.toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}

.toolbar__filters :deep(.select-field__menu),
.toolbar__filters :deep(.select-field__options),
.toolbar__filters :deep(.dropdown),
.toolbar__filters :deep([role='listbox']) {
  z-index: 20;
}

.toolbar__filters :deep(select),
.toolbar__filters :deep(.select-field__trigger),
.toolbar__filters :deep(.form-field__control),
.toolbar__filters :deep(.form-field__input) {
  min-height: 42px;
}

.toolbar :deep(.ui-btn) {
  min-height: 38px;
}

@media (max-width: 1100px) {
  .toolbar__filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .toolbar__header {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar__toggle,
  .toolbar__title {
    width: 100%;
  }

  .toolbar__actions {
    width: 100%;
    justify-content: stretch;
  }

  .toolbar__actions :deep(.ui-btn) {
    flex: 1;
  }
}

@media (max-width: 700px) {
  .toolbar__filters {
    grid-template-columns: 1fr;
  }
}
</style>
