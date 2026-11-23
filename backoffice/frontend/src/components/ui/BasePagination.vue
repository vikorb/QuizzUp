<template>
  <nav v-if="total > 0" class="pagination" :aria-label="$t('pagination.label')">
    <p class="pagination__range" data-test="pagination-range" aria-live="polite">
      {{ $t('pagination.range', { from: firstItem, to: lastItem, total }) }}
    </p>

    <!-- Pendant le chargement, `aria-disabled` et non `disabled` : un bouton désactivé perd le focus clavier. -->
    <div class="pagination__actions">
      <UiButton
        type="button"
        data-test="pagination-previous"
        :disabled="offset <= 0"
        :aria-disabled="busy"
        @click="goTo(Math.max(0, offset - limit))"
      >
        {{ $t('pagination.previous') }}
      </UiButton>

      <UiButton
        type="button"
        data-test="pagination-next"
        :disabled="offset + limit >= total"
        :aria-disabled="busy"
        @click="goTo(offset + limit)"
      >
        {{ $t('pagination.next') }}
      </UiButton>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{
  /** Éléments au total, toutes pages confondues. */
  total: number
  /** Rang du premier élément de la page (0 pour la première). */
  offset: number
  limit: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:offset', value: number): void
}>()

const busy = computed(() => (props.disabled ? 'true' : undefined))

function goTo(offset: number): void {
  if (!props.disabled) {
    emit('update:offset', offset)
  }
}

const firstItem = computed(() => props.offset + 1)
const lastItem = computed(() => Math.min(props.offset + props.limit, props.total))
</script>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin-top: 14px;
}

.pagination__range {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.pagination__actions {
  display: flex;
  gap: 10px;
}

.pagination__actions :deep(.ui-btn) {
  min-width: 48px;
  min-height: 48px;
}

.pagination__actions :deep(.ui-btn[aria-disabled='true']) {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination__actions :deep(.ui-btn:focus-visible) {
  outline: 2px solid var(--border-hover);
  outline-offset: 2px;
}
</style>
