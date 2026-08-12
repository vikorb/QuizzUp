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
  box-shadow: 0 20px 40px var(--shadow-2);
  overflow: hidden;
  transition: var(--tr);
}
</style>
