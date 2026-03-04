<template>
  <div class="nav-group">
    <div class="nav-label">{{ label }}</div>
    <RouterLink 
      v-for="item in items" 
      :key="item.to" 
      :to="item.to" 
      class="nav-link" 
      active-class="is-active"
    >
      <span class="icon">{{ item.icon }}</span> 
      {{ $t(item.labelKey) }}
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
interface NavItem {
  to: string;
  icon: string;
  labelKey: string;
}

defineProps<{
  label: string;
  items: NavItem[];
}>();
</script>

<style scoped>
.nav-group { margin-bottom: 24px; }
.nav-label { 
  font-size: 11px; color: var(--text-3); 
  text-transform: uppercase; letter-spacing: 1px;
  margin-bottom: 8px; padding-left: 12px;
}
.nav-link {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border-radius: 12px;
  color: var(--text-1); text-decoration: none;
  transition: var(--tr);
}
.nav-link:hover { background: rgba(255,255,255,0.05); color: var(--text-0); }
.nav-link.is-active {
  background: rgba(139, 92, 246, 0.1);
  color: var(--accent-cyan);
}
</style>
