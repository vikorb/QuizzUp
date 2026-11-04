<template>
  <BaseCard
    id="room-form"
    :title="$t(titleKey)"
    :neon="true"
    :no-hover="true"
    class="room-form-card"
  >
    <form class="room-form" @submit.prevent="onSubmit">
      <FormField
        id="room-name"
        v-model="form.name"
        :label="$t('rooms.form.fields.name.label')"
        name="name"
        autocomplete="off"
        :placeholder="$t('rooms.form.fields.name.placeholder')"
        :disabled="loading"
        :error="fieldErrors.name"
        required
      />

      <FormResult :error="formError" />

      <FormActions
        :cancel-label="$t('rooms.form.actions.cancel')"
        :submit-label="$t(submitKey)"
        :submitting-label="$t('rooms.form.actions.submitting')"
        :loading="loading"
        :disabled="loading"
        @cancel="emit('cancel')"
      />

      <p class="room-form__hint">
        {{ $t(hintKey) }}
      </p>
    </form>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import { createCompanyRoomService, updateCompanyRoomService } from '@/services/roomsService'
import type { Room, RoomFieldErrors, RoomFormMode, RoomFormValues } from '@/types/room'
import {
  buildCreateRoomPayload,
  buildUpdateRoomPayload,
  createRoomFieldErrors,
  getRoomApiFieldError,
  getRoomApiFormError,
  getRoomFormSubmitKey,
  getRoomFormTitleKey,
  getRoomFormValues,
  hasRoomFormErrors,
  validateRoomForm,
} from '@/utils/room/form'

const props = withDefaults(
  defineProps<{
    mode: RoomFormMode
    companyId: number
    room?: Room | null
  }>(),
  {
    room: null,
  }
)

const emit = defineEmits<{
  (event: 'saved', room: Room): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

const loading = ref(false)
const formError = ref<string | null>(null)
const form = reactive<RoomFormValues>(getRoomFormValues(props.room))
const fieldErrors = reactive<RoomFieldErrors>(createRoomFieldErrors())

const titleKey = computed(() => getRoomFormTitleKey(props.mode))
const submitKey = computed(() => getRoomFormSubmitKey(props.mode))
const hintKey = computed(() =>
  props.mode === 'edit' ? 'rooms.form.hints.edit' : 'rooms.form.hints.create'
)

function resetMessages(): void {
  formError.value = null
  fieldErrors.name = undefined
}

// Le même formulaire sert à créer puis à renommer : on le resynchronise à chaque ouverture.
watch(
  () => [props.mode, props.room] as const,
  () => {
    Object.assign(form, getRoomFormValues(props.mode === 'edit' ? props.room : null))
    resetMessages()
  }
)

function validateForm(): boolean {
  const errors = validateRoomForm(form, t)

  Object.assign(fieldErrors, errors)

  return !hasRoomFormErrors(errors)
}

async function onSubmit(): Promise<void> {
  if (loading.value) {
    return
  }

  resetMessages()

  if (!validateForm()) {
    return
  }

  if (props.mode === 'edit' && !props.room) {
    formError.value = t('rooms.form.errors.not_found')
    return
  }

  loading.value = true

  try {
    const result =
      props.mode === 'edit' && props.room
        ? await updateCompanyRoomService(
            props.companyId,
            props.room.id,
            buildUpdateRoomPayload(form)
          )
        : await createCompanyRoomService(props.companyId, buildCreateRoomPayload(form))

    if (!result.ok) {
      const apiFieldError = getRoomApiFieldError(result.error, t)

      if (apiFieldError) {
        fieldErrors[apiFieldError.field] = apiFieldError.message
        return
      }

      formError.value = getRoomApiFormError(result.error, t)
      return
    }

    emit('saved', result.data.room)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.room-form-card {
  margin-top: 10px;
  scroll-margin-top: 90px;
}

.room-form {
  display: grid;
  gap: 14px;
}

.room-form__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
