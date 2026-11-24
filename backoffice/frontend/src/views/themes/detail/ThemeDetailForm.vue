<template>
  <form class="theme-form" @submit.prevent="submitForm">
    <BaseBanner v-if="isReadonly" :message="$t('themes.form.readonly')" />

    <div class="theme-form__grid">
      <FormField
        v-model="form.name"
        :label="$t('themes.form.name')"
        name="name"
        :placeholder="$t('themes.form.namePlaceholder')"
        :disabled="saving || isReadonly"
        :error="getErrorLabel(errors.name)"
        required
      />

      <SelectField
        id="theme-mode"
        v-model="form.mode"
        :label="$t('themes.form.mode')"
        :options="modeOptions"
        :disabled="saving || isReadonly"
        :error="getErrorLabel(errors.mode)"
        required
      />
    </div>

    <FormField
      v-if="form.mode === THEME_MODE_AUDIO"
      v-model="form.playlistLink"
      :label="$t('themes.form.playlistLink')"
      name="playlistLink"
      inputmode="url"
      autocomplete="off"
      :placeholder="$t('themes.form.playlistLinkPlaceholder')"
      :hint="$t('themes.form.playlistLinkHint')"
      :disabled="saving || isReadonly"
      :error="getErrorLabel(errors.playlistLink)"
    />

    <div v-if="isSuperAdmin" class="theme-form__grid">
      <SelectField
        id="theme-scope"
        v-model="form.scope"
        :label="$t('themes.form.scope')"
        :options="scopeOptions"
        :disabled="saving || isReadonly || mode === 'edit'"
      />

      <FormField
        v-if="form.scope === THEME_SCOPE_COMPANY"
        v-model="form.companyId"
        :label="$t('themes.form.companyId')"
        name="companyId"
        inputmode="numeric"
        :placeholder="$t('themes.form.companyIdPlaceholder')"
        :disabled="saving || isReadonly || mode === 'edit'"
        :error="getErrorLabel(errors.companyId)"
      />
    </div>

    <FormStatusToggle
      v-if="mode === 'edit' && canEdit"
      :active="isThemeActive"
      :label="$t('themes.form.status.label')"
      :help="statusHelp"
      :disabled="saving || isThemeDeleted"
      :pending="isStatusPending"
      @toggle="toggleStatus"
    />

    <FormResult :error="formError" :success="formSuccess" />

    <FormActions
      v-if="canSubmit"
      :cancel-label="$t('themes.form.cancel')"
      :submit-label="submitLabel"
      :submitting-label="$t('themes.form.saving')"
      :loading="saving"
      :disabled="saving"
      @cancel="emit('cancel')"
    />

    <div v-else class="theme-form__readonly-actions">
      <UiButton type="button" variant="default" @click="emit('cancel')">
        {{ $t('themes.form.back') }}
      </UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import {
  ADMIN_ROLE_SUPERADMIN,
  THEME_MODE_AUDIO,
  THEME_MODE_CLASSIC,
  THEME_MODE_IMAGE,
  THEME_MODE_MIXED,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUS_INACTIVE,
  type ThemeMode,
  type ThemeScope,
  type ThemeStatus,
} from '@quizzup/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseBanner from '@/components/ui/BaseBanner.vue'
import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import FormStatusToggle from '@/components/ui/form/FormStatusToggle.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  createThemeService,
  updateThemeService,
  updateThemeStatusService,
} from '@/services/themesService'
import { authState } from '@/state/authState'
import type { SelectFieldOption } from '@/types/form'
import type { Theme, ThemePayload } from '@/types/theme'
import { getApiErrorKey } from '@/utils/api'
import { extractPlaylistRef } from '@/utils/theme/playlist'

const props = defineProps<{
  theme: Theme | null
  mode: 'create' | 'edit'
  canEdit: boolean
}>()

const emit = defineEmits<{
  (event: 'saved', theme: Theme): void
  (event: 'cancel'): void
  (event: 'error', errorCode: string): void
}>()

const { t, te } = useI18n()

const form = reactive({
  name: '',
  mode: THEME_MODE_CLASSIC as ThemeMode,
  scope: THEME_SCOPE_GLOBAL as ThemeScope,
  companyId: '',
  playlistLink: '',
  status: THEME_STATUS_ACTIVE as ThemeStatus,
})

const errors = reactive({
  name: '',
  mode: '',
  companyId: '',
  playlistLink: '',
})

const saving = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const currentRole = computed(() => authState.me.value?.role ?? null)
const isSuperAdmin = computed(() => currentRole.value === ADMIN_ROLE_SUPERADMIN)
const isReadonly = computed(() => props.mode === 'edit' && !props.canEdit)
const canSubmit = computed(() => props.mode === 'create' || props.canEdit)

const isThemeActive = computed(() => form.status === THEME_STATUS_ACTIVE)
const isThemeDeleted = computed(() => form.status === THEME_STATUS_DELETED)
const isStatusPending = computed(() => Boolean(props.theme) && form.status !== props.theme?.status)

const statusHelp = computed(() => {
  if (isStatusPending.value) {
    return isThemeActive.value
      ? t('themes.form.status.pendingActiveHelp')
      : t('themes.form.status.pendingInactiveHelp')
  }

  return isThemeActive.value
    ? t('themes.form.status.activeHelp')
    : t('themes.form.status.inactiveHelp')
})

