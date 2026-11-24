import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
} from '@frontend-tests/_helpers/authStateMock'
import { missingMessageKeys } from '@frontend-tests/_helpers/i18nMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  createThemeServiceMock,
  mockCreateThemeFailure,
  updateThemeServiceMock,
} from '@frontend-tests/_helpers/themesServiceMock'
import {
  THEME_MODE_AUDIO,
  THEME_MODE_CLASSIC,
  THEME_SCOPE_COMPANY,
  THEME_STATUS_ACTIVE,
} from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import type { Theme } from '@/types/theme'
import ThemeDetailForm from '@/views/themes/detail/ThemeDetailForm.vue'

resetFrontendMocksBeforeEach()

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 3,
    adminId: 1,
    companyId: 1,
    scope: THEME_SCOPE_COMPANY,
    name: 'Company theme',
    mode: THEME_MODE_CLASSIC,
    status: THEME_STATUS_ACTIVE,
    ...overrides,
  }
}

function mountAudioForm(theme: Theme | null = null) {
  setAuthenticatedAdmin()

  return mountWithFrontendMocks(ThemeDetailForm, {
    props: { theme, mode: theme ? 'edit' : 'create', canEdit: true },
  })
}

async function submit(wrapper: ReturnType<typeof mountAudioForm>) {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await nextTick()
}

describe('views/themes/detail/ThemeDetailForm.vue', () => {
  it('creates a theme and emits the saved theme', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: null, mode: 'create', canEdit: true },
    })

    await wrapper.find('input').setValue('Culture générale')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await nextTick()

    expect(createThemeServiceMock).toHaveBeenCalledWith({
      name: 'Culture générale',
      mode: THEME_MODE_CLASSIC,
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('updates an existing theme in edit mode', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: makeTheme(), mode: 'edit', canEdit: true },
    })

    await wrapper.find('input').setValue('Renommé')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await nextTick()

    expect(updateThemeServiceMock).toHaveBeenCalledWith(3, {
      name: 'Renommé',
      mode: THEME_MODE_CLASSIC,
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('renders a read-only form and hides the submit action when the theme is not editable', () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: makeTheme(), mode: 'edit', canEdit: false },
    })

    // Bandeau lecture seule + champ désactivé + pas de bouton de soumission.
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('themes.form.readonly')
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="form-actions-submit"]').exists()).toBe(false)
  })

  it('does not submit a read-only theme', async () => {
    setAuthenticatedAdmin()

    const wrapper = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: makeTheme(), mode: 'edit', canEdit: false },
    })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateThemeServiceMock).not.toHaveBeenCalled()
  })

  it('exposes scope controls to superadmins only', () => {
    setAuthenticatedSuperadmin()
    const superadminForm = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: null, mode: 'create', canEdit: true },
    })

    // mode + scope pour un superadmin.
    expect(superadminForm.findAll('select')).toHaveLength(2)

    setAuthenticatedAdmin()
    const adminForm = mountWithFrontendMocks(ThemeDetailForm, {
      props: { theme: null, mode: 'create', canEdit: true },
    })

    // Seul le mode est proposé à un admin.
    expect(adminForm.findAll('select')).toHaveLength(1)
  })

  describe('playlist link', () => {
    const PLAYLIST_URL = 'https://www.deezer.com/fr/playlist/1234567'
    const PLAYLIST_INPUT = 'input[name="playlistLink"]'

    it('shows the field in audio mode only', async () => {
      const wrapper = mountAudioForm()

      expect(wrapper.find(PLAYLIST_INPUT).exists()).toBe(false)

      await wrapper.find('select').setValue(THEME_MODE_AUDIO)
      expect(wrapper.find(PLAYLIST_INPUT).exists()).toBe(true)

      await wrapper.find('select').setValue(THEME_MODE_CLASSIC)
      expect(wrapper.find(PLAYLIST_INPUT).exists()).toBe(false)
    })

    it('sends the identifier extracted from the link', async () => {
      const wrapper = mountAudioForm()

      await wrapper.find('input').setValue('Rock')
      await wrapper.find('select').setValue(THEME_MODE_AUDIO)
      await wrapper.find(PLAYLIST_INPUT).setValue(PLAYLIST_URL)
      await submit(wrapper)

      expect(createThemeServiceMock).toHaveBeenCalledWith({
        name: 'Rock',
        mode: THEME_MODE_AUDIO,
        playlistRef: '1234567',
      })
    })

    it('sends no playlist when the field stays empty', async () => {
      const wrapper = mountAudioForm()

      await wrapper.find('input').setValue('Rock')
      await wrapper.find('select').setValue(THEME_MODE_AUDIO)
      await submit(wrapper)

      expect(createThemeServiceMock).toHaveBeenCalledWith({ name: 'Rock', mode: THEME_MODE_AUDIO })
    })

    it('rejects a link without identifier and sends nothing', async () => {
      const wrapper = mountAudioForm()

      await wrapper.find('input').setValue('Rock')
      await wrapper.find('select').setValue(THEME_MODE_AUDIO)
      await wrapper.find(PLAYLIST_INPUT).setValue('https://link.deezer.com/s/abc')
      await submit(wrapper)

      expect(createThemeServiceMock).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('themes.form.errors.playlistLinkInvalid')
    })

    it('prefills the identifier of an existing theme and clears it when emptied', async () => {
      const wrapper = mountAudioForm(makeTheme({ mode: THEME_MODE_AUDIO, playlistRef: '1234567' }))

      expect((wrapper.find(PLAYLIST_INPUT).element as HTMLInputElement).value).toBe('1234567')

      await wrapper.find(PLAYLIST_INPUT).setValue('')
      await submit(wrapper)

      expect(updateThemeServiceMock).toHaveBeenCalledWith(3, {
        name: 'Company theme',
        mode: THEME_MODE_AUDIO,
        playlistRef: null,
      })
    })

    it('does not send the playlist once the theme leaves the audio mode', async () => {
      const wrapper = mountAudioForm(makeTheme({ mode: THEME_MODE_AUDIO, playlistRef: '1234567' }))

      await wrapper.find('select').setValue(THEME_MODE_CLASSIC)
      await submit(wrapper)

      expect(updateThemeServiceMock).toHaveBeenCalledWith(3, {
        name: 'Company theme',
        mode: THEME_MODE_CLASSIC,
      })
    })

    it.each([
      'theme_playlist_not_found',
      'theme_playlist_too_small',
      'theme_playlist_ref_invalid',
      'theme_playlist_mode_invalid',
      'media_provider_unavailable',
    ])('shows the text of the server error %s', async (code) => {
      mockCreateThemeFailure(code)
      const wrapper = mountAudioForm()

      await wrapper.find('input').setValue('Rock')
      await wrapper.find('select').setValue(THEME_MODE_AUDIO)
      await wrapper.find(PLAYLIST_INPUT).setValue(PLAYLIST_URL)
      await submit(wrapper)

      expect(wrapper.find('[data-test="form-result-error"]').text()).toBe(
        `themes.errors.apiErrors.${code}`
      )
      expect(wrapper.emitted('saved')).toBeUndefined()
    })

    it('falls back to the generic server error for an unknown code', async () => {
      mockCreateThemeFailure('code_inconnu')
      missingMessageKeys.add('themes.errors.apiErrors.code_inconnu')
      const wrapper = mountAudioForm()

      try {
        await wrapper.find('input').setValue('Rock')
        await submit(wrapper)

        expect(wrapper.find('[data-test="form-result-error"]').text()).toBe(
          'themes.errors.serverError'
        )
      } finally {
        missingMessageKeys.clear()
      }
    })
  })
})
