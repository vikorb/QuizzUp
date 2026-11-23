<template>
  <SectionLayout :title="t('questionImport.title')" :subtitle="t('questionImport.subtitle')">
    <BaseBanner
      :variant="banner?.variant"
      :message="banner?.message ?? null"
      :dismissible="error !== null"
      :auto-dismiss="false"
      @dismiss="error = null"
    />

    <BaseCard
      :title="t('questionImport.file.title')"
      :neon="false"
      :no-hover="true"
      class="import-card"
    >
      <div class="import-form">
        <div v-if="isSuperAdmin" class="import-form__scope">
          <SelectField
            id="import-scope"
            v-model="scope"
            :label="t('questionImport.scope.label')"
            :options="scopeOptions"
            :disabled="locked"
          />

          <SelectField
            v-if="needsCompany"
            id="import-company"
            v-model="companyId"
            :label="t('questionImport.scope.companyLabel')"
            :options="companyOptions"
            :required="true"
            :disabled="locked || companiesLoading"
            :hint="companyHint"
            :error="companiesError ? t('questionImport.scope.companyLoadError') : undefined"
          />
        </div>

        <div class="import-form__file">
          <LabelField :label="t('questionImport.file.label')" for-id="import-file" />
          <input
            id="import-file"
            ref="fileInputRef"
            class="import-form__input"
            type="file"
            :accept="IMPORT_FILE_ACCEPT"
            :disabled="locked"
            aria-describedby="import-file-help"
            @change="onFileChange"
          />
          <p id="import-file-help" class="import-form__help">
            {{
              t('questionImport.file.help', { rows: QUESTION_IMPORT_MAX_ROWS, size: maxSizeLabel })
            }}
          </p>
        </div>

        <UiButton
          type="button"
          class="import-button import-form__template"
          @click="downloadTemplate"
        >
          <MdIcon :path="mdiDownload" :size="18" />
          {{ t('questionImport.file.template') }}
        </UiButton>
        <p class="import-form__help">{{ t('questionImport.file.templateHelp') }}</p>
      </div>
    </BaseCard>

    <ImportReport v-if="report" :rows="report.rows" :valid="report.valid" :errors="report.errors" />

    <div class="import-actions">
      <template v-if="created !== null">
        <UiButton variant="primary" class="import-button import-list" @click="goToQuestions">
          {{ t('questionImport.actions.list') }}
        </UiButton>

        <UiButton class="import-button import-another" @click="resetAll">
          {{ t('questionImport.actions.another') }}
        </UiButton>
      </template>

      <template v-else>
        <UiButton
          :variant="canImport ? 'default' : 'primary'"
          class="import-button import-check"
          :disabled="!canCheck"
          :aria-busy="busy === 'check'"
          @click="run(true)"
        >
          {{
            busy === 'check'
              ? t('questionImport.actions.checking')
              : t('questionImport.actions.check')
          }}
        </UiButton>

        <UiButton
          v-if="canImport && report"
          variant="primary"
          class="import-button import-confirm"
          :disabled="busy !== null"
          :aria-busy="busy === 'import'"
          @click="run(false)"
        >
          {{
            busy === 'import'
              ? t('questionImport.actions.importing')
              : t('questionImport.actions.import', { count: report.valid }, report.valid)
          }}
        </UiButton>
      </template>
    </div>
  </SectionLayout>
</template>

<script setup lang="ts">
import { mdiDownload } from '@mdi/js'
import {
  ADMIN_ROLE_SUPERADMIN,
  COMPANY_STATUS_DELETED,
  QUESTION_IMPORT_MAX_BYTES,
  QUESTION_IMPORT_MAX_ROWS,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import LabelField from '@/components/ui/form/LabelField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadCompaniesService } from '@/services/companiesService'
import { importQuestionsService } from '@/services/questionImportService'
import { me } from '@/state/authState'
import type { Company } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import type { QuestionImportResult } from '@/types/questionImport'
import { formatFileSize } from '@/utils/question/audio'
import {
  buildImportTemplate,
  getImportErrorKey,
  IMPORT_FILE_ACCEPT,
  IMPORT_TEMPLATE_FILE_NAME,
  validateImportFile,
} from '@/utils/question/import'

import ImportReport from './ImportReport.vue'

type DryRunReport = Extract<QuestionImportResult, { ok: true; dryRun: true }>
type ImportError = { code: string; params: Record<string, string | number> }

const { t, te } = useI18n()
const router = useRouter()

const maxSizeLabel = formatFileSize(QUESTION_IMPORT_MAX_BYTES)

const fileInputRef = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const scope = ref<string>(THEME_SCOPE_GLOBAL)
const companyId = ref('')
const report = ref<DryRunReport | null>(null)
const created = ref<number | null>(null)
const error = ref<ImportError | null>(null)
const busy = ref<'check' | 'import' | null>(null)

const companies = ref<Company[]>([])
const companiesLoading = ref(false)
const companiesError = ref(false)

// Une réponse qui arrive après un changement de fichier ou de portée ne doit rien afficher.
let requestId = 0

// Seul le superadmin choisit la portée ; les autres rôles importent dans leur compagnie.
const isSuperAdmin = computed(() => me.value?.role === ADMIN_ROLE_SUPERADMIN)
const needsCompany = computed(() => isSuperAdmin.value && scope.value === THEME_SCOPE_COMPANY)
const locked = computed(() => busy.value !== null || created.value !== null)

const scopeOptions = computed<SelectFieldOption[]>(() => [
  { label: t('questions.scope.global'), value: THEME_SCOPE_GLOBAL },
  { label: t('questions.scope.company'), value: THEME_SCOPE_COMPANY },
])

const companyOptions = computed<SelectFieldOption[]>(() => [
  { label: t('questionImport.scope.companyPlaceholder'), value: '' },
  ...companies.value.map((company) => ({ label: company.name, value: String(company.id) })),
])

const companyHint = computed(() => {
  if (companiesLoading.value) {
    return t('questionImport.scope.companyLoading')
  }

  return !companiesError.value && companies.value.length === 0
    ? t('questionImport.scope.companyEmpty')
    : undefined
})

const canCheck = computed(
  () =>
    file.value !== null && busy.value === null && (!needsCompany.value || companyId.value !== '')
)

// La règle de la conception : la moindre erreur bloque l'import (le serveur n'écrit rien sinon).
const canImport = computed(
  () => report.value !== null && report.value.errors.length === 0 && report.value.valid > 0
)

const banner = computed(() => {
  if (error.value) {
    return {
      variant: 'error' as const,
      message: t(getImportErrorKey(error.value.code, te), {
        max: QUESTION_IMPORT_MAX_ROWS,
        size: maxSizeLabel,
        ...error.value.params,
      }),
    }
  }

  return created.value === null
    ? null
    : {
        variant: 'success' as const,
        message: t('questionImport.result.created', { count: created.value }, created.value),
      }
})

function invalidate(): void {
  requestId += 1
  report.value = null
  created.value = null
  error.value = null
  busy.value = null
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0] ?? null
  const refusal = picked ? validateImportFile(picked) : null

  invalidate()

  if (refusal) {
    error.value = { code: refusal, params: {} }
    input.value = ''
  }

  file.value = refusal ? null : picked
}

