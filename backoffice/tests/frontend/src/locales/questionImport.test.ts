import { describe, expect, it } from 'vitest'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/*/questionImport.json', {
  eager: true,
}) as Record<string, { default: { questionImport: Messages } }>

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`))
    )
  )
}

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort()

const fr = flatten(modules['/frontend/src/locales/fr/questionImport.json']!.default.questionImport)
const en = flatten(modules['/frontend/src/locales/en/questionImport.json']!.default.questionImport)

describe('locales — questionImport', () => {
  it('has the same keys in French and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
  })

  it('has no empty text', () => {
    expect(Object.values(fr).filter((text) => text.trim() === '')).toEqual([])
    expect(Object.values(en).filter((text) => text.trim() === '')).toEqual([])
  })

  // vue-i18n lit « | » comme un séparateur de pluriel : sans plusieurs formes voulues, il faut
  // l'écrire {'|'}, sinon seul le texte après la barre s'affiche.
  it("writes the pipe of an error text as {'|'}", () => {
    for (const messages of [fr, en]) {
      const unescaped = Object.entries(messages).filter(
        ([key, text]) => key.startsWith('errors.') && /\|/.test(text.replaceAll("{'|'}", ''))
      )

      expect(unescaped).toEqual([])
    }
  })

  // Liste en dur : un code que l'écran peut afficher sans texte s'afficherait comme une clé brute.
  it.each([
    // 400 de la route d'import (openapi.yaml)
    ['invalid_query'],
    ['question_company_required'],
    ['csv_empty'],
    ['csv_encoding_invalid'],
    ['csv_header_invalid'],
    ['csv_too_many_rows'],
    ['csv_field_unterminated'],
    // Autres statuts de la route : 401, 403, 413, 415, 422 et 5xx (le service les ramène à ces codes)
    ['unauthorized'],
    ['forbidden'],
    ['file_too_large'],
    ['csv_content_type_unsupported'],
    ['csv_invalid'],
    ['server_error'],
    // Erreurs de ligne (backend/src/routes/questions/import.ts)
    ['csv_too_many_columns'],
    ['csv_theme_not_found'],
    ['csv_theme_ambiguous'],
    ['csv_audio_unsupported'],
    ['csv_media_url_required'],
    ['csv_media_url_invalid'],
    ['csv_correct_invalid'],
    ['csv_question_duplicate'],
    ['question_required'],
    ['question_theme_required'],
    ['question_kind_invalid'],
    ['question_type_media_invalid'],
    ['question_kind_media_invalid'],
    ['question_answers_min_required'],
    ['question_correct_answer_required'],
    ['question_true_false_answers_invalid'],
    ['question_estimate_answers_invalid'],
    // Codes de l'écran lui-même
    ['api_unreachable'],
    ['file_changed'],
  ])('has a text for the displayable code %s in both languages', (code) => {
    expect(fr[`errors.${code}`], `fr ${code}`).toBeTruthy()
    expect(en[`errors.${code}`], `en ${code}`).toBeTruthy()
  })

  it('gives the same placeholders to both languages', () => {
    for (const key of Object.keys(fr)) {
      expect(placeholders(en[key]!), key).toEqual(placeholders(fr[key]!))
    }
  })
})
