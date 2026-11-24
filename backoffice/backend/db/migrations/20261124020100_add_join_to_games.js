/**
 * Accueil des joueurs (lot 2) : lien d'inscription d'une partie en attente et file des demandes
 * à valider par le personnel.
 *
 * - `games.join_token` : jeton aléatoire du lien (32 octets en base64url), stocké en clair ; le
 *   remettre à null révoque le lien. `join_expires_at` le borne dans le temps ; les deux colonnes
 *   sont nulles ensemble ou renseignées ensemble.
 * - `game_registrations` ne contient que des demandes en attente, donc pas de `status` : valider
 *   déplace la ligne vers `game_participants`, refuser la supprime. Aucune donnée personnelle ne
 *   traîne (purge quotidienne des demandes de plus de 24 h ou d'une partie plus en attente).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('games', (table) => {
    table.string('join_token', 64).nullable()
    table.timestamp('join_expires_at', { useTz: true }).nullable()
  })

  await knex.raw(`
    ALTER TABLE games
    ADD CONSTRAINT games_join_check CHECK ((join_token IS NULL) = (join_expires_at IS NULL))
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX games_join_token_unique
    ON games(join_token)
    WHERE join_token IS NOT NULL
  `)

  await knex.schema.createTable('game_registrations', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('game_id').notNullable()

    table.string('display_name', 100).notNullable()
    table.string('email', 255).nullable()
    table.timestamp('consent_at', { useTz: true }).nullable()
    table.timestamp('marketing_consent_at', { useTz: true }).nullable()
    table.string('second_display_name', 100).nullable()
    table.string('second_email', 255).nullable()
    table.timestamp('second_consent_at', { useTz: true }).nullable()
    table.timestamp('second_marketing_consent_at', { useTz: true }).nullable()

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.foreign('game_id').references('id').inTable('games').onDelete('CASCADE')

    table.index(['game_id', 'created_at'], 'game_registrations_game_id_created_at_index')
  })

  // Mêmes règles RGPD que `game_participants` : pas d'e-mail sans consentement horodaté, pas
  // d'offres sans e-mail, pas d'e-mail de 2e joueur sans 2e joueur.
  await knex.raw(`
    ALTER TABLE game_registrations
    ADD CONSTRAINT game_registrations_email_consent_check CHECK (
      email IS NULL OR consent_at IS NOT NULL
    ),
    ADD CONSTRAINT game_registrations_marketing_consent_email_check CHECK (
      marketing_consent_at IS NULL OR email IS NOT NULL
    ),
    ADD CONSTRAINT game_registrations_second_email_consent_check CHECK (
      second_email IS NULL OR second_consent_at IS NOT NULL
    ),
    ADD CONSTRAINT game_registrations_second_marketing_consent_email_check CHECK (
      second_marketing_consent_at IS NULL OR second_email IS NOT NULL
    ),
    ADD CONSTRAINT game_registrations_second_player_check CHECK (
      second_display_name IS NOT NULL OR (second_email IS NULL AND second_consent_at IS NULL)
    )
  `)
}

/**
 * Retour arrière refusé tant qu'une demande d'inscription attend : la supprimer ferait perdre
 * l'inscription d'un joueur.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const waiting = await knex('game_registrations').first('id')

  if (waiting) {
    throw new Error(
      "Rollback impossible : des demandes d'inscription sont en attente (game_registrations)."
    )
  }

  await knex.schema.dropTable('game_registrations')
  await knex.raw('DROP INDEX games_join_token_unique')
  await knex.raw('ALTER TABLE games DROP CONSTRAINT games_join_check')
  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('join_expires_at')
    table.dropColumn('join_token')
  })
}
