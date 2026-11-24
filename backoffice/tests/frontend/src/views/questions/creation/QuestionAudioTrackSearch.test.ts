import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import {
  mediaTrack,
  searchMediaCatalogTracksServiceMock,
} from '@frontend-tests/_helpers/questionMediaServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QuestionMediaError } from '@/services/questionMediaError'
import type { MediaCatalogTrack } from '@/types/question'
import QuestionAudioTrackSearch from '@/views/questions/creation/QuestionAudioTrackSearch.vue'

resetFrontendMocksBeforeEach()

async function playOk(): Promise<void> {}

async function playRefused(): Promise<void> {
  throw new Error('NotAllowedError')
}

// Élément `Audio` simulé : on compte les instances, les lectures et les arrêts.
class FakeAudio {
  static instances: FakeAudio[] = []

  src = ''
  play = vi.fn(playOk)
  pause = vi.fn()
  removeAttribute = vi.fn()
  private listeners: Record<string, () => void> = {}

  constructor() {
    FakeAudio.instances.push(this)
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners[name] = listener
  }

  emit(name: string): void {
    this.listeners[name]?.()
  }
}

const trackA = mediaTrack({ ref: '1', title: 'Bohemian Rhapsody', previewUrl: 'https://cdn/a.mp3' })
const trackB = mediaTrack({
  ref: '2',
  title: 'Radio Ga Ga',
  album: 'The Works',
  coverUrl: null,
  previewUrl: 'https://cdn/b.mp3',
})
const trackNoPreview = mediaTrack({ ref: '3', title: 'Muet', previewUrl: null })

beforeEach(() => {
  FakeAudio.instances = []
  vi.stubGlobal('Audio', FakeAudio)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mountSearch(props: Record<string, unknown> = {}): VueWrapper {
  return mountWithFrontendMocks(QuestionAudioTrackSearch, { props })
}

// Pendant une recherche le bouton est inactif : Entrée est alors la seule façon d'en relancer une.
async function searchWithEnter(wrapper: VueWrapper, text: string): Promise<void> {
  const input = wrapper.find('input[name="audio-search"]')

  await input.setValue(text)
  await input.trigger('keydown', { key: 'Enter' })
  await flushPromises()
}

async function search(wrapper: VueWrapper, text: string): Promise<void> {
  await wrapper.find('input[name="audio-search"]').setValue(text)
  await wrapper.find('[data-test="track-search-submit"]').trigger('click')
  await flushPromises()
}

function status(wrapper: VueWrapper): string {
  return wrapper.find('[data-test="track-search-status"]').text()
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })

  return { promise, resolve, reject }
}

