<template>
  <div>
    <div class="hero">
      <div class="hero__left">
        <h2 class="title">{{ $t('home.guest.title') }}</h2>
        <p class="desc">{{ $t('home.guest.description') }}</p>

        <div class="cta">
          <UiButton variant="primary" @click="$emit('login')">
            {{ $t('home.guest.ctaLogin') }}
          </UiButton>

          <UiButton variant="default" @click="scrollToFeatures">
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

    <div ref="featuresRef" class="features">
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'

defineEmits<{
  (event: 'login'): void
}>()

const featuresRef = ref<HTMLElement | null>(null)

function scrollToFeatures(): void {
  featuresRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
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
  .hero {
    grid-template-columns: 1fr;
  }
  .features {
    grid-template-columns: 1fr;
  }
}
</style>
