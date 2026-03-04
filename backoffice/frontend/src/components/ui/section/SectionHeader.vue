<template>
  <div class="shead">
    <div class="shead__brand">
      <div class="shead__mark">
        <slot name="mark" />
      </div>

      <div class="shead__text">
        <h1 class="shead__title">{{ title }}</h1>
        <p v-if="subtitle" class="shead__subtitle">{{ subtitle }}</p>
      </div>
    </div>

    <div v-if="$slots.actions" class="shead__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<style scoped>
.shead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.shead__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.shead__mark {
  display: grid;
  place-items: center;
}

.shead__title {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
  color: var(--text-0);
}

.shead__subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-2);
}

.shead__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