describe('views/questions/creation/QuestionAudioTrackSearch.vue', () => {
  it('starts without a search: labelled field, hint, no result', () => {
    const wrapper = mountSearch()

    expect(wrapper.find('[data-test="form-field-label"]').text()).toBe(
      'questions.form.audio.search.label'
    )
    expect(status(wrapper)).toBe('questions.form.audio.search.idle')
    expect(wrapper.find('[data-test="track-result"]').exists()).toBe(false)
    expect(searchMediaCatalogTracksServiceMock).not.toHaveBeenCalled()
  })

  it('does not search while typing, only on validation', async () => {
    const wrapper = mountSearch()

    await wrapper.find('input[name="audio-search"]').setValue('queen')

    expect(searchMediaCatalogTracksServiceMock).not.toHaveBeenCalled()
  })

  it('searches with the trimmed query on the button', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA])
    const wrapper = mountSearch()

    await search(wrapper, '  queen  ')

    expect(searchMediaCatalogTracksServiceMock).toHaveBeenCalledTimes(1)
    expect(searchMediaCatalogTracksServiceMock).toHaveBeenCalledWith('queen')
  })

  it('searches on Enter without submitting the surrounding form', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA])
    const wrapper = mountSearch()
    const input = wrapper.find('input[name="audio-search"]')

    await input.setValue('queen')

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    input.element.dispatchEvent(event)
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    expect(searchMediaCatalogTracksServiceMock).toHaveBeenCalledWith('queen')
  })

  it.each(['', '   ', ' a '])(
    'refuses the query %j on screen without calling the API',
    async (text) => {
      const wrapper = mountSearch()

      await search(wrapper, text)

      expect(searchMediaCatalogTracksServiceMock).not.toHaveBeenCalled()
      expect(wrapper.find('[data-test="form-field-error"]').text()).toBe(
        'questions.form.audio.search.errors.tooShort'
      )
    }
  )

  it('shows a loading state, then the results with their count', async () => {
    const pending = deferred<MediaCatalogTrack[]>()
    searchMediaCatalogTracksServiceMock.mockReturnValue(pending.promise)
    const wrapper = mountSearch()

    await search(wrapper, 'queen')

    expect(status(wrapper)).toBe('questions.form.audio.search.loading')
    expect(wrapper.find('[data-test="track-search-status"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.find('[data-test="track-search-submit"]').attributes('disabled')).toBeDefined()

    pending.resolve([trackA, trackB])
    await flushPromises()

    expect(status(wrapper)).toBe('questions.form.audio.search.results')
    expect(wrapper.findAll('[data-test="track-result"]')).toHaveLength(2)
    expect(wrapper.find('[data-test="track-search-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('shows title, artist, album and a decorative cover', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA, trackB])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')

    const [first, second] = wrapper.findAll('[data-test="track-result"]')

    expect(first?.find('[data-test="track-title"]').text()).toBe('Bohemian Rhapsody')
    expect(first?.find('[data-test="track-meta"]').text()).toBe('Queen · A Night at the Opera')
    expect(first?.find('img').attributes('alt')).toBe('')
    expect(first?.find('img').attributes('src')).toBe('https://cdn.example/cover.jpg')
    expect(second?.find('img').exists()).toBe(false)
  })

  it('shows the empty state when nothing matches', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([])
    const wrapper = mountSearch()

    await search(wrapper, 'zzzz')

    expect(status(wrapper)).toBe('questions.form.audio.search.empty')
    expect(wrapper.find('[data-test="track-result"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="track-search-error"]').exists()).toBe(false)
  })

  it('shows an alert, no result and no empty message when the search fails', async () => {
    searchMediaCatalogTracksServiceMock.mockRejectedValue(
      new QuestionMediaError('media_provider_unavailable')
    )
    const wrapper = mountSearch()

    await search(wrapper, 'queen')

    const alert = wrapper.find('[data-test="track-search-error"]')

    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe('questions.form.audio.search.failed')
    expect(status(wrapper)).toBe('')
    expect(wrapper.find('[data-test="track-result"]').exists()).toBe(false)
  })

  it('clears the previous error and results on a new search', async () => {
    searchMediaCatalogTracksServiceMock.mockRejectedValueOnce(
      new QuestionMediaError('server_error')
    )
    searchMediaCatalogTracksServiceMock.mockResolvedValueOnce([trackA])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await search(wrapper, 'queen')

    expect(wrapper.find('[data-test="track-search-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="track-result"]')).toHaveLength(1)
  })

  it('ignores the late answer of a previous search', async () => {
    const first = deferred<MediaCatalogTrack[]>()
    const second = deferred<MediaCatalogTrack[]>()
    searchMediaCatalogTracksServiceMock.mockReturnValueOnce(first.promise)
    searchMediaCatalogTracksServiceMock.mockReturnValueOnce(second.promise)
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await searchWithEnter(wrapper, 'abba')

    second.resolve([trackB])
    await flushPromises()
    first.resolve([trackA])
    await flushPromises()

    const titles = wrapper.findAll('[data-test="track-title"]').map((title) => title.text())

    expect(titles).toEqual(['Radio Ga Ga'])
  })

  it('ignores a late failure of a previous search', async () => {
    const first = deferred<MediaCatalogTrack[]>()
    searchMediaCatalogTracksServiceMock.mockReturnValueOnce(first.promise)
    searchMediaCatalogTracksServiceMock.mockResolvedValueOnce([trackB])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await searchWithEnter(wrapper, 'abba')

    first.reject(new QuestionMediaError('server_error'))
    await flushPromises()

    expect(wrapper.find('[data-test="track-search-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="track-result"]')).toHaveLength(1)
  })

  it('shows a track without preview but does not let it be chosen', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackNoPreview])
    const wrapper = mountSearch()

    await search(wrapper, 'muet')

    const row = wrapper.find('[data-test="track-result"]')

    expect(row.find('[data-test="track-title"]').text()).toBe('Muet')
    expect(row.find('[data-test="track-no-preview"]').text()).toBe(
      'questions.form.audio.search.noPreview'
    )
    expect(row.find('[data-test="track-play"]').exists()).toBe(false)
    expect(row.find('[data-test="track-choose"]').attributes('disabled')).toBeDefined()

    await row.find('[data-test="track-choose"]').trigger('click')

    expect(wrapper.emitted('choose')).toBeUndefined()
  })

  it('emits the chosen track', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA, trackB])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await wrapper.findAll('[data-test="track-choose"]')[1]?.trigger('click')

    expect(wrapper.emitted('choose')).toEqual([[trackB]])
  })

  it('plays one excerpt at a time with the native audio element', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA, trackB])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')

    const [playA, playB] = wrapper.findAll('[data-test="track-play"]')

    await playA?.trigger('click')
    await flushPromises()

    expect(FakeAudio.instances).toHaveLength(1)

    const audio = FakeAudio.instances[0]!

    expect(audio.src).toBe('https://cdn/a.mp3')
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(playA?.attributes('aria-label')).toBe('questions.form.audio.search.stopNamed')

    await playB?.trigger('click')
    await flushPromises()

    expect(FakeAudio.instances).toHaveLength(1)
    expect(audio.pause).toHaveBeenCalledTimes(1)
    expect(audio.src).toBe('https://cdn/b.mp3')
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(playA?.attributes('aria-label')).toBe('questions.form.audio.search.playNamed')
    expect(playB?.attributes('aria-label')).toBe('questions.form.audio.search.stopNamed')
  })

  it('stops the excerpt when its button is pressed again and when it ends', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')

    const play = wrapper.find('[data-test="track-play"]')

    await play.trigger('click')
    await flushPromises()
    await play.trigger('click')

    const audio = FakeAudio.instances[0]!

    expect(audio.pause).toHaveBeenCalledTimes(1)
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(play.attributes('aria-label')).toBe('questions.form.audio.search.playNamed')

    await play.trigger('click')
    await flushPromises()
    audio.emit('ended')
    await flushPromises()

    expect(play.attributes('aria-label')).toBe('questions.form.audio.search.playNamed')
  })

  it('stops the excerpt when a new search starts', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await wrapper.find('[data-test="track-play"]').trigger('click')
    await flushPromises()
    await search(wrapper, 'abba')

    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalledTimes(1)
  })

  it('stops the excerpt when a track is chosen', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await wrapper.find('[data-test="track-play"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="track-choose"]').trigger('click')

    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalledTimes(1)
  })

  it('stops the excerpt and ignores a pending search when unmounted', async () => {
    const pending = deferred<MediaCatalogTrack[]>()
    searchMediaCatalogTracksServiceMock.mockResolvedValueOnce([trackA])
    searchMediaCatalogTracksServiceMock.mockReturnValueOnce(pending.promise)
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await wrapper.find('[data-test="track-play"]').trigger('click')
    await flushPromises()
    await search(wrapper, 'abba')
    wrapper.unmount()

    pending.resolve([trackB])
    await flushPromises()

    const audio = FakeAudio.instances[0]!

    expect(audio.pause).toHaveBeenCalledTimes(2)
    expect(audio.removeAttribute).toHaveBeenCalledWith('src')
  })

  it('shows an alert when the browser cannot play the excerpt', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA])
    vi.stubGlobal(
      'Audio',
      class extends FakeAudio {
        override play = vi.fn(playRefused)
      }
    )
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await wrapper.find('[data-test="track-play"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="track-play-error"]').text()).toBe(
      'questions.form.audio.search.errors.playFailed'
    )
    expect(wrapper.find('[data-test="track-play"]').attributes('aria-label')).toBe(
      'questions.form.audio.search.playNamed'
    )
  })

  it('disables every action when the field is disabled', async () => {
    searchMediaCatalogTracksServiceMock.mockResolvedValue([trackA])
    const wrapper = mountSearch()

    await search(wrapper, 'queen')
    await wrapper.setProps({ disabled: true })

    expect(wrapper.find('input[name="audio-search"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="track-search-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="track-play"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="track-choose"]').attributes('disabled')).toBeDefined()
  })
})
