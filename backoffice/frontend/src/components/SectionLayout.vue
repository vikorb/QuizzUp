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
  backdrop-filter: blur(85px) saturate(260%) brightness(1.12);
  -webkit-backdrop-filter: blur(85px) saturate(260%) brightness(1.12);
  -webkit-mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 62%,
    rgba(0, 0, 0, 0.7) 78%,
    rgba(0, 0, 0, 0.35) 90%,
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    #000 0%,
    #000 62%,
    rgba(0, 0, 0, 0.7) 78%,
    rgba(0, 0, 0, 0.35) 90%,
    transparent 100%
  );
  background:
    radial-gradient(900px 160px at 20% 0%, rgba(0, 98, 255, 0.14), transparent 72%),
    radial-gradient(900px 160px at 80% 0%, rgba(237, 46, 251, 0.12), transparent 72%),
    linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.74) 0%,
      rgba(0, 0, 0, 0.62) 55%,
      rgba(0, 0, 0, 0.4) 82%,
      rgba(0, 0, 0, 0) 100%
    );
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}

.content-body {
  position: relative;
  z-index: 1;
}

.subtitle {
  margin: 8px 0 24px 0;
  color: var(--text-2);
  font-size: 13px;
}
</style>
