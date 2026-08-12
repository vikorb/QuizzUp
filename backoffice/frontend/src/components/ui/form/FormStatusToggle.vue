<template>
  <div class="status-toggle" :class="{ 'status-toggle--pending': pending }">
    <div class="status-toggle__info">
      <p class="status-toggle__title">{{ label }}</p>
      <Tooltip v-if="help" :text="help" />
    </div>

    <SwitchField
      :model-value="active"
      :disabled="disabled"
      :label="label"
      @change="$emit('toggle')"
    />
  </div>
</template>

<script setup lang="ts">
import SwitchField from '@/components/ui/form/SwitchField.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

defineProps<{
  active: boolean
  label: string
  help?: string
  disabled?: boolean
  pending?: boolean
}>()

defineEmits<{
  (event: 'toggle'): void
}>()
</script>

<style scoped>
.status-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-2);
}

.status-toggle--pending {
  border-color: rgba(240, 189, 102, 0.4);
}

.status-toggle__info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-toggle__title {
  margin: 0;
  color: var(--text-0);
  font-weight: 800;
  font-size: 14px;
}

.status-toggle--pending .status-toggle__title {
  color: var(--warn);
}
</style>
