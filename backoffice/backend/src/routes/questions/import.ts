import {
  ANSWER_STATUS_DRAFT,
  QUESTION_IMPORT_MAX_BYTES,
  QUESTION_IMPORT_MAX_ROWS,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_VIDEO,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  type QuestionKind,
  type QuestionMediaType,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_DELETED,
  type ThemeScope,
} from '@quizzup/shared'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { CsvError, type CsvRecord, parseCsv } from '../../utils/csv'
import { importQuestionsQuerySchema } from './_schemas'
import {
  getCreateAnswerStatus,
  getCreateQuestionStatus,
  getCurrentAdminId,
  getQuestionCompanyId,
  getQuestionScope,
  getThemeUsableError,
  type QuestionInput,
  validateQuestionInput,
} from './_shared'

const REQUIRED_COLUMNS = ['theme', 'question', 'answer_1', 'answer_2', 'correct']
const OPTIONAL_COLUMNS = ['kind', 'answer_3', 'answer_4', 'media_type', 'media_url']
const KNOWN_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]
const ANSWER_COLUMNS = ['answer_1', 'answer_2', 'answer_3', 'answer_4']
const MAX_REPORTED_ERRORS = 200
/** `application/vnd.ms-excel` : le type qu'un navigateur Windows avec Excel donne à un `.csv`. */
const CSV_CONTENT_TYPES = ['text/csv', 'application/vnd.ms-excel']

/** Colonne à surligner pour les erreurs de `validateQuestionInput` (les autres n'en ont pas). */
const INPUT_ERROR_COLUMNS: Record<string, string> = {
  question_required: 'question',
  question_theme_required: 'theme',
  question_kind_invalid: 'kind',
  question_type_media_invalid: 'media_type',
  question_kind_media_invalid: 'media_type',
  question_answers_min_required: 'answer_2',
  question_correct_answer_required: 'correct',
  question_true_false_answers_invalid: 'answer_1',
  question_estimate_answers_invalid: 'answer_1',
}

type ImportError = { line: number; column: string | null; code: string }
type RowResult = { line: number; input: QuestionInput } | { line: number; error: ImportError }

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** Même clé pour « Quelle est la capitale ? » et « quelle  est la capitale ? ». */
function duplicateKey(themeId: number, question: string): string {
  return `${themeId}:${question.trim().replaceAll(/\s+/g, ' ').toLowerCase()}`
}

/**
 * Thèmes que l'appelant peut rattacher à une question de cette portée, par nom sans casse. En
 * portée globale, seuls les thèmes globaux comptent : un thème de compagnie homonyme ne doit ni
 * être choisi ni rendre le nom ambigu.
 */
async function loadThemeIdsByName(
  req: FastifyRequest,
  scope: ThemeScope,
  companyId: number | null
): Promise<Map<string, number[]>> {
  const themes = await db('themes')
    .select('id', 'name', 'scope', 'company_id', 'status')
    .whereNot('status', THEME_STATUS_DELETED)
    .orderBy('id', 'asc')
  const idsByName = new Map<string, number[]>()

  for (const theme of themes) {
    if (scope === THEME_SCOPE_GLOBAL && theme.scope !== THEME_SCOPE_GLOBAL) {
      continue
    }

    if (getThemeUsableError(theme, req, scope, companyId) === null) {
      const name = String(theme.name).trim().toLowerCase()

      idsByName.set(name, [...(idsByName.get(name) ?? []), Number(theme.id)])
    }
  }

  return idsByName
}

