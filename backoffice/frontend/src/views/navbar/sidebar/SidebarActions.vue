<template>
  <div class="sidebar-actions">
    <div class="sep"></div>

    <NavGroup :label="$t('navbar.language')">
      <LanguageSwitcher variant="mobile" :show-label="false" />
    </NavGroup>

    <NavGroup :label="$t('navbar.account')">
      <AuthButton variant="sidebar" />
    </NavGroup>
  </div>
</template>

<script setup lang="ts">
import AuthButton from '@/components/AuthButton.vue';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import NavGroup from '@/components/NavGroup.vue'
</script>

<style scoped>
.sidebar-actions {
  padding-top: 10px;
}

.sep {
  height: 1px;
  background: var(--border-ui);
  margin: 12px 4px 14px;
}

.account__btn {
  width: 100%;
  border-radius: 14px;
  padding: 12px 14px;
}
</style>
