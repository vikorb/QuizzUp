/**
 * Consentement aux offres du centre, distinct du consentement à conserver l'e-mail (conception
 * accueil/après-partie, lot P1, question Q3). Un joueur peut garder son e-mail pour recevoir ses
 * résultats sans accepter les offres. Les anciens consentements (`consent_at`) ne valent PAS pour
 * les offres : aucune reprise de données, les nouvelles colonnes restent nulles.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  // Verrou court : on échoue plutôt que de bloquer les parties en cours si la table est occupée.
  await knex.raw(`SET LOCAL lock_timeout = '5s'`)

  await knex.schema.alterTable('game_participants', (table) => {
    table.timestamp('marketing_consent_at', { useTz: true }).nullable()
    table.timestamp('second_marketing_consent_at', { useTz: true }).nullable()
  })

  // Pas de consentement aux offres sans e-mail à qui les envoyer.
  await knex.raw(`
    ALTER TABLE game_participants
    ADD CONSTRAINT game_participants_marketing_consent_email_check CHECK (
      marketing_consent_at IS NULL OR email IS NOT NULL
    ),
    ADD CONSTRAINT game_participants_second_marketing_consent_email_check CHECK (
      second_marketing_consent_at IS NULL OR second_email IS NOT NULL
    )
  `)
}

/**
 * Retour arrière refusé tant qu'un consentement aux offres est enregistré : l'effacer ferait
 * perdre la preuve du consentement donné.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const used = await knex('game_participants')
    .whereNotNull('marketing_consent_at')
    .orWhereNotNull('second_marketing_consent_at')
    .first('id')

  if (used) {
    throw new Error(
      'Rollback impossible : des consentements aux offres sont enregistrés (game_participants.marketing_consent_at).'
    )
  }

  await knex.raw(`
    ALTER TABLE game_participants
    DROP CONSTRAINT IF EXISTS game_participants_second_marketing_consent_email_check,
    DROP CONSTRAINT IF EXISTS game_participants_marketing_consent_email_check
  `)

  await knex.schema.alterTable('game_participants', (table) => {
    table.dropColumn('second_marketing_consent_at')
    table.dropColumn('marketing_consent_at')
  })
}
