<template>
  <form class="theme-form" @submit.prevent="submitForm">
    <BaseBanner
      v-if="isReadonly"
      :message="$t('themes.form.readonly')"
    />

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
  type ThemeMode,
  type ThemeScope,
} from '@quizzup/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseBanner from '@/components/ui/BaseBanner.vue'
import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  createThemeService,
  updateThemeService,
} from '@/services/themesService'
import { authState } from '@/state/authState'
import type { SelectFieldOption } from '@/types/form'
import type { Theme, ThemePayload } from '@/types/theme'
import { getApiErrorKey } from '@/utils/api'

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

const { t } = useI18n()

const form = reactive({
  name: '',
  mode: THEME_MODE_CLASSIC as ThemeMode,
  scope: THEME_SCOPE_GLOBAL as ThemeScope,
  companyId: '',
})

const errors = reactive({
  name: '',
  mode: '',
  companyId: '',
})

const saving = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const currentRole = computed(() => authState.me.value?.role ?? null)
const isSuperAdmin = computed(() => currentRole.value === ADMIN_ROLE_SUPERADMIN)
const isReadonly = computed(() => props.mode === 'edit' && !props.canEdit)
const canSubmit = computed(() => props.mode === 'create' || props.canEdit)

const submitLabel = computed(() =>
  props.mode === 'edit' ? t('themes.form.save') : t('themes.form.create'),
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

      return
    }

    form.name = theme.name
    form.mode = theme.mode
    form.scope = theme.scope
    form.companyId = theme.companyId ? String(theme.companyId) : ''
  },
  { immediate: true },
)

function resetErrors(): void {
  errors.name = ''
  errors.mode = ''
  errors.companyId = ''
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

  return !errors.name && !errors.mode && !errors.companyId
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

  return payload
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
      formError.value = t(getApiErrorKey(result.error, 'themes.errors'))
      emit('error', result.error)
      return
    }

    formSuccess.value =
      props.mode === 'edit'
        ? t('themes.form.success.updated')
        : t('themes.form.success.created')

    emit('saved', result.data.theme)
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
