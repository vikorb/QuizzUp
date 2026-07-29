<template>
  <p v-if="error" class="form-result form-result--error">
    {{ error }}
  </p>

  <p v-else-if="success" class="form-result form-result--success">
    {{ success }}
  </p>
</template>

<script setup lang="ts">
defineProps<{
  error?: string | null
  success?: string | null
}>()
</script>

<style scoped>
.form-result {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  color: var(--text-1);
}

.form-result--error {
  border: 1px solid var(--danger);
  background: var(--danger-bg);
}

.form-result--success {
  border: 1px solid var(--ok);
  background: var(--ok-bg);
}
</style>
