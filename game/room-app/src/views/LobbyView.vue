<template>
  <!-- Compte de salle : la partie et ses joueurs viennent du backoffice. -->
  <StaffGameLobby v-if="!isDemo" />
  <!-- Mode démo (sans backoffice) : inscription des joueurs sur place. -->
  <main v-else class="lobby stage-bg">
    <RoomTopBar>
      <span>{{ $t('room.lobby.title') }}</span>
    </RoomTopBar>

    <section class="lobby__body">
      <p class="lobby__subtitle">{{ $t('room.lobby.subtitle', { n: desks.length }) }}</p>

      <div class="lobby__desks" :style="{ '--desk-cols': deskColumns }" data-test="lobby-desks">
        <DeskRegistration
          v-for="(registration, index) in registrations"
          :key="registration.desk"
          :registration="registration"
          :errors="errorsByDesk[index] ?? {}"
          :show-errors="submitted"
          :pinged="pinged.has(registration.desk)"
          @update="registrations[index] = $event"
          @clear="registrations[index] = createEmptyRegistration(registration.desk)"
        />
      </div>

      <p class="lobby__privacy">
        <MdIcon :path="mdiShieldLockOutline" :size="16" />
        {{ $t('room.lobby.privacyNote') }}
      </p>

      <footer class="lobby__footer">
        <fieldset class="format">
          <legend class="format__legend">{{ $t('room.lobby.format') }}</legend>
          <label v-for="option in FORMATS" :key="option.id" class="format__option">
            <input v-model="formatId" type="radio" name="format" :value="option.id" />
            <span>
              {{
                $t(option.labelKey, {
                  rounds: option.roundsCount,
                  questions: option.questionsPerRound,
                })
              }}
            </span>
          </label>
        </fieldset>

        <div class="lobby__start">
          <p v-if="submitted && !hasPlayer" class="lobby__error" role="alert">
            {{ $t('room.lobby.needPlayer') }}
          </p>
          <p v-if="startFailed" class="lobby__error" role="alert">
            {{ $t('room.lobby.startFailed') }}
          </p>
          <UiButton
            variant="primary"
            class="lobby__start-btn"
            :disabled="starting"
            @click="onStart"
          >
            <MdIcon :path="mdiPlay" :size="24" />
            {{ $t('room.lobby.start') }}
          </UiButton>
        </div>
      </footer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { mdiPlay, mdiShieldLockOutline } from '@mdi/js'
import { GAME_DEFAULT_QUESTIONS_PER_ROUND, GAME_DEFAULT_ROUNDS } from '@quizzup/shared'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import RoomTopBar from '@/components/game/RoomTopBar.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadDemoThemes } from '@/game/content'
import {
  createEmptyRegistration,
  hasErrors,
  isRegistrationFilled,
  type Registration,
  validateRegistration,
} from '@/game/registrations'
import { preloadExtracts, startNewGame } from '@/game/useRoomGame'
import { type DeskNumber } from '@/hardware/buzzers'
import { useRoomHardware } from '@/hardware/roomHardware'
import { useBuzzers } from '@/hardware/useBuzzers'
import { isDemo } from '@/state/roomAuth'
import DeskRegistration from '@/views/lobby/DeskRegistration.vue'
import StaffGameLobby from '@/views/lobby/StaffGameLobby.vue'

const FORMATS = [
  {
    id: 'full',
    labelKey: 'room.lobby.formatFull',
    roundsCount: GAME_DEFAULT_ROUNDS,
    questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
  },
  { id: 'short', labelKey: 'room.lobby.formatShort', roundsCount: 3, questionsPerRound: 3 },
] as const

const PING_DURATION_MS = 1200

const router = useRouter()

// Pupitres de la salle (4 par défaut, jusqu'à 6) : réglés dans l'écran Matériel.
const { desks } = useRoomHardware()
const registrations = reactive<Registration[]>(desks.value.map(createEmptyRegistration))
// La config de la salle peut arriver (ou changer) après l'affichage : on refait la liste des
// pupitres en gardant la saisie de ceux qui restent.
watch(
  () => desks.value.length,
  () => {
    const kept = new Map(registrations.map((registration) => [registration.desk, registration]))
    registrations.splice(
      0,
      registrations.length,
      ...desks.value.map((desk) => kept.get(desk) ?? createEmptyRegistration(desk))
    )
  }
)
// 4 pupitres ou moins sur une ligne ; 5 et 6 sur deux lignes de 3 (les cartes restent lisibles).
const deskColumns = computed(() => (desks.value.length <= 4 ? desks.value.length : 3))
const formatId = ref<(typeof FORMATS)[number]['id']>(isDemo.value ? 'short' : 'full')
const submitted = ref(false)
const starting = ref(false)
const pinged = reactive(new Set<DeskNumber>())
const startFailed = ref(false)
const pingTimers = new Set<ReturnType<typeof setTimeout>>()

const filledRegistrations = computed(() => registrations.filter(isRegistrationFilled))
const hasPlayer = computed(() => filledRegistrations.value.length > 0)
const errorsByDesk = computed(() =>
  registrations.map((registration) =>
    isRegistrationFilled(registration) ? validateRegistration(registration) : {}
  )
)

// Un appui sur n'importe quel buzzer d'un pupitre le fait briller : test rapide du matériel.
useBuzzers((press) => {
  pinged.add(press.desk)
  const timer = setTimeout(() => {
    pingTimers.delete(timer)
    pinged.delete(press.desk)
  }, PING_DURATION_MS)
  pingTimers.add(timer)
})

onBeforeUnmount(() => {
  for (const timer of pingTimers) {
    clearTimeout(timer)
  }
  pingTimers.clear()
})

async function onStart(): Promise<void> {
  submitted.value = true

  if (!hasPlayer.value || errorsByDesk.value.some(hasErrors)) {
    return
  }

  const format = FORMATS.find((option) => option.id === formatId.value) ?? FORMATS[0]

  starting.value = true
  startFailed.value = false
  try {
    const themes = await loadDemoThemes()
    // Un extrait illisible n'empêche pas de jouer : son palier restera muet.
    await preloadExtracts(themes)
    startNewGame({
      registrations: filledRegistrations.value,
      themes,
      roundsCount: format.roundsCount,
      questionsPerRound: format.questionsPerRound,
    })
  } catch {
    // Contenu indisponible, préchargement ou configuration de partie invalide.
    startFailed.value = true
    starting.value = false
    return
  }

  try {
    await router.push({ name: 'play' })
  } finally {
    starting.value = false
  }
}
</script>

<style scoped>
.lobby {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow-y: auto;
}

.lobby__body {
  display: grid;
  align-content: start;
  gap: 18px;
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 8px clamp(16px, 2.4vw, 36px) 28px;
}

.lobby__subtitle {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-small);
  text-align: center;
}

.lobby__desks {
  display: grid;
  grid-template-columns: repeat(var(--desk-cols, 4), minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1100px) {
  .lobby__desks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .lobby__desks {
    grid-template-columns: 1fr;
  }
}

.lobby__privacy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}

.lobby__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.format {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
}

.format__legend {
  padding: 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}

.format__option {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  cursor: pointer;
}

.format__option input {
  accent-color: var(--accent-purple);
}

.lobby__start {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.lobby__error {
  margin: 0;
  color: var(--danger);
}

.lobby__start-btn {
  padding: 18px 36px;
  border-radius: 18px;
  font-size: 20px;
}
</style>
