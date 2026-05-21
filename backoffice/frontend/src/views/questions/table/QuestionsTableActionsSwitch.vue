<template>
  <div class="question-switch">
    <SwitchField
      :model-value="isActive"
      :disabled="isSwitchDisabled"
      :label="switchTitle"
      @change="toggleStatus"
    />
  </div>
</template>

<script setup lang="ts">
import {
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_INACTIVE,
  type QuestionStatus,
} from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import { updateQuestionStatusService } from '@/services/questionsService'
import type { Question } from '@/types/question'

const props = withDefaults(
  defineProps<{
    question: Question
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  (event: 'updated', question: Question): void
  (event: 'error', errorCode: string): void
  (event: 'busy-change', value: boolean): void
}>()

const { t } = useI18n()
const busy = ref(false)

const currentStatus = computed<QuestionStatus>(() => toQuestionStatus(props.question.status))
const isActive = computed(() => currentStatus.value === QUESTION_STATUS_ACTIVE)
const isDeleted = computed(() => currentStatus.value === QUESTION_STATUS_DELETED)
const canEdit = computed(() => props.question.canEdit !== false)

const isSwitchDisabled = computed(
  () => props.disabled || busy.value || isDeleted.value || !canEdit.value,
)

const switchTitle = computed(() =>
  isActive.value ? t('questions.actions.disable') : t('questions.actions.enable'),
)

function toQuestionStatus(status: unknown): QuestionStatus {
  if (
    status === QUESTION_STATUS_ACTIVE ||
    status === QUESTION_STATUS_INACTIVE ||
    status === QUESTION_STATUS_DELETED
  ) {
    return status
  }

  return QUESTION_STATUS_INACTIVE
}

function setBusy(value: boolean): void {
  busy.value = value
  emit('busy-change', value)
}

async function toggleStatus(): Promise<void> {
  if (isSwitchDisabled.value) {
    return
  }

  const nextStatus = isActive.value ? QUESTION_STATUS_INACTIVE : QUESTION_STATUS_ACTIVE

  const confirmKey = isActive.value
    ? 'questions.actions.disableConfirm'
    : 'questions.actions.enableConfirm'

  const confirmed = window.confirm(
    t(confirmKey, {
      question: props.question.question,
    }),
  )

  if (!confirmed) {
    return
  }

  setBusy(true)

  try {
    const result = await updateQuestionStatusService(props.question.id, nextStatus)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', {
      ...props.question,
      ...result.question,
      status: nextStatus,
    })
  } finally {
    setBusy(false)
  }
}
</script>

<style scoped>
.question-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
