<template>
  <div class="track-search">
    <!-- Dans le formulaire de la question : Entrée lance la recherche, jamais l'enregistrement. -->
    <div class="track-search__form" role="search" @keydown.enter.prevent="submitSearch">
      <FormField
        id="question-audio-search"
        v-model="query"
        class="track-search__field"
        name="audio-search"
        :label="$t('questions.form.audio.search.label')"
        :placeholder="$t('questions.form.audio.search.placeholder')"
        :disabled="disabled"
        :error="queryError"
        autocomplete="off"
        inputmode="search"
      />

      <UiButton
        type="button"
        class="track-search__submit"
        :disabled="disabled || status === 'loading'"
        data-test="track-search-submit"
        @click="submitSearch"
      >
        <MdIcon :path="mdiMagnify" :size="18" />
        {{ $t('questions.form.audio.search.submit') }}
      </UiButton>
    </div>

    <p class="track-search__status" aria-live="polite" data-test="track-search-status">
      {{ statusText }}
    </p>

    <p v-if="errorText" class="track-search__error" role="alert" data-test="track-search-error">
      {{ errorText }}
    </p>

    <p v-if="playError" class="track-search__error" role="alert" data-test="track-play-error">
      {{ playError }}
    </p>

    <ul v-if="results.length > 0" class="track-search__results">
      <li
        v-for="track in results"
        :key="track.ref"
        class="track-search__item"
        :class="{ 'track-search__item--muted': !track.previewUrl }"
        data-test="track-result"
      >
        <img
          v-if="track.coverUrl"
          class="track-search__cover"
          :src="track.coverUrl"
          alt=""
          width="48"
          height="48"
          loading="lazy"
        />
        <span v-else class="track-search__cover track-search__cover--empty" aria-hidden="true">
          <MdIcon :path="mdiMusicNote" :size="20" />
        </span>

        <span class="track-search__text">
          <span class="track-search__title" data-test="track-title">{{ track.title }}</span>
          <span class="track-search__meta" data-test="track-meta">
            {{ track.artist }} · {{ track.album }}
          </span>
          <span v-if="!track.previewUrl" class="track-search__meta" data-test="track-no-preview">
            {{ $t('questions.form.audio.search.noPreview') }}
          </span>
        </span>

        <UiButton
          v-if="track.previewUrl"
          type="button"
          variant="icon"
          class="track-search__action"
          :disabled="disabled"
          :title="playLabel(track)"
          :aria-label="playLabel(track)"
          data-test="track-play"
          @click="togglePlay(track)"
        >
          <MdIcon :path="playingRef === track.ref ? mdiStop : mdiPlay" :size="18" />
        </UiButton>

        <UiButton
          type="button"
          class="track-search__action"
          :disabled="disabled || !track.previewUrl"
          :aria-label="$t('questions.form.audio.search.chooseNamed', { track: label(track) })"
          data-test="track-choose"
          @click="choose(track)"
        >
          {{ $t('questions.form.audio.search.choose') }}
        </UiButton>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { mdiMagnify, mdiMusicNote, mdiPlay, mdiStop } from '@mdi/js'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import FormField from '@/components/ui/form/FormField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { QuestionMediaError } from '@/services/questionMediaError'
import { searchMediaCatalogTracksService } from '@/services/questionMediaService'
import type { MediaCatalogTrack } from '@/types/question'
import { formatTrackLabel, normalizeTrackQuery } from '@/utils/question/audio'

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })

const emit = defineEmits<{
  (event: 'choose', track: MediaCatalogTrack): void
}>()

const { t } = useI18n()

type SearchStatus = 'idle' | 'loading' | 'done' | 'error'

const query = ref('')
const queryError = ref<string | undefined>(undefined)
const status = ref<SearchStatus>('idle')
const results = ref<MediaCatalogTrack[]>([])
const errorText = ref<string | null>(null)
const playError = ref<string | null>(null)
const playingRef = ref<string | null>(null)