/** Une ligne du fichier : la première erreur trouvée, sinon la question prête à écrire. */
function readRow(
  record: CsvRecord,
  columns: string[],
  themeIdsByName: Map<string, number[]>
): RowResult {
  const { line } = record
  const cell = (name: string) => (record.fields[columns.indexOf(name)] ?? '').trim()
  const fail = (code: string, column: string | null): RowResult => ({
    line,
    error: { line, column, code },
  })

  // Un séparateur dans un texte non guillemeté décale toutes les colonnes : on refuse.
  if (record.fields.slice(columns.length).some((extra) => extra.trim() !== '')) {
    return fail('csv_too_many_columns', null)
  }

  const themeIds: number[] = []

  for (const name of cell('theme').split('|')) {
    if (name.trim() === '') {
      continue
    }

    const ids = themeIdsByName.get(name.trim().toLowerCase()) ?? []

    if (ids.length !== 1) {
      return fail(ids.length === 0 ? 'csv_theme_not_found' : 'csv_theme_ambiguous', 'theme')
    }

    themeIds.push(ids[0]!)
  }

  const typeMedia = cell('media_type').toLowerCase() || QUESTION_MEDIA_TYPE_NONE
  let mediaUrl: string | null = null

  if (typeMedia === QUESTION_MEDIA_TYPE_AUDIO) {
    return fail('csv_audio_unsupported', 'media_type')
  }

  if (typeMedia === QUESTION_MEDIA_TYPE_IMAGE || typeMedia === QUESTION_MEDIA_TYPE_VIDEO) {
    mediaUrl = cell('media_url')

    if (!mediaUrl) {
      return fail('csv_media_url_required', 'media_url')
    }

    if (!isHttpUrl(mediaUrl)) {
      return fail('csv_media_url_invalid', 'media_url')
    }
  }

  const responses = ANSWER_COLUMNS.map(cell)
  const correctNumbers = cell('correct')
    .split('|')
    .map((value) => value.trim())

  // `correct` compte les colonnes (1 à 4) : il doit désigner une réponse renseignée.
  if (correctNumbers.some((value) => !/^[1-4]$/.test(value) || !responses[Number(value) - 1])) {
    return fail('csv_correct_invalid', 'correct')
  }

  const validation = validateQuestionInput({
    question: cell('question'),
    themeIds,
    // Valeurs du fichier non encore contrôlées : `validateQuestionInput` les refuse si invalides.
    typeMedia: typeMedia as QuestionMediaType,
    kind: (cell('kind').toLowerCase() || undefined) as QuestionKind | undefined,
    mediaUrl,
    answers: responses.flatMap((response, index) =>
      response ? [{ response, isCorrect: correctNumbers.includes(String(index + 1)) }] : []
    ),
  })

  return 'error' in validation
    ? fail(validation.error, INPUT_ERROR_COLUMNS[validation.error] ?? null)
    : { line, input: validation.input }
}

/** Remplace par `csv_question_duplicate` les lignes valides qui répètent une question d'un thème. */
async function flagDuplicates(rows: RowResult[]): Promise<RowResult[]> {
  const themeIds = [...new Set(rows.flatMap((row) => ('input' in row ? row.input.themeIds : [])))]
  const seen = new Set<string>()

  if (themeIds.length > 0) {
    const existing = await db('questions')
      .join('question_themes', 'question_themes.question_id', 'questions.id')
      .whereIn('question_themes.theme_id', themeIds)
      .whereNot('questions.status', QUESTION_STATUS_DELETED)
      .select('question_themes.theme_id as themeId', 'questions.question as question')

    for (const row of existing) {
      seen.add(duplicateKey(Number(row.themeId), String(row.question)))
    }
  }

  return rows.map((row) => {
    if (!('input' in row)) {
      return row
    }

    const keys = row.input.themeIds.map((themeId) => duplicateKey(themeId, row.input.questionText))

    if (keys.some((key) => seen.has(key))) {
      return {
        line: row.line,
        error: { line: row.line, column: 'question', code: 'csv_question_duplicate' },
      }
    }

    keys.forEach((key) => seen.add(key))

    return row
  })
}

/** UTF-8 strict, sans octet nul (PostgreSQL le refuse dans un texte) : sinon `TypeError`. */
function decodeCsvBody(body: Buffer): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(body)

  if (text.includes('\0')) {
    throw new TypeError('csv_nul_byte')
  }

  return text
}

