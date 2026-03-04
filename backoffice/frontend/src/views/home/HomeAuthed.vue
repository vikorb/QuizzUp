<template>
  <div>
    <h2 class="title">{{ $t('home.title') }}</h2>
    <p class="desc">{{ $t('home.description') }}</p>

    <div class="grid">
      <UiCard class="card">
        <div class="kicker">{{ $t('navbar.players') }}</div>
        <div class="value">+</div>
      </UiCard>

      <UiCard class="card">
        <div class="kicker">{{ $t('navbar.questionsAnswers') }}</div>
        <div class="value">+</div>
      </UiCard>

      <UiCard class="card">
        <div class="kicker">{{ $t('navbar.games') }}</div>
        <div class="value">+</div>
      </UiCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiCard from '@/components/ui/UiCard.vue'
</script>

<style scoped>
.title {
  margin: 0;
  font-size: 22px;
  font-weight: 850;
  letter-spacing: 0.2px;
}

.desc {
  margin: 10px 0 0;
  color: var(--text-1);
}

.grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.card {
  padding: 14px;
  border-radius: 18px;
}

.kicker {
  font-size: 12px;
  color: var(--text-2);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.value {
  margin-top: 10px;
  font-size: 26px;
  font-weight: 900;
  background: linear-gradient(135deg, rgba(0, 225, 255, 0.9), rgba(122, 92, 255, 0.9));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
