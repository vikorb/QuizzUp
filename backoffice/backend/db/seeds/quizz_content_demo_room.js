require('dotenv').config()
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const bcrypt = require('bcryptjs')

/**
 * Données de démonstration « version testable » : une compagnie prête à jouer.
 *
 * - compagnie « QuizzUP Démo » + son admin (backoffice) ;
 * - salle « Salle 1 » + son compte de salle (rôle `room`, US-ROOM-02) ;
 * - deux thèmes blind test de 10 questions audio chacun (« Mélodies du domaine public » et
 *   « Sons synthétiques »), pour que le joueur désigné ait vraiment un thème à choisir. Les
 *   extraits sont copiés dans le stockage média (`MEDIA_STORAGE_DIR`). Les MP3 sont synthétisés
 *   par `scripts/demo/generate-demo-audio.py` (œuvres du domaine public jouées par calcul, sons
 *   fabriqués) : aucun enregistrement tiers, donc libres de droits.
 *
 * Le nom du fichier le fait passer APRÈS `quizz_content.js` (qui vide le contenu) : knex
 * exécute les seeds par ordre alphabétique. Idempotent : comptes et salle réactivés, thèmes créés
 * seulement s'ils n'existent pas déjà.
 * `DEMO_SEED=false` désactive ce seed.
 */

const ADMIN_ROLE_ADMIN = 'admin'
const ADMIN_ROLE_ROOM = 'room'
const STATUS_ACTIVE = 1
const THEME_SCOPE_COMPANY = 'company'
const QUESTION_MEDIA_TYPE_AUDIO = 'audio'
const AUDIO_MIME_TYPE = 'audio/mpeg'
const EXTRACT_DURATION_MS = 26000

const MEDIA_SOURCE_DIR = path.join(__dirname, 'demo-media')

// Fichier (sans extension) → titre affiché comme réponse.
const DEMO_THEMES = [
  {
    name: 'Mélodies du domaine public',
    question: 'Quelle est cette mélodie ?',
    items: [
      { file: 'frere-jacques', title: 'Frère Jacques' },
      { file: 'au-clair-de-la-lune', title: 'Au clair de la lune' },
      { file: 'ah-vous-dirai-je-maman', title: 'Ah ! vous dirai-je, maman' },
      { file: 'ode-a-la-joie', title: 'Ode à la joie (Beethoven)' },
      { file: 'lettre-a-elise', title: 'La Lettre à Élise (Beethoven)' },
      { file: 'petite-musique-de-nuit', title: 'Une petite musique de nuit (Mozart)' },
      { file: 'roi-de-la-montagne', title: 'Dans l’antre du roi de la montagne (Grieg)' },
      { file: 'la-marseillaise', title: 'La Marseillaise' },
      { file: 'lac-des-cygnes', title: 'Le Lac des cygnes (Tchaïkovski)' },
      { file: 'beau-danube-bleu', title: 'Le Beau Danube bleu (Strauss)' },
    ],
  },
  {
    name: 'Sons synthétiques',
    question: 'Quel est ce son ?',
    items: [
      { file: 'sirene-pompiers', title: 'Sirène de pompiers' },
      { file: 'sirene-americaine', title: 'Sirène de police américaine' },
      { file: 'tonalite-occupe', title: 'Tonalité « occupé »' },
      { file: 'morse-sos', title: 'SOS en morse' },
      { file: 'reveil', title: 'Réveil électronique' },
      { file: 'carillon-porte', title: 'Carillon de porte' },
      { file: 'tic-tac', title: 'Tic-tac d’horloge' },
      { file: 'telephone-ancien', title: 'Sonnerie de vieux téléphone' },
      { file: 'sonar', title: 'Sonar de sous-marin' },
      { file: 'battements-coeur', title: 'Battements de cœur' },
    ],
  },
]

function getMediaStorageDir() {
  return process.env.MEDIA_STORAGE_DIR || path.resolve(process.cwd(), 'storage/media')
}

/** 4 propositions : la bonne + les 3 suivantes du thème (en boucle). Le moteur mélange. */
function buildAnswers(items, index) {
  return [0, 1, 2, 3].map((offset) => ({
    response: items[(index + offset) % items.length].title,
    isCorrect: offset === 0,
  }))
}

