<template>
  <slot :n="shown">{{ shown }}</slot>
</template>

<script setup lang="ts">
import { useTweenedNumber } from '@/composables/useTweenedNumber'

const props = defineProps<{
  value: number
  /** Monte depuis cette valeur à l'apparition au lieu de s'afficher d'emblée à la valeur. */
  from?: number
}>()

const shown = useTweenedNumber(() => props.value, { from: props.from })
</script>
