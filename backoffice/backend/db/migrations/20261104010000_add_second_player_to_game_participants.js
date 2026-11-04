/**
 * US-GAME-08 : deux joueurs par pupitre (décision d'Enzo du 2026-11-04). Le 2e joueur est
 * facultatif, a son propre nom et son propre email RGPD ; le score reste celui du pupitre.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('game_participants', (table) => {
    table.string('second_display_name', 100).nullable()
    table.string('second_email', 255).nullable()
    table.timestamp('second_consent_at', { useTz: true }).nullable()

    table.index(['second_email'], 'game_participants_second_email_index')
  })

  // Mêmes règles RGPD que le 1er joueur ; pas d'email sans nom de 2e joueur.
  await knex.raw(`
    ALTER TABLE game_participants
    ADD CONSTRAINT game_participants_second_email_consent_check CHECK (
      second_email IS NULL OR second_consent_at IS NOT NULL
    ),
    ADD CONSTRAINT game_participants_second_player_check CHECK (
      second_display_name IS NOT NULL OR (second_email IS NULL AND second_consent_at IS NULL)
    )
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE game_participants
    DROP CONSTRAINT IF EXISTS game_participants_second_player_check,
    DROP CONSTRAINT IF EXISTS game_participants_second_email_consent_check
  `)

  await knex.schema.alterTable('game_participants', (table) => {
    table.dropIndex(['second_email'], 'game_participants_second_email_index')
    table.dropColumn('second_consent_at')
    table.dropColumn('second_email')
    table.dropColumn('second_display_name')
  })
}