/** Copie l'extrait dans le stockage média et renseigne la question (US-MEDIA-01). */
function saveExtract(storageDir, questionId, file, writtenFiles) {
  const content = fs.readFileSync(path.join(MEDIA_SOURCE_DIR, `${file}.mp3`))
  // Même format de clé que `buildQuestionMediaKey` (backend/src/storage/mediaStorage.ts).
  const mediaKey = `questions/${questionId}/${crypto.randomUUID()}.mp3`
  const target = path.join(storageDir, ...mediaKey.split('/'))
  // Question toute neuve : un dossier existant à son id vient d'une question effacée par
  // le TRUNCATE de quizz_content.js (ids remis à zéro). On le vide pour ne pas l'empiler.
  fs.rmSync(path.dirname(target), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
  writtenFiles.push(target)

  return { mediaKey, size: content.length }
}

async function seedTheme(trx, { adminId, companyId, storageDir, writtenFiles }, themeSeed) {
  // Thème déjà présent (seed lancé seul, sans quizz_content.js) : on n'y touche pas, il peut
  // être référencé par l'historique des parties (game_rounds / game_answers).
  const existingTheme = await trx('themes')
    .where({ company_id: companyId, name: themeSeed.name })
    .whereNot('status', 2)
    .first('id')
  if (existingTheme) {
    return
  }

  const [theme] = await trx('themes')
    .insert({
      admin_id: adminId,
      company_id: companyId,
      scope: THEME_SCOPE_COMPANY,
      name: themeSeed.name,
      mode: 'audio',
      status: STATUS_ACTIVE,
    })
    .returning(['id'])

  for (const [index, item] of themeSeed.items.entries()) {
    const [question] = await trx('questions')
      .insert({
        admin_id: adminId,
        company_id: companyId,
        scope: THEME_SCOPE_COMPANY,
        question: themeSeed.question,
        type_media: QUESTION_MEDIA_TYPE_AUDIO,
        status: STATUS_ACTIVE,
      })
      .returning(['id'])

    const { mediaKey, size } = saveExtract(storageDir, question.id, item.file, writtenFiles)

    await trx('questions')
      .where('id', question.id)
      .update({
        media_key: mediaKey,
        media_mime_type: AUDIO_MIME_TYPE,
        media_size_bytes: size,
        media_duration_ms: EXTRACT_DURATION_MS,
        media_start_ms: 0,
        media_original_name: `${item.file}.mp3`,
        media_uploaded_by: adminId,
        media_uploaded_at: trx.fn.now(),
        media_rights_attested_at: trx.fn.now(),
      })

    await trx('question_themes').insert({ question_id: question.id, theme_id: theme.id })

    await trx('answers').insert(
      buildAnswers(themeSeed.items, index).map((answer) => ({
        admin_id: adminId,
        question_id: question.id,
        response: answer.response,
        is_correct: answer.isCorrect,
        status: STATUS_ACTIVE,
      }))
    )
  }
}

async function upsertCompany(trx, { name, email }) {
  const existing = await trx('companies').whereRaw('lower(name) = lower(?)', [name]).first('id')

  if (existing) {
    await trx('companies')
      .where('id', existing.id)
      .update({ status: STATUS_ACTIVE, deleted_at: null, updated_at: trx.fn.now() })
    return existing.id
  }

  const [inserted] = await trx('companies')
    .insert({ name, email, status: STATUS_ACTIVE })
    .returning('id')
  return inserted.id ?? inserted
}

async function upsertAdmin(trx, values) {
  const existing = await trx('admins')
    .whereRaw('lower(username) = lower(?)', [values.username])
    .first('id')

  if (existing) {
    await trx('admins')
      .where('id', existing.id)
      .update({ ...values, status: STATUS_ACTIVE, deleted_at: null, updated_at: trx.fn.now() })
    return existing.id
  }

  const [inserted] = await trx('admins')
    .insert({ ...values, status: STATUS_ACTIVE, deleted_at: null })
    .returning('id')
  return inserted.id ?? inserted
}

async function upsertRoom(trx, companyId, name) {
  const existing = await trx('rooms')
    .where('company_id', companyId)
    .whereRaw('lower(name) = lower(?)', [name])
    .whereNot('status', 2)
    .first('id')

  if (existing) {
    await trx('rooms')
      .where('id', existing.id)
      .update({ status: STATUS_ACTIVE, updated_at: trx.fn.now() })
    return existing.id
  }

  const [inserted] = await trx('rooms')
    .insert({ company_id: companyId, name, config: {}, status: STATUS_ACTIVE })
    .returning('id')
  return inserted.id ?? inserted
}

exports.seed = async function (knex) {
  if (process.env.DEMO_SEED === 'false') {
    return
  }

  const password = process.env.DEMO_SEED_PASSWORD || 'Demo1234!'
  const mdpHash = await bcrypt.hash(password, 12)
  const storageDir = getMediaStorageDir()
  const writtenFiles = []

  await knex
    .transaction(async (trx) => {
      const companyId = await upsertCompany(trx, {
        name: 'QuizzUP Démo',
        email: 'contact@demo.quizzup.local',
      })

      const adminId = await upsertAdmin(trx, {
        company_id: companyId,
        room_id: null,
        role: ADMIN_ROLE_ADMIN,
        firstname: 'Gérant',
        lastname: 'Démo',
        username: 'demo-admin',
        email: 'admin@demo.quizzup.local',
        mdp_hash: mdpHash,
      })

      const roomId = await upsertRoom(trx, companyId, 'Salle 1')

      await upsertAdmin(trx, {
        company_id: companyId,
        room_id: roomId,
        role: ADMIN_ROLE_ROOM,
        firstname: 'Salle 1',
        lastname: 'Démo',
        username: 'salle1-demo',
        email: 'salle1@demo.quizzup.local',
        mdp_hash: mdpHash,
      })

      for (const themeSeed of DEMO_THEMES) {
        await seedTheme(trx, { adminId, companyId, storageDir, writtenFiles }, themeSeed)
      }
    })
    .catch((error) => {
      // Transaction annulée : on ne laisse pas de fichiers orphelins.
      for (const file of writtenFiles) {
        fs.rmSync(file, { force: true })
      }
      throw error
    })
}