function toThemeStatus(status: unknown): ThemeStatus {
  if (
    status === THEME_STATUS_ACTIVE ||
    status === THEME_STATUS_INACTIVE ||
    status === THEME_STATUS_DELETED ||
    status === THEME_STATUS_DRAFT
  ) {
    return status
  }

  return THEME_STATUS_INACTIVE
}

function toggleStatus(): void {
  form.status = isThemeActive.value ? THEME_STATUS_INACTIVE : THEME_STATUS_ACTIVE
}

const submitLabel = computed(() =>
  props.mode === 'edit' ? t('themes.form.save') : t('themes.form.create')
)

const modeOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('themes.mode.classic'),
    value: THEME_MODE_CLASSIC,
  },
  {
    label: t('themes.mode.image'),
    value: THEME_MODE_IMAGE,
  },
  {
    label: t('themes.mode.audio'),
    value: THEME_MODE_AUDIO,
  },
  {
    label: t('themes.mode.mixed'),
    value: THEME_MODE_MIXED,
  },
])

const scopeOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('themes.scope.global'),
    value: THEME_SCOPE_GLOBAL,
  },
  {
    label: t('themes.scope.company'),
    value: THEME_SCOPE_COMPANY,
  },
])

watch(
  () => props.theme,
  (theme) => {
    resetMessages()

    if (!theme) {
      form.name = ''
      form.mode = THEME_MODE_CLASSIC
      form.scope = isSuperAdmin.value ? THEME_SCOPE_GLOBAL : THEME_SCOPE_COMPANY
      form.companyId = ''
      form.playlistLink = ''
      form.status = THEME_STATUS_ACTIVE

      return
    }

    form.name = theme.name
    form.mode = theme.mode
    form.scope = theme.scope
    form.companyId = theme.companyId ? String(theme.companyId) : ''
    form.playlistLink = theme.playlistRef ?? ''
    form.status = toThemeStatus(theme.status)
  },
  { immediate: true }
)

function resetErrors(): void {
  errors.name = ''
  errors.mode = ''
  errors.companyId = ''
  errors.playlistLink = ''
}

function resetMessages(): void {
  resetErrors()
  formError.value = null
  formSuccess.value = null
}

function getErrorLabel(errorKey: string): string | undefined {
  return errorKey ? t(errorKey) : undefined
}

function validateForm(): boolean {
  resetErrors()

  if (!form.name.trim()) {
    errors.name = 'themes.form.errors.nameRequired'
  }

  if (!form.mode) {
    errors.mode = 'themes.form.errors.modeRequired'
  }

  if (
    isSuperAdmin.value &&
    form.scope === THEME_SCOPE_COMPANY &&
    form.companyId.trim() &&
    !Number.isInteger(Number(form.companyId))
  ) {
    errors.companyId = 'themes.form.errors.companyIdInvalid'
  }

  if (
    form.mode === THEME_MODE_AUDIO &&
    form.playlistLink.trim() &&
    !extractPlaylistRef(form.playlistLink)
  ) {
    errors.playlistLink = 'themes.form.errors.playlistLinkInvalid'
  }

  return !errors.name && !errors.mode && !errors.companyId && !errors.playlistLink
}

function buildPayload(): ThemePayload {
  const payload: ThemePayload = {
    name: form.name.trim(),
    mode: form.mode,
  }

  if (isSuperAdmin.value) {
    payload.scope = form.scope

    if (form.scope === THEME_SCOPE_COMPANY) {
      payload.companyId = form.companyId.trim() ? Number(form.companyId) : null
    }
  }

  // La playlist n'existe qu'en mode audio : ailleurs le serveur l'efface lui-mÍme.
  if (form.mode === THEME_MODE_AUDIO) {
    const playlistRef = extractPlaylistRef(form.playlistLink)

    if (playlistRef || props.theme?.playlistRef) {
      payload.playlistRef = playlistRef
    }
  }

  return payload
}

/** Les codes de playlist ont leur texte ; les autres passent par les erreurs gÈnÈriques. */
function getSaveErrorKey(code: string): string {
  const key = `themes.errors.apiErrors.${code}`

  return te(key) ? key : getApiErrorKey(code, 'themes.errors')
}

async function submitForm(): Promise<void> {
  if (saving.value || !canSubmit.value) {
    return
  }

  resetMessages()

  if (!validateForm()) {
    return
  }

  saving.value = true

  try {
    const result =
      props.mode === 'edit' && props.theme
        ? await updateThemeService(props.theme.id, buildPayload())
        : await createThemeService(buildPayload())

    if (!result.ok) {
      formError.value = t(getSaveErrorKey(result.error))
      emit('error', result.error)
      return
    }

    let savedTheme = result.data.theme

    // Le statut passe par son endpoint d√©di√© : on l'enregistre apr√®s le reste,
    // seulement s'il a chang√©.
    if (props.mode === 'edit' && props.theme && form.status !== props.theme.status) {
      const statusResult = await updateThemeStatusService(props.theme.id, form.status)

      if (!statusResult.ok) {
        formError.value = t(getApiErrorKey(statusResult.error, 'themes.errors'))
        emit('error', statusResult.error)
        return
      }

      savedTheme = statusResult.theme
    }

    formSuccess.value =
      props.mode === 'edit' ? t('themes.form.success.updated') : t('themes.form.success.created')

    emit('saved', savedTheme)
  } catch {
    formError.value = t('themes.errors.saveFailed')
    emit('error', 'saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.theme-form {
  display: grid;
  gap: 16px;
}

.theme-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.theme-form__readonly-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 820px) {
  .theme-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
