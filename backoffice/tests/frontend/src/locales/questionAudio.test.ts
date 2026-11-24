import { QUESTION_AUDIO_EFFECTS } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import type { QuestionMediaErrorCode } from '@/services/questionMediaError'

type QuestionLocale = {
  questions: {
    form: {
      audio: { apiErrors: Record<string, string> }
      audioEffect: { options: Record<string, string>; errors: Record<string, string> }
    }
  }
}

const modules = import.meta.glob('/frontend/src/locales/*/question.json', {
  eager: true,
}) as Record<string, { default: QuestionLocale }>

// Un code que l'écran peut afficher sans texte s'afficherait comme une clé brute. Le type
// `ALL_LISTED` ne se compile plus si un code de `QuestionMediaErrorCode` manque à cette liste.
const CODES = [
  'question_media_required',
  'question_media_invalid_file',
  'question_media_rights_required',
  'question_media_duration_invalid',
  'question_media_not_found',
  'question_media_too_large',
  'question_media_type_unsupported',
  'invalid_query',
  'media_provider_unavailable',
  'question_media_provider_invalid',
  'question_not_found',
  'question_media_provider_track_not_found',
  'question_media_provider_no_preview',
  'question_kind_media_invalid',
  'forbidden',
  'api_unreachable',
  'server_error',
] as const satisfies readonly QuestionMediaErrorCode[]

const ALL_LISTED: [Exclude<QuestionMediaErrorCode, (typeof CODES)[number]>] extends [never]
  ? true
  : false = true

describe('locales — questions.form.audio.apiErrors', () => {
  it.each(['fr', 'en'])('has a text for every media error code in %s', (locale) => {
    const apiErrors =
      modules[`/frontend/src/locales/${locale}/question.json`]!.default.questions.form.audio
        .apiErrors

    expect(ALL_LISTED).toBe(true)

    for (const code of CODES) {
      expect(apiErrors[code]?.trim(), `${locale}: ${code}`).toBeTruthy()
    }
  })
})

describe('locales — questions.form.audioEffect', () => {
  it.each(['fr', 'en'])('names every effect and every API error in %s', (locale) => {
    const { options, errors } =
      modules[`/frontend/src/locales/${locale}/question.json`]!.default.questions.form.audioEffect

    for (const effect of QUESTION_AUDIO_EFFECTS) {
      expect(options[effect]?.trim(), `${locale}: ${effect}`).toBeTruthy()
    }

    for (const code of ['question_audio_effect_invalid', 'audio_effect_requires_audio']) {
      expect(errors[code]?.trim(), `${locale}: ${code}`).toBeTruthy()
    }
  })
})
