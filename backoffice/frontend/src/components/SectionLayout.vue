<template>
  <section class="section-layout">
    <header class="sticky-header">
      <div class="header-inner">
        <slot name="header">
          <h2 class="title">{{ title }}</h2>
        </slot>
      </div>
    </header>

    <div class="content-body">
      <p v-if="subtitle" class="subtitle">
        {{ subtitle }}
      </p>

      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<style scoped>
.section-layout {
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 0 22px 22px 22px;
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  margin: 0 -22px;
  padding: 24px 22px 6px 22px;
  pointer-events: none;
}

.sticky-header::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 52%,
    rgba(0, 0, 0, 0.72) 74%,
    rgba(0, 0, 0, 0.32) 90%,
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 52%,
    rgba(0, 0, 0, 0.72) 74%,
    rgba(0, 0, 0, 0.32) 90%,
    transparent 100%
  );
  background:
    radial-gradient(1200px 200px at 12% -60%, rgba(74, 99, 216, 0.55), transparent 72%),
    radial-gradient(1000px 220px at 88% -50%, rgba(139, 116, 255, 0.5), transparent 72%),
    radial-gradient(700px 150px at 50% -30%, rgba(87, 224, 176, 0.14), transparent 70%),
    linear-gradient(
      to bottom,
      var(--bg-0) 0%,
      rgba(5, 6, 13, 0.88) 42%,
      rgba(5, 6, 13, 0.45) 72%,
      transparent 100%
    );
}

.header-inner {
  position: relative;
  z-index: 1;
  pointer-events: auto;
}

.title {
  margin: 0;
  font-size: 28px;
  font-weight: 900;
  color: var(--text-0);
  letter-spacing: -0.5px;
  text-shadow: 0 2px 10px var(--shadow-1);
}

.content-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 4px;
}

.subtitle {
  margin: 0 0 2px 0;
  color: var(--text-2);
  font-size: 13px;
}
</style>
