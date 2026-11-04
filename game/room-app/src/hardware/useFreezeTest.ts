import { MAX_FREEZE_MS } from '@quizzup/hardware'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useConfirm } from '@/composables/useConfirm'
import { getLighting } from '@/hardware/roomHardware'

/** Émission courte lancée juste avant le gel : le relais temporisé doit la couper seul. */
export const FREEZE_SMOKE_MS = 3000

/**
 * Plantage simulé, pour vérifier le relais temporisé de la fumée : une courte émission,
 * puis plus aucune trame pendant 15 s. L'interface répète la dernière trame reçue (fumée
 * allumée) : seul le relais temporisé doit couper la machine, en 10 s au plus.
 * Double confirmation, car la fumée part vraiment.
 */
export function useFreezeTest() {
  const { t } = useI18n()
  const { confirm } = useConfirm()
  const refusal = ref<string | null>(null)

  async function run(): Promise<boolean> {
    refusal.value = null
    const first = await confirm({
      message: t('hardware.diagnostic.freezeConfirm1'),
      variant: 'danger',
    })
    if (!first) {
      return false
    }
    const second = await confirm({
      message: t('hardware.diagnostic.freezeConfirm2'),
      confirmLabel: t('hardware.diagnostic.freezeGo'),
      variant: 'danger',
    })
    const controller = getLighting()
    if (!second || !controller) {
      return false
    }
    // Le pont Art-Net envoie du noir dès que le navigateur se tait : le test validerait le
    // pont, pas le relais temporisé. On le fait sur l'interface USB, ou en coupant le pont.
    if (controller.getState().driver === 'artnet-bridge') {
      refusal.value = t('hardware.diagnostic.freezeBridge')
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

  return { run, refusal }
}
