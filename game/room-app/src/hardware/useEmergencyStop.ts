import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useConfirm } from '@/composables/useConfirm'
import { useRoomHardware } from '@/hardware/roomHardware'

/**
 * Arrêt d'urgence logiciel : immédiat, sans confirmation. Le réarmement, lui,
 * demande une confirmation pour qu'un double-clic de panique ne rallume pas tout.
 */
export function useEmergencyStop() {
  const { t } = useI18n()
  const { confirm } = useConfirm()
  const { lighting, lightingState } = useRoomHardware()

  function stop(event?: Event): void {
    lighting.value?.emergencyStop('operator')
    // Le focus ne doit pas rester sur le bouton : Entrée ou Espace le rappuieraient.
    const target = event?.currentTarget
    if (target instanceof HTMLElement) {
      target.blur()
    }
  }

  async function reset(): Promise<void> {
    const ok = await confirm({ message: t('hardware.lights.emergencyResetConfirm') })
    if (ok) {
      lighting.value?.resetEmergency()
    }
  }

  return {
    active: computed(() => lightingState.value?.emergency ?? false),
    stop,
    reset,
  }
}