let searchToken = 0
let audio: HTMLAudioElement | null = null

const statusText = computed(() => {
  if (status.value === 'loading') {
    return t('questions.form.audio.search.loading')
  }

  if (status.value === 'done') {
    return results.value.length > 0
      ? t(
          'questions.form.audio.search.results',
          { count: results.value.length },
          results.value.length
        )
      : t('questions.form.audio.search.empty')
  }

  return status.value === 'idle' ? t('questions.form.audio.search.idle') : ''
})

function label(track: MediaCatalogTrack): string {
  return formatTrackLabel(track)
}

function playLabel(track: MediaCatalogTrack): string {
  return playingRef.value === track.ref
    ? t('questions.form.audio.search.stopNamed', { track: label(track) })
    : t('questions.form.audio.search.playNamed', { track: label(track) })
}

function stopPlayback(): void {
  audio?.pause()
  playingRef.value = null
}

async function submitSearch(): Promise<void> {
  const normalized = normalizeTrackQuery(query.value)

  if (!normalized) {
    queryError.value = t('questions.form.audio.search.errors.tooShort')
    return
  }

  queryError.value = undefined
  errorText.value = null
  playError.value = null
  stopPlayback()

  // Une réponse arrivée après une recherche plus récente est ignorée.
  searchToken += 1
  const token = searchToken

  status.value = 'loading'
  results.value = []

  try {
    const tracks = await searchMediaCatalogTracksService(normalized)

    if (token !== searchToken) {
      return
    }

    results.value = tracks
    status.value = 'done'
  } catch (error) {
    if (token !== searchToken) {
      return
    }

    const code = error instanceof QuestionMediaError ? error.code : 'server_error'

    errorText.value = t('questions.form.audio.search.failed', {
      reason: t(`questions.form.audio.apiErrors.${code}`),
    })
    status.value = 'error'
  }
}

async function togglePlay(track: MediaCatalogTrack): Promise<void> {
  const wasPlaying = playingRef.value === track.ref

  playError.value = null
  stopPlayback()

  if (wasPlaying || !track.previewUrl) {
    return
  }

  audio ??= createAudio()
  audio.src = track.previewUrl
  playingRef.value = track.ref

  try {
    await audio.play()
  } catch {
    // Une lecture coupée par un autre clic n'est pas une erreur.
    if (playingRef.value === track.ref) {
      playingRef.value = null
      playError.value = t('questions.form.audio.search.errors.playFailed')
    }
  }
}

function createAudio(): HTMLAudioElement {
  const element = new Audio()

  element.addEventListener('ended', () => {
    playingRef.value = null
  })

  return element
}

function choose(track: MediaCatalogTrack): void {
  if (!track.previewUrl) {
    return
  }

  stopPlayback()
  emit('choose', track)
}

onBeforeUnmount(() => {
  searchToken += 1
  stopPlayback()
  audio?.removeAttribute('src')
})
</script>

<style scoped>
.track-search {
  display: grid;
  gap: 12px;
}

.track-search__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
}

.track-search__field {
  min-width: 0;
}

.track-search__submit,
.track-search__action {
  min-height: 48px;
}

.track-search__action {
  min-width: 48px;
}

.track-search__status {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.track-search__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  font-weight: 800;
}

.track-search__results {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.track-search__item {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--surface-inset);
}

.track-search__item--muted .track-search__title {
  color: var(--text-2);
}

.track-search__cover {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

.track-search__cover--empty {
  display: grid;
  place-items: center;
  background: var(--surface-2);
  color: var(--text-2);
}

.track-search__text {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.track-search__title {
  overflow: hidden;
  color: var(--text-0);
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-search__meta {
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 820px) {
  .track-search__form {
    grid-template-columns: 1fr;
  }

  .track-search__item {
    grid-template-columns: 48px minmax(0, 1fr) auto;
  }

  .track-search__item .track-search__action:last-child {
    grid-column: 1 / -1;
  }
}
</style>