function resetAll(): void {
  invalidate()
  file.value = null

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

async function run(dryRun: boolean): Promise<void> {
  if (!file.value) {
    return
  }

  // L'import garde le rapport affiché (et son bouton) jusqu'à la réponse.
  requestId += 1
  error.value = null

  if (dryRun) {
    report.value = null
  }

  const currentRequest = requestId
  busy.value = dryRun ? 'check' : 'import'

  // Chromium refuse d'envoyer un fichier modifié depuis sa sélection (et fetch échoue alors comme
  // une panne réseau) : on le lit d'abord, pour demander de le choisir de nouveau.
  try {
    await file.value.arrayBuffer()
  } catch {
    resetAll()
    error.value = { code: 'file_changed', params: {} }

    return
  }

  const result = await importQuestionsService({
    file: file.value,
    dryRun,
    scope: isSuperAdmin.value
      ? needsCompany.value
        ? THEME_SCOPE_COMPANY
        : THEME_SCOPE_GLOBAL
      : undefined,
    companyId: needsCompany.value ? Number(companyId.value) : null,
  })

  if (currentRequest !== requestId) {
    return
  }

  busy.value = null

  if (!result.ok) {
    // Les erreurs par ligne d'un refus (422) s'affichent en relançant la vérification : le
    // rapport affiché est périmé, on n'offre plus l'import.
    if (!dryRun && result.errors.length > 0) {
      report.value = null
    }

    error.value = { code: result.code, params: result.params }
  } else if (result.dryRun) {
    report.value = result
  } else {
    created.value = result.created
  }
}

function downloadTemplate(): void {
  const content = buildImportTemplate({
    theme: t('questionImport.template.theme'),
    qcmQuestion: t('questionImport.template.qcmQuestion'),
    trueFalseQuestion: t('questionImport.template.trueFalseQuestion'),
    estimateQuestion: t('questionImport.template.estimateQuestion'),
  })
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')

  link.href = url
  link.download = IMPORT_TEMPLATE_FILE_NAME
  link.click()
  URL.revokeObjectURL(url)
}

function goToQuestions(): void {
  void router.push({ name: 'questions' })
}

async function loadCompanies(): Promise<void> {
  companiesLoading.value = true
  companiesError.value = false

  const result = await loadCompaniesService()

  if (result.ok) {
    companies.value = result.companies.filter(
      (company) => company.status !== COMPANY_STATUS_DELETED
    )
  } else {
    companiesError.value = true
  }

  companiesLoading.value = false
}

watch([scope, companyId], invalidate)

onMounted(() => {
  if (isSuperAdmin.value) {
    void loadCompanies()
  }
})

onBeforeUnmount(() => {
  requestId += 1
})
</script>

<style scoped>
.import-card {
  margin-top: 4px;
}

.import-form {
  display: grid;
  gap: 16px;
}

.import-form__scope {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.import-form__file {
  display: grid;
  gap: 8px;
}

.import-form__input {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding: 6px 12px;
  border: 1px solid var(--border-ui);
  border-radius: 14px;
  background: var(--bg-field);
  color: var(--text-1);
  font: inherit;
  cursor: pointer;
  transition:
    border-color var(--tr),
    box-shadow var(--tr);
}

.import-form__input::file-selector-button {
  min-height: 36px;
  margin-right: 12px;
  padding: 0 14px;
  border: 1px solid var(--border-ui);
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text-0);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.import-form__input:hover {
  border-color: var(--border-2);
}

.import-form__input:focus-visible {
  outline: none;
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px var(--glow-soft);
}

.import-form__input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.import-form__help {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
}

.import-form__template {
  justify-self: start;
}

.import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.import-button {
  min-height: 48px;
}

@media (prefers-reduced-motion: reduce) {
  .import-form__input {
    transition: none;
  }
}

@media (max-width: 768px) {
  .import-actions .import-button {
    flex: 1 1 100%;
  }
}
</style>
