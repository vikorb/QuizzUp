<template>
  <div class="ui-card">
    <slot />
  </div>
</template>

<style scoped>
.ui-card {
  border-radius: 20px;
  border: 1px solid var(--border-ui);
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  transition: var(--tr);
}
</style>
