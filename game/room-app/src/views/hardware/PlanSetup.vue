<template>
  <section class="hw-panel" data-test="plan-tab">
    <header class="hw-panel__head">
      <h2 class="hw-panel__title">{{ $t('hardware.plan.title') }}</h2>
      <p class="hw-hint">{{ $t('hardware.plan.hint') }}</p>
    </header>
    <RoomPlan
      :config="hardware.config"
      @move="(target, point) => saveRoomPlanPoint(target, point)"
    />
  </section>
</template>

<script setup lang="ts">
import RoomPlan from '@/components/hardware/RoomPlan.vue'
import { saveRoomPlanPoint, useRoomHardware } from '@/hardware/roomHardware'

const { hardware } = useRoomHardware()
</script>
