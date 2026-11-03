<template>
  <label v-if="label" class="label-field" :for="forId">
    {{ label }}
    <span v-if="required" class="label-field__req">*</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  label?: string
  forId?: string
  required?: boolean
}>()
</script>

<style scoped>
.label-field {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: 0.2px;
}

.label-field__req {
  color: var(--accent-pink);
  margin-left: 4px;
}
</style>
