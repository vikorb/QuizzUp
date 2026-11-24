<template>
  <div v-if="canShowApiKeysSection" id="api-keys" class="api-keys-section">
    <BaseCard
      :title="$t('apiKeys.title')"
      :neon="true"
      :no-hover="true"
      :loading="loading"
      :empty="!loading && !loadError && apiKeys.length === 0 && !formOpen && secret === null"
      :loading-label="$t('apiKeys.loading')"
      :empty-label="$t('apiKeys.empty')"
      class="api-keys-card"
      data-test="api-keys-card"
    >
      <template #actions>
        <UiButton v-if="loadError" variant="default" type="button" @click="loadApiKeys">
          {{ $t('apiKeys.retry') }}
        </UiButton>

        <UiButton
          v-else-if="!formOpen"
          variant="primary"
          type="button"
          data-test="api-key-create"
          :disabled="loading || busy"
          @click="openForm"
        >
          {{ $t('apiKeys.create.action') }}
        </UiButton>
      </template>

      <BaseBanner
        :variant="bannerVariant"
        :message="bannerMessage"
        @dismiss="bannerMessage = null"
      />

      <section v-if="secret !== null" class="api-keys__secret" data-test="api-key-secret-panel">
        <h3 class="api-keys__secret-title">{{ $t('apiKeys.secret.title') }}</h3>
        <p class="api-keys__secret-warning">{{ $t('apiKeys.secret.warning') }}</p>

        <code class="api-keys__secret-value" data-test="api-key-secret">{{ secret }}</code>

        <p v-if="copyFailed" class="api-keys__error" role="alert" data-test="api-key-copy-failed">
          {{ $t('apiKeys.secret.copyFailed') }}
        </p>

        <div class="api-keys__secret-actions">
          <UiButton variant="default" type="button" data-test="api-key-copy" @click="copySecret">
            {{ $t(copied ? 'apiKeys.secret.copied' : 'apiKeys.secret.copy') }}
          </UiButton>

          <UiButton
            variant="default"
            type="button"
            data-test="api-key-secret-close"
            @click="closeSecret"
          >
            {{ $t('apiKeys.secret.close') }}
          </UiButton>
        </div>
      </section>

      <form
        v-if="formOpen"
        class="api-keys__form"
        novalidate
        data-test="api-key-form"
        @submit.prevent="handleCreate"
      >
        <FormField
          id="api-key-name"
          v-model="name"
          name="apiKeyName"
          :label="$t('apiKeys.create.nameLabel')"
          :placeholder="$t('apiKeys.create.namePlaceholder')"
          :error="nameError ? $t(nameError, { max: API_KEY_NAME_MAX_LENGTH }) : undefined"
          :disabled="busy"
          required
        />

        <FormActions
          :cancel-label="$t('apiKeys.create.cancel')"
          :submit-label="$t('apiKeys.create.submit')"
          :submitting-label="$t('apiKeys.create.submitting')"
          :loading="creating"
          :disabled="busy"
          @cancel="closeForm"
        />
      </form>

      <p v-if="loadError" class="api-keys__error" role="alert" data-test="api-keys-error">
        {{ $t(getApiKeyErrorKey(loadError)) }}
      </p>

      <BaseTable
        v-else-if="apiKeys.length > 0"
        :columns="columns"
        :items="apiKeys"
        row-key="id"
        data-test="api-keys-table"
      >
        <template #cell-name="{ item }">
          <span class="api-keys__name">{{ (item as ApiKey).name }}</span>
        </template>

        <template #cell-keyPrefix="{ item }">
          <code class="api-keys__prefix">{{ (item as ApiKey).keyPrefix }}…</code>
        </template>

        <template #cell-createdAt="{ item }">
          <time class="api-keys__date" :datetime="(item as ApiKey).createdAt">
            {{ formatGameDate((item as ApiKey).createdAt, String(locale)) }}
          </time>
        </template>

        <template #cell-lastUsedAt="{ item }">
          <time
            v-if="(item as ApiKey).lastUsedAt"
            class="api-keys__date"
            :datetime="(item as ApiKey).lastUsedAt ?? undefined"
          >
            {{ formatGameDate((item as ApiKey).lastUsedAt, String(locale)) }}
          </time>
          <span v-else class="api-keys__never">{{ $t('apiKeys.neverUsed') }}</span>
        </template>

        <template #cell-status="{ item }">
          <StatusPill
            :tone="(item as ApiKey).status === API_KEY_STATUS_ACTIVE ? 'ok' : 'muted'"
            :label="$t(getStatusKey((item as ApiKey).status))"
            data-test="api-key-status"
          />
        </template>

        <template #cell-actions="{ item }">
          <UiButton
            v-if="(item as ApiKey).status === API_KEY_STATUS_ACTIVE"
            variant="danger"
            type="button"
            data-test="api-key-revoke"
            :aria-label="$t('apiKeys.revoke.ariaLabel', { name: (item as ApiKey).name })"
            :disabled="busy"
            @click="handleRevoke(item as ApiKey)"
          >
            {{ $t('apiKeys.revoke.action') }}
          </UiButton>
        </template>
      </BaseTable>
    </BaseCard>

    <ApiLogsPanel :company-id="companyId" :api-keys="apiKeys" />
  </div>
