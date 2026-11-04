<template>
  <fieldset class="mini-games" :aria-describedby="describedBy" :disabled="disabled">
    <legend class="mini-games__legend">{{ $t('games.form.sections.miniGames') }}</legend>

    <div class="mini-games__list">
      <label
        v-for="miniGame in MINI_GAMES"
        :key="miniGame"
        class="mini-game"
        :class="{
          'mini-game--error': !!error,
          'mini-game--checked': isChecked(miniGame),
        }"
        :for="`game-mini-game-${miniGame}`"
      >
        <input
          :id="`game-mini-game-${miniGame}`"
          class="mini-game__checkbox"
          type="checkbox"
          name="miniGames"
          :value="miniGame"
          :data-test="`game-mini-game-${miniGame}`"
          :checked="isChecked(miniGame)"
          :disabled="disabled"
          :aria-invalid="!!error"
          @change="onChange(miniGame, $event)"
        />
        <span class="mini-game__text">{{ $t(getGameMiniGameLabelKey(miniGame)) }}</span>
      </label>
    </div>

    <p
      v-if="error"
      id="game-mini-games_error"
      class="mini-games__error"
      data-test="game-mini-games-error"
    >
      {{ error }}
    </p>
    <p v-else id="game-mini-games_hint" class="mini-games__hint">
      {{ $t('games.form.miniGamesHint') }}
    </p>
  </fieldset>
</template>

<script setup lang="ts">
import type { MiniGame } from '@quizzup/shared'
import { MINI_GAMES } from '@quizzup/shared'
import { computed } from 'vue'

import { getGameMiniGameLabelKey } from '@/utils/game/format'

/** Choix des mini-jeux d'une partie : une case par mini-jeu, tous cochés par défaut (parent). */
const props = withDefaults(
  defineProps<{
    modelValue: MiniGame[]
    disabled?: boolean
    error?: string
  }>(),
  {
    disabled: false,
    error: undefined,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: MiniGame[]): void
}>()

const describedBy = computed(() => (props.error ? 'game-mini-games_error' : 'game-mini-games_hint'))

function isChecked(miniGame: MiniGame): boolean {
  return props.modelValue.includes(miniGame)
}

function onChange(miniGame: MiniGame, event: Event): void {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) {
    return
  }

  // Valeur émise toujours dans l'ordre de MINI_GAMES, sans doublon.
  emit(
    'update:modelValue',
    MINI_GAMES.filter((code) =>
      code === miniGame ? target.checked : props.modelValue.includes(code)
    )
  )
}
</script>

<style scoped>
.mini-games {
  display: grid;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.mini-games__legend {
  padding: 0;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-0);
}

.mini-games__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.mini-game {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-ui);
  border-radius: 12px;
  background: var(--bg-field);
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
  transition: var(--tr);
}

.mini-game:hover,
.mini-game:focus-within {
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px var(--glow-soft);
}

.mini-game--checked {
  border-color: rgba(87, 224, 176, 0.3);
  background: var(--ok-bg);
}

.mini-game--error {
  border-color: var(--danger);
}

.mini-game__checkbox {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--primary);
  cursor: pointer;
}

.mini-game__checkbox:disabled {
  cursor: not-allowed;
}

.mini-games__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.mini-games__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
