<template>
  <BaseCard
    id="room-account"
    :title="$t('rooms.account.title', { name: roomName })"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="loadError"
    :loading-label="$t('rooms.account.loading')"
    error-namespace="rooms.errors"
    class="room-account-card"
  >
    <template #actions>
      <UiButton v-if="loadError" variant="default" type="button" @click="loadAccount">
        {{ $t('rooms.table.retry') }}
      </UiButton>

      <UiButton
        class="room-account__close"
        variant="icon"
        type="button"
        :disabled="busy"
        :title="$t('rooms.account.actions.close')"
        :aria-label="$t('rooms.account.actions.close')"
        @click="emit('close')"
      >
        <MdIcon :path="mdiClose" :size="18" />
      </UiButton>
    </template>

    <div v-if="account" class="room-account" data-account="set">
      <span class="room-account__state room-account__state--set">
        <MdIcon :path="mdiMonitorAccount" :size="14" />
        {{ $t('rooms.account.state.set') }}
      </span>

      <dl class="room-account__details">
        <div class="room-account__detail">
          <dt>{{ $t('rooms.account.details.username') }}</dt>
          <dd class="room-account__username">{{ account.username }}</dd>
        </div>

        <div class="room-account__detail">
          <dt>{{ $t('rooms.account.details.createdAt') }}</dt>
          <dd>{{ createdAtLabel }}</dd>
        </div>
      </dl>

      <p class="room-account__hint">
        {{ $t('rooms.account.hints.existing') }}
      </p>

      <div class="room-account__danger">
        <p class="room-account__danger-text">
          {{ $t('rooms.account.hints.delete') }}
        </p>

        <UiButton
          class="room-account__delete"
          variant="danger"
          type="button"
          :disabled="busy"
          @click="handleDeleteAccount"
        >
          <MdIcon :path="mdiDeleteOutline" :size="18" />
          {{ $t(deleting ? 'rooms.account.actions.deleting' : 'rooms.account.actions.delete') }}
        </UiButton>
      </div>
    </div>

    <form v-else class="room-account" data-account="unset" @submit.prevent="onSubmit">
      <span class="room-account__state">
        <MdIcon :path="mdiMinusCircleOutline" :size="14" />
        {{ $t('rooms.account.state.unset') }}
      </span>

      <FormField
        id="room-account-username"
        v-model="form.username"
        :label="$t('rooms.account.fields.username.label')"
        name="username"
        autocomplete="off"
        :placeholder="$t('rooms.account.fields.username.placeholder')"
        :hint="$t('rooms.account.fields.username.hint')"
        :disabled="busy"
        :error="fieldErrors.username"
        required
      />

      <FormField
        id="room-account-password"
        v-model="form.password"
        :label="$t('rooms.account.fields.password.label')"
        name="password"
        type="password"
        autocomplete="new-password"
        :placeholder="$t('rooms.account.fields.password.placeholder')"
        :hint="$t('rooms.account.fields.password.hint')"
        :disabled="busy"
        :error="fieldErrors.password"
        required
      />

      <FormField
        id="room-account-password-confirm"
        v-model="form.passwordConfirm"
        :label="$t('rooms.account.fields.passwordConfirm.label')"
        name="passwordConfirm"
        type="password"
        autocomplete="new-password"
        :placeholder="$t('rooms.account.fields.passwordConfirm.placeholder')"
        :disabled="busy"
        :error="fieldErrors.passwordConfirm"
        required
      />

      <FormResult :error="formError" />

      <FormActions
        :cancel-label="$t('rooms.account.actions.cancel')"
        :submit-label="$t('rooms.account.actions.create')"
        :submitting-label="$t('rooms.account.actions.submitting')"
        :loading="creating"
        :disabled="busy"
        @cancel="emit('close')"
      />

      <p class="room-account__hint">
        {{ $t('rooms.account.hints.create') }}
      </p>
    </form>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiClose, mdiDeleteOutline, mdiMinusCircleOutline, mdiMonitorAccount } from '@mdi/js'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  createRoomAccountService,
  deleteRoomAccountService,
  loadRoomAccountService,
} from '@/services/roomsService'
import type { Room, RoomAccount, RoomAccountFieldErrors, RoomAccountFormValues } from '@/types/room'
import {
  buildCreateRoomAccountPayload,
  createDefaultRoomAccountFormValues,
  createRoomAccountFieldErrors,
  formatRoomAccountDate,
  getRoomAccountApiFieldError,
  getRoomAccountApiFormError,
  hasRoomAccountFormErrors,
  validateRoomAccountForm,
} from '@/utils/room/account'
import { getRoomDisplayName } from '@/utils/room/list'

const props = defineProps<{
  companyId: number
  room: Room
}>()