</template>

<script setup lang="ts">
import type { ApiKey, ApiKeyStatus } from '@quizzup/shared'
import { API_KEY_NAME_MAX_LENGTH, API_KEY_STATUS_ACTIVE } from '@quizzup/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable, { type BaseTableColumn } from '@/components/ui/BaseTable.vue'
import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  createApiKeyService,
  listApiKeysService,
  revokeApiKeyService,
} from '@/services/apiKeysService'
import type { BannerVariant } from '@/types/banner'
import { getApiKeyErrorKey } from '@/utils/apiKey/errors'
import { formatGameDate } from '@/utils/game/format'

import ApiLogsPanel from './ApiLogsPanel.vue'

const props = defineProps<{
  companyId: number
  canShowApiKeysSection: boolean
}>()

const { t, locale } = useI18n()
const { confirm } = useConfirm()

const apiKeys = ref<ApiKey[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const busy = ref(false)
const creating = ref(false)
const formOpen = ref(false)
const name = ref('')
const nameError = ref<string | null>(null)
const bannerMessage = ref<string | null>(null)
const bannerVariant = ref<BannerVariant>('success')

// Le secret n'existe qu'ici : jamais stocké, jamais dans une adresse ni dans la console, et effacé
// dès que le panneau se ferme ou que l'écran disparaît.
const secret = ref<string | null>(null)
const copied = ref(false)
const copyFailed = ref(false)

// Une réponse arrivée après un changement de compagnie est ignorée.
let loadTicket = 0

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'name', label: t('apiKeys.columns.name') },
  { key: 'keyPrefix', label: t('apiKeys.columns.keyPrefix') },
  { key: 'createdAt', label: t('apiKeys.columns.createdAt') },
  { key: 'lastUsedAt', label: t('apiKeys.columns.lastUsedAt') },
  { key: 'status', label: t('apiKeys.columns.status') },
  { key: 'actions', label: t('apiKeys.columns.actions'), align: 'right' },
])

function getStatusKey(status: ApiKeyStatus): string {
  return status === API_KEY_STATUS_ACTIVE ? 'apiKeys.status.active' : 'apiKeys.status.revoked'
}

function showError(code: string): void {
  bannerVariant.value = 'error'
  bannerMessage.value = t(getApiKeyErrorKey(code))
}

function showSuccess(message: string): void {
  bannerVariant.value = 'success'
  bannerMessage.value = message
}

function closeSecret(): void {
  secret.value = null
  copied.value = false
  copyFailed.value = false
}

function closeForm(): void {
  formOpen.value = false
  name.value = ''
  nameError.value = null
}

function openForm(): void {
  bannerMessage.value = null
  formOpen.value = true
}

function resetSection(): void {
  loadTicket += 1
  apiKeys.value = []
  loadError.value = null
  bannerMessage.value = null
  closeSecret()
  closeForm()
}

