<template>
  <BaseCard
    v-if="canShowGameResults(game)"
    :title="$t('vouchers.panel.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :empty="!loading && !error && desks.length === 0"
    :loading-label="$t('vouchers.panel.loading')"
    :empty-label="$t('vouchers.panel.empty')"
    error-namespace="vouchers.errors"
    class="game-vouchers-card"
    data-test="game-vouchers-panel"
  >
    <template #actions>
      <UiButton v-if="error" variant="default" type="button" @click="loadVouchers">
        {{ $t('vouchers.panel.retry') }}
      </UiButton>
    </template>

    <BaseBanner :variant="bannerVariant" :message="bannerMessage" @dismiss="bannerMessage = null" />

    <ul class="game-vouchers__list">
      <li
        v-for="desk in desks"
        :key="desk.participant.id"
        class="game-vouchers__line"
        :data-test="`game-voucher-desk-${desk.participant.podium}`"
      >
        <span class="game-vouchers__podium">
          <span class="sr-only">{{
            $t('vouchers.panel.desk', { podium: desk.participant.podium })
          }}</span>
          <span aria-hidden="true">{{ desk.participant.podium }}</span>
        </span>

        <span class="game-vouchers__names">{{ getDeskNames(desk.participant) }}</span>

        <div v-if="desk.voucher" class="game-vouchers__voucher">
          <span class="game-vouchers__code" data-test="game-voucher-code">{{
            desk.voucher.code
          }}</span>
          <StatusPill
            :tone="getVoucherStateTone(desk.voucher.state)"
            :label="$t(getVoucherStateLabelKey(desk.voucher.state))"
            data-test="game-voucher-state"
          />
          <span class="game-vouchers__note">
            {{
              $t('vouchers.panel.validUntil', {
                date: formatGameDate(desk.voucher.expiresAt, locale, false),
              })
            }}
          </span>
          <UiButton
            v-if="canCancelVoucher(role, desk.voucher.state)"
            variant="danger"
            type="button"
            data-test="game-voucher-cancel"
            :disabled="busy"
            @click="handleCancel(desk.voucher)"
          >
            {{ $t('vouchers.cancel.action') }}
          </UiButton>
        </div>

        <UiButton
          v-else
          :variant="desk.participant.id === firstIssuableId ? 'primary' : 'default'"
          type="button"
          data-test="game-voucher-issue"
          :disabled="busy"
          @click="handleIssue(desk.participant)"
        >
          {{
            issuingId === desk.participant.id
              ? $t('vouchers.panel.issuing')
              : $t('vouchers.panel.issue')
          }}
        </UiButton>
      </li>
    </ul>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  cancelVoucherService,
  issueGameVoucherService,
  listGameVouchersService,
} from '@/services/vouchersService'
import { authState } from '@/state/authState'
import type { BannerVariant } from '@/types/banner'
import type { Game, GameParticipant } from '@/types/game'
import type { Voucher } from '@/types/voucher'
import { formatGameDate } from '@/utils/game/format'
import { canShowGameResults } from '@/utils/game/state'
import { getVoucherErrorKey } from '@/utils/voucher/errors'
import {
  canCancelVoucher,
  getVoucherStateLabelKey,
  getVoucherStateTone,
} from '@/utils/voucher/state'

const props = defineProps<{
  game: Game
}>()

const { t, locale } = useI18n()
const { confirm } = useConfirm()

const vouchers = ref<Voucher[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)
const issuingId = ref<number | null>(null)
const bannerMessage = ref<string | null>(null)
const bannerVariant = ref<BannerVariant>('success')

const role = computed(() => authState.me.value?.role)

// Un pupitre par ligne, dans l'ordre du podium, avec son bon s'il a déjà été émis.
const desks = computed(() =>
  [...(props.game.participants ?? [])]
    .sort((first, second) => first.podium - second.podium)
    .map((participant) => ({
      participant,
      voucher: vouchers.value.find((voucher) => voucher.participantId === participant.id) ?? null,
    }))
)

// Le premier pupitre sans bon est proposé en premier : c'est l'unique bouton principal.
const firstIssuableId = computed(
  () => desks.value.find((desk) => desk.voucher === null)?.participant.id ?? null
)

function getDeskNames(participant: GameParticipant): string {
  return [participant.displayName, participant.secondPlayer?.displayName]
    .filter((name): name is string => Boolean(name))
    .join(' · ')
}

function showError(code: string): void {
  bannerVariant.value = 'error'
  bannerMessage.value = t(getVoucherErrorKey(code))
}

function showSuccess(message: string): void {
  bannerVariant.value = 'success'
  bannerMessage.value = message
}

async function loadVouchers(): Promise<void> {
  loading.value = true
  error.value = null

  try {
    const result = await listGameVouchersService(props.game.companyId, props.game.id)

    if (result.ok) {
      vouchers.value = result.data.vouchers
    } else {
      error.value = result.error
    }
  } catch {
    error.value = 'server_error'
  } finally {
    loading.value = false
  }
}

async function handleIssue(participant: GameParticipant): Promise<void> {
  if (busy.value) {
    return
  }

  busy.value = true
  issuingId.value = participant.id
  bannerMessage.value = null

  try {
    const result = await issueGameVoucherService(
      props.game.companyId,
      props.game.id,
      participant.id
    )

    if (!result.ok) {
      showError(result.error)
      return
    }

    vouchers.value = [...vouchers.value, result.data.voucher]
    showSuccess(
      t('vouchers.panel.issued', { code: result.data.voucher.code, podium: participant.podium })
    )
  } catch {
    showError('server_error')
  } finally {
    busy.value = false
    issuingId.value = null
  }
}

async function handleCancel(voucher: Voucher): Promise<void> {
  if (busy.value) {
    return
  }

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

  busy.value = true
  bannerMessage.value = null

  try {
    const result = await cancelVoucherService(props.game.companyId, voucher.id)

    if (!result.ok) {
      showError(result.error)
      return
    }

    vouchers.value = vouchers.value.map((current) =>
      current.id === voucher.id ? result.data.voucher : current
    )
    showSuccess(t('vouchers.cancel.done', { code: voucher.code }))
  } catch {
    showError('server_error')
  } finally {
    busy.value = false
  }
}

// La partie se relit quand la salle annonce sa fin : les bons n'existent qu'à partir de là.
watch(
  () => canShowGameResults(props.game),
  (finished) => {
    if (finished) {
      void loadVouchers()
    }
  }
)

onMounted(() => {
  if (canShowGameResults(props.game)) {
    void loadVouchers()
  }
})
</script>

<style scoped>
.game-vouchers-card {
  margin-top: 18px;
}

.game-vouchers__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.game-vouchers__line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  padding: 8px 14px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-0);
}

.game-vouchers__podium {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-2);
  border-radius: 50%;
  color: var(--text-1);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.game-vouchers__names {
  color: var(--text-0);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.game-vouchers__voucher {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 14px;
}

.game-vouchers__code {
  color: var(--accent-cyan);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

.game-vouchers__note {
  font-size: 12px;
  color: var(--text-2);
}

/* Texte lu par les lecteurs d'écran seulement (même motif que le panneau de suivi en direct). */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 560px) {
  .game-vouchers__line {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .game-vouchers__line > :last-child {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
</style>