const emit = defineEmits<{
  (event: 'created', account: RoomAccount): void
  (event: 'deleted', account: RoomAccount): void
  (event: 'error', errorCode: string): void
  (event: 'close'): void
}>()

const { t, locale } = useI18n()
const { confirm } = useConfirm()

const account = ref<RoomAccount | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const creating = ref(false)
const deleting = ref(false)
const formError = ref<string | null>(null)
const form = reactive<RoomAccountFormValues>(createDefaultRoomAccountFormValues())
const fieldErrors = reactive<RoomAccountFieldErrors>(createRoomAccountFieldErrors())

const busy = computed(() => loading.value || creating.value || deleting.value)
const roomName = computed(() => getRoomDisplayName(props.room))
const createdAtLabel = computed(() =>
  account.value ? formatRoomAccountDate(account.value.createdAt, String(locale.value)) : ''
)

function resetMessages(): void {
  formError.value = null
  fieldErrors.username = undefined
  fieldErrors.password = undefined
  fieldErrors.passwordConfirm = undefined
}

function resetForm(): void {
  Object.assign(form, createDefaultRoomAccountFormValues())
  resetMessages()
}

async function loadAccount(): Promise<void> {
  loadError.value = null
  loading.value = true

  try {
    const result = await loadRoomAccountService(props.companyId, props.room.id)

    if (!result.ok) {
      account.value = null
      loadError.value = result.error
      return
    }

    account.value = result.data.account
  } finally {
    loading.value = false
  }
}

async function onSubmit(): Promise<void> {
  if (busy.value) {
    return
  }

  resetMessages()

  const errors = validateRoomAccountForm(form, t)

  Object.assign(fieldErrors, errors)

  if (hasRoomAccountFormErrors(errors)) {
    return
  }

  creating.value = true

  try {
    const result = await createRoomAccountService(
      props.companyId,
      props.room.id,
      buildCreateRoomAccountPayload(form)
    )

    if (!result.ok) {
      const apiFieldError = getRoomAccountApiFieldError(result.error, t)

      if (apiFieldError) {
        fieldErrors[apiFieldError.field] = apiFieldError.message
        return
      }

      // Compte créé entre-temps (autre onglet) : on affiche l'existant et on le signale.
      if (result.error === 'room_account_already_exists' && (await showExistingAccount())) {
        emit('error', result.error)
        return
      }

      formError.value = getRoomAccountApiFormError(result.error, t)
      return
    }

    account.value = result.data.account
    resetForm()
    emit('created', result.data.account)
  } finally {
    creating.value = false
  }
}

async function showExistingAccount(): Promise<boolean> {
  const result = await loadRoomAccountService(props.companyId, props.room.id)

  if (!result.ok || !result.data.account) {
    return false
  }

  account.value = result.data.account
  resetForm()

  return true
}

async function handleDeleteAccount(): Promise<void> {
  const currentAccount = account.value

  if (busy.value || !currentAccount) {
    return
  }

  const confirmed = await confirm({
    title: t('rooms.account.actions.delete'),
    message: t('rooms.account.actions.deleteConfirm', {
      username: currentAccount.username,
      name: roomName.value,
    }),
    confirmLabel: t('rooms.account.actions.delete'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  deleting.value = true

  try {
    const result = await deleteRoomAccountService(props.companyId, props.room.id)

    if (!result.ok) {
      // Déjà supprimé ailleurs : l'état affiché redevient « aucun compte ».
      if (result.error === 'room_account_not_found') {
        account.value = null
      }

      emit('error', result.error)
      return
    }

    account.value = null
    resetForm()
    emit('deleted', currentAccount)
  } finally {
    deleting.value = false
  }
}

watch(
  () => [props.companyId, props.room.id] as const,
  () => {
    account.value = null
    resetForm()
    loadAccount()
  },
  { immediate: true }
)
</script>

<style scoped>
.room-account-card {
  margin-top: 10px;
  scroll-margin-top: 90px;
}

.room-account {
  display: grid;
  gap: 14px;
}

/* Même puce que la colonne « Configuration matérielle » du tableau des salles. */
.room-account__state {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.room-account__state--set {
  border-color: var(--edit);
  color: var(--edit);
  background: var(--edit-bg);
}

.room-account__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 0;
}

.room-account__detail {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}

.room-account__detail dt {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
}

.room-account__detail dd {
  margin: 0;
  color: var(--text-1);
}

.room-account__username {
  font-weight: 800;
  color: var(--text-0);
  word-break: break-all;
}

.room-account__danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 10px 12px;
  border: 1px solid var(--danger);
  border-radius: 12px;
  background: var(--danger-bg);
}

.room-account__danger-text {
  flex: 1 1 260px;
  margin: 0;
  font-size: 13px;
  color: var(--text-1);
}

.room-account__close {
  color: var(--text-2);
}

.room-account__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
