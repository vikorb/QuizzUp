<template>
  <div class="hero">
    <div class="hero__left">
      <h2 class="title">{{ $t('home.guest.title') }}</h2>
      <p class="desc">{{ $t('home.guest.description') }}</p>

      <div class="cta">
        <UiButton variant="primary" type="button" @click="$emit('login')">
          {{ $t('home.guest.ctaLogin') }}
        </UiButton>

        <UiButton variant="default" type="button" @click="$emit('learn-more')">
          {{ $t('home.guest.ctaLearnMore') }}
        </UiButton>
      </div>

      <p class="mini">{{ $t('home.guest.note') }}</p>
    </div>

    <div class="hero__right" aria-hidden="true">
      <div class="orb orb--a"></div>
      <div class="orb orb--b"></div>
      <div class="orb orb--c"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'

defineEmits<{
  (event: 'login'): void
  (event: 'learn-more'): void
}>()
</script>

<style scoped>
.title {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0.2px;
}

.desc {
  margin: 10px 0 0;
  color: var(--text-1);
}

.hero {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--border-ui);
  background: rgba(255, 255, 255, 0.03);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 0 18px var(--glow-blue),
    0 0 26px var(--glow-pink);
  overflow: hidden;
}

.cta {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.mini {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.hero__right {
  position: relative;
  min-height: 160px;
}

.orb {
  position: absolute;
  border-radius: 999px;
  opacity: 0.85;
}

.orb--a {
  width: 180px;
  height: 180px;
  right: -40px;
  top: -30px;
  background: radial-gradient(circle at 30% 30%, rgba(0, 98, 255, 0.5), transparent 60%);
}

.orb--b {
  width: 220px;
  height: 220px;
  right: -80px;
  bottom: -70px;
  background: radial-gradient(circle at 40% 40%, rgba(237, 46, 251, 0.35), transparent 60%);
}

.orb--c {
  width: 140px;
  height: 140px;
  left: 10px;
  bottom: -30px;
  background: radial-gradient(circle at 40% 40%, rgba(0, 98, 255, 0.22), transparent 60%);
}

@media (max-width: 980px) {
  .hero {
    grid-template-columns: 1fr;
  }
}
</style>
