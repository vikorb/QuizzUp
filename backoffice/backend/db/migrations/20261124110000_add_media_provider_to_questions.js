/**
 * Extrait audio fourni par un service d'extraits (Deezer) au lieu d'un fichier importé : la
 * question garde seulement le fournisseur et la référence du titre. Le lien d'extrait, signé et à
 * durée de vie courte, n'est jamais enregistré : le serveur le redemande au fournisseur à chaque
 * envoi du contenu à la salle.
 *
 * Les deux colonnes vont ensemble (toutes deux nulles ou toutes deux renseignées) et s'excluent
 * avec le fichier importé (`media_key`).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas bloquer les requêtes de la table `questions` si un verrou est déjà pris.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('questions', (table) => {
    table.string('media_provider', 20).nullable()
    table.string('media_provider_ref', 64).nullable()
  })

  await knex.raw(`
    ALTER TABLE questions
    ADD CONSTRAINT questions_media_provider_check CHECK (
      media_provider IS NULL OR media_provider IN ('deezer')
    ),
    ADD CONSTRAINT questions_media_provider_pair_check CHECK (
      (media_provider IS NULL) = (media_provider_ref IS NULL)
    ),
    ADD CONSTRAINT questions_media_provider_exclusive_check CHECK (
      media_provider IS NULL OR media_key IS NULL
    )
  `)
}

/**
 * Retour arrière refusé tant qu'une question référence un titre d'un fournisseur : supprimer les
 * colonnes perdrait cette référence. Il faut d'abord retirer ces extraits depuis le backoffice.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const usedQuestion = await knex('questions').whereNotNull('media_provider').first('id')

  if (usedQuestion) {
    throw new Error(
      'Rollback impossible : des questions utilisent un extrait de fournisseur (questions.media_provider).'
    )
  }

  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.raw(`
    ALTER TABLE questions
    DROP CONSTRAINT IF EXISTS questions_media_provider_exclusive_check,
    DROP CONSTRAINT IF EXISTS questions_media_provider_pair_check,
    DROP CONSTRAINT IF EXISTS questions_media_provider_check
  `)

  await knex.schema.alterTable('questions', (table) => {
    table.dropColumn('media_provider_ref')
    table.dropColumn('media_provider')
  })
}
