<template>
  <SectionLayout :title="$t('vouchers.title')" :subtitle="$t('vouchers.subtitle')">
    <VouchersToolbar
      v-model:state-filter="stateFilter"
      :company-id="companyId ? String(companyId) : ''"
      :company-options="companyOptions"
      :show-company="showCompanySelector"
      @update:company-id="handleCompanyChange"
    />

    <BaseBanner :variant="bannerVariant" :message="bannerMessage" @dismiss="bannerMessage = null" />

    <VoucherSearch
      v-if="companyId !== null"
      :key="companyId"
      :company-id="companyId"
      @redeemed="loadPage"
    />

    <VouchersTable
      :vouchers="vouchers"
      :loading="loading"
      :error="error"
      :no-company="companyId === null"
      :busy="cancelling"
      @retry="loadPage"
      @cancel="handleCancel"
    />

    <BasePagination
      :offset="offset"
      :total="total"
      :limit="VOUCHER_LIST_DEFAULT_LIMIT"
      :disabled="loading"
      @update:offset="offset = $event"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { VOUCHER_LIST_DEFAULT_LIMIT } from '@quizzup/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useConfirm } from '@/composables/useConfirm'
import { loadCompaniesService } from '@/services/companiesService'
import { cancelVoucherService, listVouchersService } from '@/services/vouchersService'
import { authState } from '@/state/authState'
import type { BannerVariant } from '@/types/banner'
import type { Company } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import type { Voucher } from '@/types/voucher'
import { isSuperadminRole } from '@/utils/company/details/permissions'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getVoucherErrorKey } from '@/utils/voucher/errors'
import { isVoucherState } from '@/utils/voucher/state'

import VoucherSearch from './vouchers/VoucherSearch.vue'
import VouchersTable from './vouchers/VouchersTable.vue'
import VouchersToolbar from './vouchers/VouchersToolbar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { confirm } = useConfirm()

const vouchers = ref<Voucher[]>([])
const total = ref(0)
const offset = ref(0)
const companies = ref<Company[]>([])
const loading = ref(false)
const cancelling = ref(false)
const error = ref<string | null>(null)
const stateFilterValue = ref('')
const selectedCompanyId = ref<number | null>(null)
const bannerMessage = ref<string | null>(null)
const bannerVariant = ref<BannerVariant>('success')

const isSuperAdmin = computed(() => isSuperadminRole(authState.me.value?.role))

// Superadmin : compagnie choisie dans le sélecteur (ou ?companyId=) ; sinon la sienne.
const companyId = computed(
  () => selectedCompanyId.value ?? resolveGameCompanyId(authState.me.value, route.query.companyId)
)

const stateFilter = computed<string>({
  get: () => stateFilterValue.value,
  set: (value) => {
    stateFilterValue.value = isVoucherState(value) ? value : ''
  },
})

const companyOptions = computed<SelectFieldOption[]>(() =>
  companies.value.map((company) => ({
    label: company.name || `#${company.id}`,
    value: String(company.id),
  }))
)

const showCompanySelector = computed(() => isSuperAdmin.value && companyOptions.value.length > 0)

async function loadCompanies(): Promise<void> {
  if (!isSuperAdmin.value) {
    return
  }

  const result = await loadCompaniesService()

  companies.value = result.ok ? result.companies : []
}

// Une réponse plus ancienne que la dernière demande (filtre changé entre-temps) est ignorée.
let lastRequest = 0

async function loadPage(): Promise<void> {
  if (companyId.value === null) {
    vouchers.value = []
    total.value = 0
    error.value = null
    return
  }

  const request = (lastRequest += 1)

  loading.value = true
  error.value = null

  try {
    const result = await listVouchersService(companyId.value, {
      state: isVoucherState(stateFilterValue.value) ? stateFilterValue.value : undefined,
      limit: VOUCHER_LIST_DEFAULT_LIMIT,
      offset: offset.value,
    })

    if (request !== lastRequest) {
      return
    }

    if (result.ok) {
      // Dernière page vidée (dernier bon annulé ou utilisé) : retour à la dernière page qui existe,
      // le changement d'`offset` relit la liste.
      if (result.data.vouchers.length === 0 && offset.value > 0 && result.data.total > 0) {
        offset.value = Math.max(
          0,
          Math.floor((result.data.total - 1) / VOUCHER_LIST_DEFAULT_LIMIT) *
            VOUCHER_LIST_DEFAULT_LIMIT
        )
        return
      }

      vouchers.value = result.data.vouchers
      total.value = result.data.total
    } else {
      vouchers.value = []
      total.value = 0
      error.value = result.error
    }
  } catch {
    if (request === lastRequest) {
      vouchers.value = []
      total.value = 0
      error.value = 'server_error'
    }
  } finally {
    if (request === lastRequest) {
      loading.value = false
    }
  }
}

function handleCompanyChange(value: string): void {
  const nextCompanyId = parseGameId(value)

  if (nextCompanyId === null || nextCompanyId === companyId.value) {
    return
  }

  bannerMessage.value = null
  selectedCompanyId.value = nextCompanyId
  void router.replace({ name: 'vouchers', query: { companyId: String(nextCompanyId) } })
}

async function handleCancel(voucher: Voucher): Promise<void> {
  if (companyId.value === null || cancelling.value) {
    return
  }

  cancelling.value = true

  try {
    await cancelWithConfirmation(companyId.value, voucher)
  } finally {
    cancelling.value = false
  }
}

async function cancelWithConfirmation(company: number, voucher: Voucher): Promise<void> {
  const confirmed = await confirm({
    title: t('vouchers.cancel.title'),
    message: t('vouchers.cancel.confirm', { code: voucher.code }),
    confirmLabel: t('vouchers.cancel.action'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  bannerMessage.value = null

  try {
    const result = await cancelVoucherService(company, voucher.id)

    if (result.ok) {
      bannerVariant.value = 'success'
      bannerMessage.value = t('vouchers.cancel.done', { code: voucher.code })
    } else {
      bannerVariant.value = 'error'
      bannerMessage.value = t(getVoucherErrorKey(result.error))
    }
  } catch {
    bannerVariant.value = 'error'
    bannerMessage.value = t(getVoucherErrorKey('server_error'))
  }

  // Annulé ou refusé parce que le bon a changé entre-temps : dans les deux cas la liste est relue.
  await loadPage()
}

// Un filtre change : retour à la première page. Si on y est déjà, c'est le filtre qui recharge ;
// sinon le retour à la page 0 déclenche le rechargement (watcher de `offset`).
watch([selectedCompanyId, stateFilterValue], () => {
  if (offset.value === 0) {
    void loadPage()
  } else {
    offset.value = 0
  }
})

watch(offset, () => {
  void loadPage()
})

onMounted(() => {
  void loadCompanies()
  void loadPage()
})
</script>
