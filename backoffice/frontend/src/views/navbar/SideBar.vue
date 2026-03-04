<template>
  <nav class="sidebar">
    <NavGroup 
      :label="$t('navbar.dashboard')" 
      :items="[{ to: '/', icon: '⌂', labelKey: 'navbar.home' }]" 
    />
    
    <NavGroup 
      :label="$t('navbar.manage')" 
      :items="navManage" 
    />

    <NavGroup 
      :label="$t('navbar.live')" 
      :items="navPlay" 
    />
  </nav>
</template>

<script setup lang="ts">
import NavGroup from '@/components/NavGroup.vue';


const navManage = [
  { to: '/players', icon: '👤', labelKey: 'navbar.players' },
  { to: '/themes', icon: '🧩', labelKey: 'navbar.themes' },
  { to: '/questions', icon: '❓', labelKey: 'navbar.questionsAnswers' }
]

const navPlay = [
  { to: '/games', icon: '▶', labelKey: 'navbar.games' },
  { to: '/stats', icon: '⟠', labelKey: 'navbar.statistics' }
]
</script>

<style scoped>
.sidebar { width: 100%; }
</style>
