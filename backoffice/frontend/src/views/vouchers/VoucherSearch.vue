<template>
  <BaseCard :title="$t('vouchers.search.title')" :neon="true" :no-hover="true">
    <form class="voucher-search__form" @submit.prevent="handleSearch">
      <FormField
        v-model="input"
        class="voucher-search__field"
        name="voucher-code"
        :label="$t('vouchers.search.label')"
        :placeholder="$t('vouchers.search.placeholder')"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        :disabled="busy"
        :error="malformed ? $t('vouchers.search.malformed') : undefined"
      />

      <UiButton
        :variant="canRedeem ? 'default' : 'primary'"
        type="submit"
        data-test="voucher-search-submit"
        :disabled="busy || input.trim() === ''"
      >
        {{ searching ? $t('vouchers.search.searching') : $t('vouchers.search.submit') }}
      </UiButton>
    </form>

    <p
      v-if="message"
      class="voucher-search__message"
      :class="{ 'voucher-search__message--success': messageIsSuccess }"
      :role="messageIsSuccess ? 'status' : 'alert'"
      data-test="voucher-search-message"
    >
      {{ message }}
    </p>

    <div v-if="voucher" class="voucher-search__result" data-test="voucher-detail">
      <dl class="voucher-search__details">
        <div>
          <dt>{{ $t('vouchers.detail.code') }}</dt>
          <dd class="voucher-search__code" data-test="voucher-detail-code">{{ voucher.code }}</dd>
        </div>

        <div>
          <dt>{{ $t('vouchers.detail.label') }}</dt>
          <dd data-test="voucher-detail-label">{{ voucher.label }}</dd>
        </div>

        <div>
          <dt>{{ $t('vouchers.detail.holder') }}</dt>
          <dd data-test="voucher-detail-holder">{{ getVoucherHolderNames(voucher) }}</dd>
        </div>

        <div>
          <dt>{{ $t('vouchers.detail.state') }}</dt>
          <dd>
            <StatusPill
              :tone="getVoucherStateTone(voucher.state)"
              :label="$t(getVoucherStateLabelKey(voucher.state))"
              data-test="voucher-detail-state"
            />
          </dd>
        </div>

        <div>
          <dt>{{ $t('vouchers.detail.expiresAt') }}</dt>
          <dd>{{ formatGameDate(voucher.expiresAt, locale, false) }}</dd>
        </div>

        <div v-if="voucher.redeemedAt">
          <dt>{{ $t('vouchers.detail.redeemedAt') }}</dt>
          <dd>{{ formatGameDate(voucher.redeemedAt, locale) }}</dd>
        </div>
      </dl>

      <UiButton
        v-if="canRedeem"
        variant="primary"
        type="button"
        data-test="voucher-redeem"
        :disabled="busy"
        @click="handleRedeem"
      >
        {{ redeeming ? $t('vouchers.search.redeeming') : $t('vouchers.search.redeem') }}
      </UiButton>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { formatVoucherCode, VOUCHER_STATE_VALID } from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import FormField from '@/components/ui/form/FormField.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { lookupVoucherService, redeemVoucherService } from '@/services/vouchersService'
import type { Voucher } from '@/types/voucher'
import { formatGameDate } from '@/utils/game/format'
import { getVoucherErrorKey } from '@/utils/voucher/errors'
import {
  getVoucherHolderNames,
  getVoucherStateLabelKey,
  getVoucherStateTone,
} from '@/utils/voucher/state'

const props = defineProps<{
  companyId: number
}>()

const emit = defineEmits<{
  /** Un bon vient d'être marqué comme utilisé : la liste doit être relue. */
  (event: 'redeemed'): void
}>()

const { t, locale } = useI18n()

const input = ref('')
const voucher = ref<Voucher | null>(null)
const malformed = ref(false)
const message = ref<string | null>(null)
const messageIsSuccess = ref(false)
const searching = ref(false)
const redeeming = ref(false)

const busy = computed(() => searching.value || redeeming.value)
const canRedeem = computed(() => voucher.value?.state === VOUCHER_STATE_VALID)

function showError(code: string): void {
  messageIsSuccess.value = false
  message.value = t(getVoucherErrorKey(code))
}

async function lookup(code: string): Promise<void> {
  const result = await lookupVoucherService(props.companyId, code)

  if (result.ok) {
    voucher.value = result.data.voucher
  } else {
    voucher.value = null
    showError(result.error)
  }
}

async function handleSearch(): Promise<void> {
  if (busy.value) {
    return
  }

  voucher.value = null
  message.value = null

  // Un code mal formé ne part pas au serveur : il n'y répondrait pas autre chose que « introuvable ».
  const code = formatVoucherCode(input.value)

  malformed.value = code === null

  if (code === null) {
    return
  }

  searching.value = true

  try {
    await lookup(code)
  } catch {
    showError('server_error')
  } finally {
    searching.value = false
  }
}

async function handleRedeem(): Promise<void> {
  const current = voucher.value

  if (!current || busy.value) {
    return
  }

  redeeming.value = true
  message.value = null

  try {
    const result = await redeemVoucherService(props.companyId, current.code)

    if (result.ok) {
      voucher.value = result.data.voucher
      messageIsSuccess.value = true
      message.value = t('vouchers.search.redeemed', { code: current.code })
      emit('redeemed')
      return
    }

    // Le bon a changé depuis la recherche (utilisé à un autre comptoir, expiré) : on relit son état.
    showError(result.error)
    await lookup(current.code)
  } catch {
    showError('server_error')
  } finally {
    redeeming.value = false
  }
}
</script>

<style scoped>
.voucher-search__form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.voucher-search__field {
  flex: 1 1 260px;
  max-width: 360px;
}

.voucher-search__form :deep(.ff__control),
.voucher-search__form :deep(button) {
  min-height: 48px;
}

.voucher-search__message {
  margin: 14px 0 0;
  color: var(--danger);
}

.voucher-search__message--success {
  color: var(--text-1);
}

.voucher-search__result {
  display: grid;
  gap: 16px;
  margin-top: 18px;
  justify-items: start;
}

.voucher-search__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  width: 100%;
  margin: 0;
}

.voucher-search__details > div {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.voucher-search__details dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.voucher-search__details dd {
  margin: 0;
  color: var(--text-0);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.voucher-search__code {
  color: var(--accent-cyan);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}
</style>
