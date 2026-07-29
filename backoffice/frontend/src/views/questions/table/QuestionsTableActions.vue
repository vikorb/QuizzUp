<template>
  <div class="actions">
    <QuestionsTableActionsSwitch
      :question="props.item"
      :current-role="currentRole"
      :disabled="deleteBusy"
      @updated="handleQuestionUpdated"
      @error="handleActionError"
      @busy-change="handleSwitchBusyChange"
    />

    <UiButton
      class="icon"
      :class="{ 'icon-edit': canEdit }"
      variant="icon"
      type="button"
      :disabled="isBusy"
      :title="canEdit ? $t('questions.actions.edit') : $t('questions.actions.readonly')"
      :aria-label="canEdit ? $t('questions.actions.edit') : $t('questions.actions.readonly')"
      @click="handleEditQuestion"
    >
      <MdIcon :path="openIcon" :size="18" />
    </UiButton>

    <UiButton
      class="icon icon-delete"
      variant="icon"
      type="button"
      :disabled="isBusy || !canDelete"
      :title="$t('questions.actions.delete')"
      :aria-label="$t('questions.actions.delete')"
      @click="handleDeleteQuestion"
    >
      <MdIcon :path="mdiDeleteOutline" :size="18" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { mdiDeleteOutline, mdiEyeOutline, mdiPencilOutline } from '@mdi/js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { deleteQuestionService } from '@/services/questionsService'
import type { Question } from '@/types/question'
import { canDeleteQuestion, canUpdateQuestion } from '@/utils/question/permissions'

import QuestionsTableActionsSwitch from './QuestionsTableActionsSwitch.vue'

const props = defineProps<{
  item: Question
  currentRole: string | null
}>()

const emit = defineEmits<{
  (event: 'edit', questionId: number): void
  (event: 'updated', question: Question): void
  (event: 'deleted', questionId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()
const { confirm } = useConfirm()
const deleteBusy = ref(false)
const switchBusy = ref(false)

const isBusy = computed(() => deleteBusy.value || switchBusy.value)
const canEdit = computed(() => canUpdateQuestion(props.item, props.currentRole))
const canDelete = computed(() => canDeleteQuestion(props.item, props.currentRole))
const openIcon = computed(() => (canEdit.value ? mdiPencilOutline : mdiEyeOutline))

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
  if (isBusy.value) {
    return
  }

  emit('edit', props.item.id)
}

async function handleDeleteQuestion(): Promise<void> {
  if (isBusy.value || !canDelete.value) {
    return
  }

  const confirmed = await confirm({
    title: t('questions.actions.delete'),
    message: t('questions.actions.deleteConfirm', {
      question: props.item.question,
    }),
    confirmLabel: t('questions.actions.delete'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

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

/* Icônes d'action codées couleur : éditer = bleu doux, supprimer = danger. */
.icon-edit {
  color: var(--edit);
}

.icon-delete {
  color: var(--danger);
}
</style>