/** Avant de lire un corps de 1 Mo : connexion, droit de création de question, type du corps. */
async function rejectBeforeCsvParsing(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | undefined> {
  if (reply.sent) {
    return reply
  }

  if (!requireApiPermission(req, reply, API_RESOURCE.QUESTION, API_ACTION.CREATE)) {
    return reply
  }

  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase()

  // Sans cette garde, Fastify répondrait FST_ERR_CTP_INVALID_MEDIA_TYPE pour un type inconnu.
  return CSV_CONTENT_TYPES.includes(mediaType)
    ? undefined
    : reply.code(415).send({ error: 'csv_content_type_unsupported' })
}

const questionImportRoutes: FastifyPluginAsync = async (app) => {
  // Corps `text/csv` brut : le parseur n'existe que dans ce plugin, il ne change rien aux autres routes.
  app.addContentTypeParser(
    CSV_CONTENT_TYPES,
    { parseAs: 'buffer', bodyLimit: QUESTION_IMPORT_MAX_BYTES },
    (_req, body, done) => {
      done(null, body)
    }
  )

  app.post<{ Body: Buffer }>(
    '/questions/import',
    {
      onRequest: [app.authenticate, rejectBeforeCsvParsing],
      bodyLimit: QUESTION_IMPORT_MAX_BYTES,
    },
    async (req: FastifyRequest<{ Body: Buffer }>, reply: FastifyReply) => {
      const adminId = getCurrentAdminId(req)

      if (adminId === null) {
        return reply.code(401).send({ error: 'unauthorized' })
      }

      const parsedQuery = importQuestionsQuerySchema.safeParse(req.query)

      if (!parsedQuery.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_query', details: parsedQuery.error.flatten() })
      }

      const { dryRun, draft } = parsedQuery.data
      const scope = getQuestionScope(req, parsedQuery.data.scope)
      const companyId = getQuestionCompanyId(req, scope, parsedQuery.data.companyId)

      if (scope === THEME_SCOPE_COMPANY && companyId === null) {
        return reply.code(400).send({ error: 'question_company_required' })
      }

      let records: CsvRecord[]

      try {
        records = parseCsv(decodeCsvBody(req.body))
      } catch (error) {
        if (error instanceof CsvError) {
          return reply.code(400).send({ error: error.code, line: error.line })
        }

        if (error instanceof TypeError) {
          return reply.code(400).send({ error: 'csv_encoding_invalid' })
        }

        throw error
      }

      const [header, ...dataRecords] = records

      if (!header || dataRecords.length === 0) {
        return reply.code(400).send({ error: 'csv_empty' })
      }

      const columns = header.fields.map((name) => name.trim().toLowerCase())

      // Excel termine l'en-tête par des séparateurs vides (`…;correct;;`) : comme pour les données.
      while (columns.at(-1) === '') {
        columns.pop()
      }

      const badColumn =
        columns.find(
          (name, index) => !KNOWN_COLUMNS.includes(name) || columns.indexOf(name) !== index
        ) ?? REQUIRED_COLUMNS.find((name) => !columns.includes(name))

      if (badColumn !== undefined) {
        return reply.code(400).send({ error: 'csv_header_invalid', column: badColumn })
      }

      if (dataRecords.length > QUESTION_IMPORT_MAX_ROWS) {
        return reply.code(400).send({ error: 'csv_too_many_rows' })
      }

      const themeIdsByName = await loadThemeIdsByName(req, scope, companyId)
      const rows = await flagDuplicates(
        dataRecords.map((record) => readRow(record, columns, themeIdsByName))
      )
      const errors = rows.flatMap((row) => ('error' in row ? [row.error] : []))
      const questions = rows.flatMap((row) => ('input' in row ? [row] : []))

      if (dryRun) {
        return {
          dryRun: true,
          rows: rows.length,
          valid: questions.length,
          errors: errors.slice(0, MAX_REPORTED_ERRORS),
          questions: questions.map(({ line, input }) => ({
            line,
            question: input.questionText,
            kind: input.kind,
            themeIds: input.themeIds,
          })),
        }
      }

      if (errors.length > 0) {
        return reply
          .code(422)
          .send({ error: 'csv_invalid', errors: errors.slice(0, MAX_REPORTED_ERRORS) })
      }

      const questionStatus = draft ? QUESTION_STATUS_DRAFT : getCreateQuestionStatus(req)
      const answerStatus = draft ? ANSWER_STATUS_DRAFT : getCreateAnswerStatus(req)

      // Une seule transaction : une erreur de base annule tout le fichier.
      // ponytail: une requête par question (2 000 lignes au plus), un INSERT groupé si trop lent.
      await db.transaction(async (trx) => {
        for (const { input } of questions) {
          const [question] = await trx('questions')
            .insert({
              admin_id: adminId,
              company_id: companyId,
              scope,
              question: input.questionText,
              type_media: input.typeMedia,
              kind: input.kind,
              media_url: input.mediaUrl,
              status: questionStatus,
              deleted_at: null,
            })
            .returning('id')

          await trx('question_themes').insert(
            input.themeIds.map((themeId) => ({ question_id: question.id, theme_id: themeId }))
          )

          await trx('answers').insert(
            input.answers.map((answer) => ({
              admin_id: adminId,
              question_id: question.id,
              response: answer.response,
              is_correct: answer.isCorrect,
              status: answerStatus,
              deleted_at: null,
            }))
          )
        }
      })

      return reply.code(201).send({ created: questions.length })
    }
  )
}

export default questionImportRoutes
