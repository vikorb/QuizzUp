<template>
  <NavbarFrame :with-sidebar="canShowSidebar">
    <template v-if="canShowSidebar" #sidebar>
      <SideBar class="sidebar" />
    </template>
  </NavbarFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import NavbarFrame from '@/components/NavbarFrame.vue'
import { isAuthenticated } from '@/state/authState';
import SideBar from '@/views/navbar/SideBar.vue'

const canShowSidebar = computed(() => isAuthenticated.value)
</script>

<style scoped>
.sidebar {
  min-height: 0;
  overflow: auto;
}
</style>
