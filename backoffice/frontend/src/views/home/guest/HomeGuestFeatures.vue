<template>
  <div class="features">
    <UiCard class="feature-card">
      <div class="feature-kicker">{{ $t('home.guest.features.fast.kicker') }}</div>
      <div class="feature-title">{{ $t('home.guest.features.fast.title') }}</div>
      <p class="feature-desc">{{ $t('home.guest.features.fast.desc') }}</p>
    </UiCard>

    <UiCard class="feature-card">
      <div class="feature-kicker">{{ $t('home.guest.features.manage.kicker') }}</div>
      <div class="feature-title">{{ $t('home.guest.features.manage.title') }}</div>
      <p class="feature-desc">{{ $t('home.guest.features.manage.desc') }}</p>
    </UiCard>

    <UiCard class="feature-card">
      <div class="feature-kicker">{{ $t('home.guest.features.secure.kicker') }}</div>
      <div class="feature-title">{{ $t('home.guest.features.secure.title') }}</div>
      <p class="feature-desc">{{ $t('home.guest.features.secure.desc') }}</p>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import UiCard from '@/components/ui/UiCard.vue'
</script>

<style scoped>
.features {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.feature-card {
  padding: 14px;
  border-radius: 18px;
}

.feature-kicker {
  font-size: 12px;
  color: var(--text-2);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.feature-title {
  margin-top: 8px;
  font-size: 16px;
  font-weight: 900;
  color: var(--text-0);
}

.feature-desc {
  margin: 8px 0 0;
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.4;
}

@media (max-width: 980px) {
  .features {
    grid-template-columns: 1fr;
  }
}
</style>
