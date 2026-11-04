/**
 * Retypage de l'ancien contenu (décision d'Enzo, 2026-11-04). La migration `add_kind_to_questions`
 * a posé `kind = 'qcm'` sur toutes les questions existantes : vrais QCM, vrai/faux et estimations
 * confondus. On retype ici les `qcm` que le moteur de jeu déduit lui-même comme vrai/faux ou
 * estimation, avec EXACTEMENT sa règle (`game/engine/src/miniGames/questionRules.ts`), durcie par
 * celle du backoffice (`getQuestionKindAnswersError` de `@quizzup/shared`) pour que la question
 * reste modifiable sans être refusée à l'enregistrement. Au moindre doute, elle reste un QCM.
 *
 * Règle (question non supprimée, `type_media = 'none'`, toutes compagnies et contenu global ;
 * seules les réponses actives ou brouillons comptent) :
 * - vrai/faux : 2 réponses, une seule juste, libellés « Vrai » et « Faux » (casse, accents) ;
 * - estimation : 3 ou 4 réponses, une seule juste, chacune est une fourchette (commence par un
 *   nombre, éventuellement précédé de « Moins de », « Entre », « < »…) et au moins une porte un
 *   vrai marqueur de fourchette (« Entre 10 et 20 », « Moins de 5 », « 10-20 »). « 4 / 6 / 7 / 12 »
 *   ou des scores (« 3-0 / 2-1 ») restent des QCM, comme dans le moteur.
 *
 * Une migration de données est figée : la règle est donc copiée ici, pas importée de
 * `@quizzup/shared` (module ESM, et qui évoluera). Les questions retypées sont tracées dans
 * `question_kind_retypings` pour que `down` remette `qcm` sur exactement ces lignes.
 */

const KIND_QCM = 'qcm'
const KIND_TRUE_FALSE = 'true_false'
const KIND_ESTIMATE = 'estimate'

const QUESTION_STATUS_DELETED = 2
const ANSWER_STATUSES_PLAYED = [1, 3] // actif, brouillon

// --- Règle du moteur (copie de questionRules.ts) -------------------------------------------

/** Minuscules, sans accents ni espaces superflus. */
function normalizeText(text) {
  return text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const RANGE_WORD_PATTERN =
  /^(?:moins de|plus de|entre|de|au moins|au plus|jusqu'a|jusqu’a|avant|apres|[<>≤≥])\s*-?\d|\b(?:ou|et) (?:moins|plus|avant|apres)\b/

const LINKED_NUMBERS_PATTERN = /(-?\d+(?:[.,]\d+)?)\s*(?:a|et|-|–)\s*(-?\d+(?:[.,]\d+)?)/

function hasRangeMarker(text) {
  const normalized = normalizeText(text).replaceAll(/(\d)[\s\u00A0\u202F](?=\d)/g, "$1")
  if (RANGE_WORD_PATTERN.test(normalized)) {
    return true
  }

  const linked = LINKED_NUMBERS_PATTERN.exec(normalized)
  if (!linked?.[1] || !linked[2]) {
    return false
  }

  return Number(linked[1].replace(',', '.')) < Number(linked[2].replace(',', '.'))
}

// --- Règle du backoffice (copie de getQuestionKindAnswersError, @quizzup/shared) -------------

const ESTIMATE_RANGE_PREFIXES = [
  'moins de',
  'plus de',
  'entre',
  'de',
  'environ',
  'au moins',
  'au plus',
  "jusqu'a",
  'avant',
  'apres',
]

const ESTIMATE_RANGE_PATTERN = new RegExp(
  String.raw`^(?:(?:${ESTIMATE_RANGE_PREFIXES.join('|')})\s+|[<>≤≥~]\s*)?-?\d`
)

function normalizeAnswerLabel(value) {
  return value
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll('’', "'")
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Type déduit des réponses d'une question texte `qcm` : `true_false`, `estimate` ou `qcm`.
 *
 * @param {{ response: string, is_correct: boolean }[]} answers
 * @returns {'qcm' | 'true_false' | 'estimate'}
 */
function inferKind(answers) {
  const correctCount = answers.filter((answer) => answer.is_correct).length
  if (correctCount !== 1) {
    return KIND_QCM
  }

  const labels = new Set(answers.map((answer) => normalizeAnswerLabel(answer.response)))
  if (answers.length === 2 && labels.has('vrai') && labels.has('faux')) {
    return KIND_TRUE_FALSE
  }

  if (
    answers.length >= 3 &&
    answers.length <= 4 &&
    answers.every((answer) => ESTIMATE_RANGE_PATTERN.test(normalizeAnswerLabel(answer.response))) &&
    answers.some((answer) => hasRangeMarker(answer.response))
  ) {
    return KIND_ESTIMATE
  }

  return KIND_QCM
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('question_kind_retypings', (table) => {
    table.bigInteger('question_id').primary()
    table.foreign('question_id').references('id').inTable('questions').onDelete('CASCADE')
    table.string('kind', 20).notNullable()
    table.timestamp('retyped_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  const rows = await knex('questions')
    .join('answers', 'answers.question_id', 'questions.id')
    .where('questions.kind', KIND_QCM)
    .where('questions.type_media', 'none')
    .whereNot('questions.status', QUESTION_STATUS_DELETED)
    .whereIn('answers.status', ANSWER_STATUSES_PLAYED)
    .select('questions.id as question_id', 'answers.response', 'answers.is_correct')

  const answersByQuestion = new Map()
  for (const row of rows) {
    const questionId = String(row.question_id)
    answersByQuestion.set(questionId, [...(answersByQuestion.get(questionId) ?? []), row])
  }

  for (const [questionId, answers] of answersByQuestion) {
    const kind = inferKind(answers)
    if (kind === KIND_QCM) {
      continue
    }

    await knex('questions').where({ id: questionId }).update({ kind })
    await knex('question_kind_retypings').insert({ question_id: questionId, kind })
  }
}

/**
 * Remet `qcm` sur exactement les questions retypées par `up` (et seulement si leur type n'a
 * pas été modifié depuis).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.raw(
    `UPDATE questions SET kind = ?
     FROM question_kind_retypings r
     WHERE r.question_id = questions.id AND questions.kind = r.kind`,
    [KIND_QCM]
  )

  await knex.schema.dropTable('question_kind_retypings')
}

exports.inferKind = inferKind
