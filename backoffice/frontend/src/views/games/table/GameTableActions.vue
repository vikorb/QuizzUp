<template>
  <div class="actions">
    <UiButton
      class="icon icon-view"
      variant="icon"
      type="button"
      data-test="game-view"
      :disabled="busy"
      :title="$t('games.actions.view')"
      :aria-label="$t('games.actions.view')"
      @click="emit('open', props.item.id)"
    >
      <MdIcon :path="mdiEyeOutline" :size="18" />
    </UiButton>

    <UiButton
      class="icon icon-abort"
      variant="icon"
      type="button"
      data-test="game-abort"
      :disabled="busy || !canAbort"
      :title="$t('games.actions.abort')"
      :aria-label="$t('games.actions.abort')"
      @click="handleAbort"
    >
      <MdIcon :path="mdiStopCircleOutline" :size="18" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { mdiEyeOutline, mdiStopCircleOutline } from '@mdi/js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { abortGameService } from '@/services/gamesService'
import type { Game } from '@/types/game'
import { getGameRoomName } from '@/utils/game/format'
import { canAbortGame } from '@/utils/game/state'

const props = defineProps<{
  companyId: number
  item: Game
}>()

const emit = defineEmits<{
  (event: 'open', gameId: number): void
  (event: 'aborted', game: Game): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()
const { confirm } = useConfirm()

const busy = ref(false)
const canAbort = computed(() => canAbortGame(props.item))

async function handleAbort(): Promise<void> {
  if (busy.value || !canAbort.value) {
    return
  }

  const confirmed = await confirm({
    title: t('games.actions.abortTitle'),
    message: t('games.actions.abortConfirm', {
      room: getGameRoomName(props.item),
    }),
    confirmLabel: t('games.actions.abort'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  busy.value = true

  try {
    const result = await abortGameService(props.companyId, props.item.id)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('aborted', result.data.game)
  } catch {
    emit('error', 'server_error')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

/* Icônes d'action codées couleur : voir = bleu doux, arrêter = danger. */
.icon-view {
  color: var(--edit);
}

.icon-abort {
  color: var(--danger);
}
</style>
