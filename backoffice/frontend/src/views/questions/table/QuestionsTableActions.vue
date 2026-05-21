<template>
  <div class="actions">
    <QuestionsTableActionsSwitch
      :question="props.item"
      :disabled="deleteBusy"
      @updated="handleQuestionUpdated"
      @error="handleActionError"
      @busy-change="handleSwitchBusyChange"
    />

    <UiButton
      class="icon"
      variant="icon"
      type="button"
      :disabled="isBusy || !canEdit"
      :title="canEdit ? $t('questions.actions.edit') : $t('questions.actions.readonly')"
      :aria-label="canEdit ? $t('questions.actions.edit') : $t('questions.actions.readonly')"
      @click="handleEditQuestion"
    >
      <MdIcon :path="mdiPencilOutline" :size="18" />
    </UiButton>

    <UiButton
      class="icon icon-delete"
      variant="icon"
      type="button"
      :disabled="isBusy || !canEdit"
      :title="$t('questions.actions.delete')"
      :aria-label="$t('questions.actions.delete')"
      @click="handleDeleteQuestion"
    >
      <MdIcon :path="mdiDeleteOutline" :size="18" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { mdiDeleteOutline, mdiPencilOutline } from '@mdi/js'
import { QUESTION_STATUS_DELETED } from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { deleteQuestionService } from '@/services/questionsService'
import type { Question } from '@/types/question'

import QuestionsTableActionsSwitch from './QuestionsTableActionsSwitch.vue'

const props = defineProps<{
  item: Question
}>()

const emit = defineEmits<{
  (event: 'edit', questionId: number): void
  (event: 'updated', question: Question): void
  (event: 'deleted', questionId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()
const deleteBusy = ref(false)
const switchBusy = ref(false)

const isBusy = computed(() => deleteBusy.value || switchBusy.value)
const isDeleted = computed(() => props.item.status === QUESTION_STATUS_DELETED)
const canEdit = computed(() => props.item.canEdit !== false && !isDeleted.value)

function handleSwitchBusyChange(value: boolean): void {
  switchBusy.value = value
}

function handleQuestionUpdated(updatedQuestion: Question): void {
  emit('updated', updatedQuestion)
}

function handleActionError(errorCode: string): void {
  emit('error', errorCode)
}

function handleEditQuestion(): void {
  if (isBusy.value || !canEdit.value) {
    return
  }

  emit('edit', props.item.id)
}

async function handleDeleteQuestion(): Promise<void> {
  if (isBusy.value || !canEdit.value) {
    return
  }

  const confirmed = window.confirm(
    t('questions.actions.deleteConfirm', {
      question: props.item.question,
    }),
  )

  if (!confirmed) {
    return
  }

  deleteBusy.value = true

  try {
    await deleteQuestionService(props.item.id)
    emit('deleted', props.item.id)
  } catch {
    emit('error', 'deleteFailed')
  } finally {
    deleteBusy.value = false
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

.icon-delete {
  color: #ff6b6b;
}
</style>
