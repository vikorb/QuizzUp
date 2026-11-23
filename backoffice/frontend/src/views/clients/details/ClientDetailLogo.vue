<template>
  <section class="company-logo" :aria-busy="busy">
    <LabelField :label="$t('clients.details.form.logo.label')" :for-id="inputId" />

    <div class="company-logo__row">
      <div class="company-logo__preview" data-test="company-logo-preview">
        <img
          v-if="previewSrc"
          class="company-logo__image"
          :src="previewSrc"
          :alt="$t('clients.details.form.logo.alt', { name: companyName })"
          @error="imageBroken = true"
        />
        <span v-else class="company-logo__empty">
          {{
            logoUrl
              ? $t('clients.details.form.logo.previewUnavailable')
              : $t('clients.details.form.logo.empty')
          }}
        </span>
      </div>

      <div v-if="canManage" class="company-logo__actions">
        <UiButton class="company-logo__button" type="button" :disabled="busy" @click="openPicker">
          {{ chooseLabel }}
        </UiButton>

        <UiButton
          v-if="logoUrl"
          class="company-logo__button"
          variant="danger"
          type="button"
          :disabled="busy"
          @click="removeLogo"
        >
          {{
            removing
              ? $t('clients.details.form.logo.removing')
              : $t('clients.details.form.logo.remove')
          }}
        </UiButton>
      </div>
    </div>

    <input
      :id="inputId"
      ref="fileInput"
      class="company-logo__input"
      type="file"
      :accept="accept"
      :disabled="!canManage || busy"
      data-test="company-logo-input"
      @change="handleFileChange"
    />

    <p v-if="canManage" class="company-logo__help">
      {{ $t('clients.details.form.logo.help', { max: maxKilobytes }) }}
    </p>

    <FormResult :error="errorMessage" />
  </section>
</template>

<script setup lang="ts">
import { COMPANY_LOGO_MAX_BYTES, COMPANY_LOGO_MIME_TYPES } from '@quizzup/shared'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FormResult from '@/components/ui/form/FormResult.vue'
import LabelField from '@/components/ui/form/LabelField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  type CompanyLogoErrorCode,
  deleteCompanyLogoService,
  uploadCompanyLogoService,
} from '@/services/companyLogoService'
import { getApiBase } from '@/utils/auth'

const props = defineProps<{
  companyId: number
  companyName: string
  /** Chemin public du logo (`/public/v1/logos/…`), `null` sans logo. */
  logoUrl: string | null
  canManage: boolean
  /** Bloque l'envoi et le retrait (ex. fiche en cours d'enregistrement). */
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'changed', logoUrl: string | null): void
}>()

const { t } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const removing = ref(false)
const errorCode = ref<CompanyLogoErrorCode | null>(null)
const imageBroken = ref(false)

const inputId = `company-logo-${props.companyId}`
const accept = COMPANY_LOGO_MIME_TYPES.join(',')
const maxKilobytes = COMPANY_LOGO_MAX_BYTES / 1024

const busy = computed(() => uploading.value || removing.value || props.disabled === true)
const previewSrc = computed(() =>
  props.logoUrl && !imageBroken.value ? `${getApiBase()}${props.logoUrl}` : null
)
const chooseLabel = computed(() => {
  if (uploading.value) {
    return t('clients.details.form.logo.uploading')
  }

  return props.logoUrl
    ? t('clients.details.form.logo.replace')
    : t('clients.details.form.logo.choose')
})
const errorMessage = computed(() =>
  errorCode.value
    ? t(`clients.details.form.logo.errors.${errorCode.value}`, { max: maxKilobytes })
    : null
)

// Un nouveau fichier (autre URL) remplace un aperçu qui n'avait pas pu se charger.
watch(
  () => props.logoUrl,
  () => {
    imageBroken.value = false
  }
)

function openPicker(): void {
  fileInput.value?.click()
}

function validate(file: File): CompanyLogoErrorCode | null {
  if (!(COMPANY_LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'logo_type_invalid'
  }

  return file.size > COMPANY_LOGO_MAX_BYTES ? 'logo_too_large' : null
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  // Même fichier re-choisi plus tard : sans cette remise à zéro, `change` ne se déclenche pas.
  input.value = ''

  if (!file || busy.value || !props.canManage) {
    return
  }

  errorCode.value = validate(file)

  if (errorCode.value) {
    return
  }

  uploading.value = true

  try {
    const result = await uploadCompanyLogoService(props.companyId, file)

    if (!result.ok) {
      errorCode.value = result.error
      return
    }

    emit('changed', result.data.logoUrl)
  } finally {
    uploading.value = false
  }
}

async function removeLogo(): Promise<void> {
  if (busy.value || !props.canManage) {
    return
  }

  errorCode.value = null
  removing.value = true

  try {
    const result = await deleteCompanyLogoService(props.companyId)

    if (!result.ok) {
      errorCode.value = result.error
      return
    }

    emit('changed', null)
  } finally {
    removing.value = false
  }
}
</script>

<style scoped>
.company-logo {
  display: grid;
  gap: 8px;
}

.company-logo__row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.company-logo__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 160px;
  height: 96px;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px dashed var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-0);
}

.company-logo__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.company-logo__empty {
  padding: 0 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}

.company-logo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.company-logo__button {
  min-height: 48px;
}

.company-logo__input {
  display: none;
}

.company-logo__help {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

@media (max-width: 760px) {
  .company-logo__row {
    flex-direction: column;
    align-items: stretch;
  }

  .company-logo__preview {
    width: 100%;
  }
}
</style>
