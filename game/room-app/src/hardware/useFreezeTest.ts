import { MAX_FREEZE_MS, parseRig, smokeLacksRelay } from '@quizzup/hardware'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useConfirm } from '@/composables/useConfirm'
import { getLighting, useRoomHardware } from '@/hardware/roomHardware'

/** Émission courte lancée juste avant le gel : le relais temporisé doit la couper seul. */
export const FREEZE_SMOKE_MS = 3000

/**
 * Plantage simulé, pour vérifier le relais temporisé de la fumée : une courte émission,
 * puis plus aucune trame pendant 15 s. L'interface (ou le pont) répète la dernière trame reçue
 * (fumée allumée) : le signal DMX ne disparaît pas, seul le relais temporisé doit couper la
 * machine, en 10 s au plus.
 *
 * Pour une machine sans relais qui « coupe toute seule sur perte de signal » (`signalLoss`), le
 * même déroulé sert de test guidé de **vraie** perte de signal : pendant que l'interface répète la
 * fumée, l'installateur débranche le câble DMX et la machine doit s'arrêter seule en 10 s.
 * Double confirmation, car la fumée part vraiment.
 */
export function useFreezeTest() {
  const { t } = useI18n()
  const { confirm } = useConfirm()
  const refusal = ref<string | null>(null)
  const { bridgeFeatures, hardware } = useRoomHardware()
  /** Machine sans relais dont l'installateur a coché « coupe toute seule sur perte de signal ». */
  const signalLoss = computed(() => {
    const { fixtures, customProfiles, smoke } = hardware.value.config.lighting
    return (
      smoke.cutsOnSignalLoss === true &&
      smokeLacksRelay(parseRig(fixtures, customProfiles).fixtures)
    )
  })

  /** Raison de refuser le test avant même de demander confirmation, `null` sinon. */
  function precheck(): string | null {
    // Sans interface réelle ouverte, aucune fumée ne sortirait : le test ne prouverait rien.
    const state = getLighting()?.getState()
    if (!state || state.simulation || state.outputStatus !== 'open') {
      return t('hardware.diagnostic.freezeNoInterface')
    }
    // Pont Art-Net : il passe au noir dès que le navigateur se tait, ce qui fausserait le test.
    // Il faut un pont qui sait geler sa sortie (message `hold`), sinon on refuse.
    if (state.driver === 'artnet-bridge' && !bridgeFeatures.value?.includes('hold')) {
      return t('hardware.diagnostic.freezeBridgeOld')
    }
    return null
  }

  async function run(): Promise<boolean> {
    refusal.value = precheck()
    if (refusal.value) {
      return false
    }
    const first = await confirm({
      message: t('hardware.diagnostic.freezeConfirm1'),
      variant: 'danger',
    })
    if (!first) {
      return false
    }
    const second = await confirm({
      message: t(
        signalLoss.value
          ? 'hardware.diagnostic.freezeConfirm2Signal'
          : 'hardware.diagnostic.freezeConfirm2'
      ),
      confirmLabel: t('hardware.diagnostic.freezeGo'),
      variant: 'danger',
    })
    const controller = getLighting()
    if (!second || !controller) {
      return false
    }
    // L'interface a pu tomber pendant les confirmations.
    refusal.value = precheck()
    if (refusal.value) {
      return false
    }
    if (!controller.diagnostics.getState().active) {
      const begun = controller.diagnostics.begin()
      if (!begun.ok) {
        refusal.value = t(`hardware.diagnostic.refused.${begun.reason}`)
        return false
      }
    }
    controller.smoke.arm()
    const fired = controller.smoke.fire(FREEZE_SMOKE_MS)
    if (!fired.ok) {
      controller.smoke.disarm()
      refusal.value = t(`hardware.smoke.refused.${fired.reason}`)
      return false
    }
    const frozen = controller.diagnostics.freezeOutput(MAX_FREEZE_MS, { confirm: true })
    if (!frozen.ok) {
      controller.smoke.stop()
      controller.smoke.disarm()
      refusal.value = t(`hardware.diagnostic.refused.${frozen.reason}`)
      return false
    }
    return true
  }

  return { run, refusal, signalLoss }
}
