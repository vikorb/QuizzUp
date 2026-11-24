<template>
  <slot :n="shown">{{ shown }}</slot>
</template>

<script setup lang="ts">
import { useTweenedNumber } from '@/composables/useTweenedNumber'

const props = defineProps<{
  value: number
  /** Monte depuis 0 à l'apparition (podium) au lieu de s'afficher d'emblée à la valeur. */
  fromZero?: boolean
}>()

const shown = useTweenedNumber(() => props.value, props.fromZero ? { from: 0 } : {})
</script>