async function loadApiKeys(): Promise<void> {
  const ticket = ++loadTicket

  loading.value = true
  loadError.value = null

  try {
    const result = await listApiKeysService(props.companyId)

    if (ticket !== loadTicket) {
      return
    }

    if (result.ok) {
      apiKeys.value = result.data.apiKeys
    } else {
      apiKeys.value = []
      loadError.value = result.error
    }
  } catch {
    if (ticket === loadTicket) {
      loadError.value = 'server_error'
    }
  } finally {
    if (ticket === loadTicket) {
      loading.value = false
    }
  }
}

async function copySecret(): Promise<void> {
  if (secret.value === null) {
    return
  }

  try {
    await navigator.clipboard.writeText(secret.value)
    copied.value = true
    copyFailed.value = false
  } catch {
    // Pas de presse-papiers (page non sécurisée, refus) : la clé reste affichée, à copier à la main.
    copied.value = false
    copyFailed.value = true
  }
}

async function handleCreate(): Promise<void> {
  if (busy.value) {
    return
  }

  const trimmed = name.value.trim()

  if (trimmed === '') {
    nameError.value = 'apiKeys.create.nameRequired'
    return
  }

  if (trimmed.length > API_KEY_NAME_MAX_LENGTH) {
    nameError.value = 'apiKeys.create.nameTooLong'
    return
  }

  nameError.value = null
  busy.value = true
  creating.value = true
  bannerMessage.value = null

  try {
    const result = await createApiKeyService(props.companyId, trimmed)

    if (!result.ok) {
      showError(result.error)
      return
    }

    apiKeys.value = [result.data.apiKey, ...apiKeys.value]
    closeSecret()
    secret.value = result.data.secret
    closeForm()
    showSuccess(t('apiKeys.create.done', { name: result.data.apiKey.name }))
  } catch {
    showError('server_error')
  } finally {
    busy.value = false
    creating.value = false
  }
}

async function handleRevoke(apiKey: ApiKey): Promise<void> {
  if (busy.value) {
    return
  }

  const confirmed = await confirm({
    title: t('apiKeys.revoke.title'),
    message: t('apiKeys.revoke.confirm', { name: apiKey.name, prefix: apiKey.keyPrefix }),
    confirmLabel: t('apiKeys.revoke.action'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  busy.value = true
  bannerMessage.value = null

  try {
    const result = await revokeApiKeyService(props.companyId, apiKey.id)

    if (!result.ok) {
      showError(result.error)
      return
    }

    apiKeys.value = apiKeys.value.map((current) =>
      current.id === apiKey.id ? result.data.apiKey : current
    )
    showSuccess(t('apiKeys.revoke.done', { name: apiKey.name }))
  } catch {
    showError('server_error')
  } finally {
    busy.value = false
  }
}

watch(
  () => [props.canShowApiKeysSection, props.companyId] as const,
  ([canShow]) => {
    resetSection()

    if (canShow && Number.isFinite(props.companyId)) {
      void loadApiKeys()
    }
  },
  { immediate: true }
)

onBeforeUnmount(closeSecret)
</script>

<style scoped>
.api-keys-section {
  margin-top: 18px;
  scroll-margin-top: 90px;
}

.api-keys__secret {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid var(--border-2);
  border-radius: var(--radius);
  background: var(--surface-0);
}

.api-keys__secret-title {
  margin: 0;
  color: var(--text-0);
  font-size: 15px;
  font-weight: 800;
}

.api-keys__secret-warning {
  margin: 0;
  color: var(--text-1);
}

.api-keys__secret-value {
  padding: 12px 14px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-inset);
  color: var(--accent-cyan);
  font-weight: 800;
  overflow-wrap: anywhere;
  user-select: all;
}

.api-keys__secret-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.api-keys__form {
  display: grid;
  gap: 14px;
  margin-bottom: 14px;
}

.api-keys__error {
  margin: 0;
  padding: 14px 8px;
  color: var(--danger);
}

.api-keys__name {
  color: var(--text-0);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.api-keys__prefix,
.api-keys__date {
  font-variant-numeric: tabular-nums;
}

.api-keys__never {
  color: var(--text-2);
}
</style>
