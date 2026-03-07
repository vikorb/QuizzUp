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
  color: rgba(255, 255, 255, 0.92);
}

.form-result--error {
  border: 1px solid rgba(237, 46, 251, 0.35);
  background: rgba(237, 46, 251, 0.08);
}

.form-result--success {
  border: 1px solid rgba(0, 242, 255, 0.28);
  background: rgba(0, 242, 255, 0.08);
}
</style>
