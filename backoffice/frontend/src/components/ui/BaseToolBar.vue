<template>
  <BaseCard class="toolbar-card" :neon="false" :no-hover="true">
    <div
      class="toolbar"
      :class="{ 'toolbar--collapsed': isCollapsed }"
      :style="toolbarStyle"
    >
      <div class="toolbar__header">
        <button
          v-if="collapsible"
          class="toolbar__toggle"
          type="button"
          :aria-expanded="!isCollapsed"
          :aria-label="toggleLabel"
          @click="toggleCollapsed"
        >
          <MdIcon :path="toggleIcon" :size="20" />
          <span class="toolbar__title">{{ title }}</span>
        </button>

        <h3 v-else class="toolbar__title">
          {{ title }}
        </h3>

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

          <UiButton
            v-if="showPrimary"
            variant="primary"
            type="button"
            @click="$emit('primary')"
          >
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
import { mdiChevronDown, mdiChevronUp } from '@mdi/js'
import type { CSSProperties } from 'vue'
import { computed, ref } from 'vue'

import BaseCard from '@/components/ui/BaseCard.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'

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
  },
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
    }) as CSSProperties,
)

const toggleIcon = computed(() => (isCollapsed.value ? mdiChevronDown : mdiChevronUp))

const toggleLabel = computed(() =>
  isCollapsed.value ? 'Afficher les filtres' : 'Masquer les filtres',
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
  z-index: 1;
}

.toolbar {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 18px;
  overflow: visible;
}

.toolbar__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  overflow: visible;
}

.toolbar__toggle {
  flex: 1 1 auto;
  min-width: 0;

  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;

  min-height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: inherit;
  cursor: pointer;
}

.toolbar__toggle:hover {
  color: var(--primary);
}

.toolbar__title {
  flex: 1 1 auto;
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

.toolbar__filters {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, var(--toolbar-filter-min-width)), 1fr)
  );
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
  min-height: 46px;
}

.toolbar :deep(.ui-btn) {
  min-height: 42px;
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
