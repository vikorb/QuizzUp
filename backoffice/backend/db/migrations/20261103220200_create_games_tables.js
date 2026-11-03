/**
 * Parties de jeu (US-GAME-07).
 *
 * - `games.status` suit la convention commune (0/1/2, suppression logique) ;
 *   `games.state` porte l'avancement (pending → running → finished | aborted).
 * - `games.seed` permet de rejouer exactement les tirages d'une partie.
 * - `game_rounds.questions` est un snapshot : l'historique ne bouge pas si le
 *   thème est modifié ensuite. `game_answers` reste normalisée pour les stats.
 * - `game_events.seq` est unique par partie : rejouer un lot d'événements
 *   (resynchronisation après coupure réseau) ne crée pas de doublon.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('games', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('company_id').notNullable()
    table.bigInteger('room_id').notNullable()
    table.bigInteger('admin_id').notNullable()

    table.smallint('rounds_count').notNullable().defaultTo(10)
    table.smallint('questions_per_round').notNullable().defaultTo(10)
    table.bigInteger('seed').notNullable()
    table.string('state', 50).notNullable().defaultTo('pending')

    table.timestamp('started_at', { useTz: true }).nullable()
    table.timestamp('finished_at', { useTz: true }).nullable()

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()
    table.timestamp('deleted_at', { useTz: true }).nullable()

    table.foreign('company_id').references('id').inTable('companies').onDelete('RESTRICT')
    table.foreign('room_id').references('id').inTable('rooms').onDelete('RESTRICT')
    table.foreign('admin_id').references('id').inTable('admins').onDelete('RESTRICT')

    table.index(['company_id'], 'games_company_id_index')
    table.index(['room_id'], 'games_room_id_index')
    table.index(['admin_id'], 'games_admin_id_index')
    table.index(['state'], 'games_state_index')
    table.index(['status'], 'games_status_index')
  })

  await knex.raw(`
    ALTER TABLE games
    ADD CONSTRAINT games_status_check CHECK (status IN (0, 1, 2)),
    ADD CONSTRAINT games_state_check CHECK (state IN ('pending', 'running', 'finished', 'aborted')),
    ADD CONSTRAINT games_rounds_count_check CHECK (rounds_count BETWEEN 1 AND 20),
    ADD CONSTRAINT games_questions_per_round_check CHECK (questions_per_round BETWEEN 1 AND 20),
    ADD CONSTRAINT games_deleted_at_check CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    )
  `)

  // Une seule partie en attente ou en cours par salle.
  await knex.raw(`
    CREATE UNIQUE INDEX games_room_id_active_unique
    ON games(room_id)
    WHERE state IN ('pending', 'running') AND status <> 2
  `)

  await knex.schema.createTable('game_participants', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('game_id').notNullable()

    table.smallint('podium').notNullable()
    table.string('display_name', 100).notNullable()
    table.string('email', 255).nullable()
    table.timestamp('consent_at', { useTz: true }).nullable()
    table.integer('score').notNullable().defaultTo(0)

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()

    table.foreign('game_id').references('id').inTable('games').onDelete('CASCADE')

    table.unique(['game_id', 'podium'], { indexName: 'game_participants_game_id_podium_unique' })
    table.index(['email'], 'game_participants_email_index')
  })

  // RGPD : pas d'email sans consentement horodaté.
  await knex.raw(`
    ALTER TABLE game_participants
    ADD CONSTRAINT game_participants_podium_check CHECK (podium BETWEEN 1 AND 4),
    ADD CONSTRAINT game_participants_email_consent_check CHECK (
      email IS NULL OR consent_at IS NOT NULL
    )
  `)

  await knex.schema.createTable('game_rounds', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('game_id').notNullable()
    table.bigInteger('theme_id').nullable()
    table.bigInteger('chooser_participant_id').nullable()

    table.smallint('position').notNullable()
    table.string('mini_game', 50).notNullable()
    table.jsonb('offered_theme_ids').notNullable().defaultTo('[]')
    table.string('chooser_reason', 50).nullable()
    table.jsonb('questions').notNullable().defaultTo('[]')

    table.timestamp('started_at', { useTz: true }).nullable()
    table.timestamp('finished_at', { useTz: true }).nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()

    table.foreign('game_id').references('id').inTable('games').onDelete('CASCADE')
    table.foreign('theme_id').references('id').inTable('themes').onDelete('RESTRICT')
    table
      .foreign('chooser_participant_id')
      .references('id')
      .inTable('game_participants')
      .onDelete('SET NULL')

    table.unique(['game_id', 'position'], { indexName: 'game_rounds_game_id_position_unique' })
    table.index(['theme_id'], 'game_rounds_theme_id_index')
  })

  await knex.raw(`
    ALTER TABLE game_rounds
    ADD CONSTRAINT game_rounds_position_check CHECK (position >= 1),
    ADD CONSTRAINT game_rounds_mini_game_check CHECK (mini_game IN ('flash_blind_test')),
    ADD CONSTRAINT game_rounds_chooser_reason_check CHECK (
      chooser_reason IS NULL
      OR chooser_reason IN ('first_round_random', 'random_excluding_leader', 'fallback_random')
    )
  `)

  await knex.schema.createTable('game_answers', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('game_id').notNullable()
    table.bigInteger('round_id').notNullable()
    table.bigInteger('participant_id').notNullable()
    table.bigInteger('question_id').notNullable()
    table.bigInteger('answer_id').nullable()

    table.boolean('is_correct').notNullable().defaultTo(false)
    table.integer('points').notNullable().defaultTo(0)
    table.integer('response_time_ms').nullable()
    table.smallint('stage').nullable()
    table.timestamp('answered_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.foreign('game_id').references('id').inTable('games').onDelete('CASCADE')
    table.foreign('round_id').references('id').inTable('game_rounds').onDelete('CASCADE')
    table
      .foreign('participant_id')
      .references('id')
      .inTable('game_participants')
      .onDelete('CASCADE')
    table.foreign('question_id').references('id').inTable('questions').onDelete('RESTRICT')
    table.foreign('answer_id').references('id').inTable('answers').onDelete('RESTRICT')

    table.unique(['round_id', 'participant_id', 'question_id'], {
      indexName: 'game_answers_round_participant_question_unique',
    })
    table.index(['game_id'], 'game_answers_game_id_index')
    table.index(['participant_id'], 'game_answers_participant_id_index')
    table.index(['question_id'], 'game_answers_question_id_index')
  })

  await knex.raw(`
    ALTER TABLE game_answers
    ADD CONSTRAINT game_answers_response_time_check CHECK (
      response_time_ms IS NULL OR response_time_ms >= 0
    ),
    ADD CONSTRAINT game_answers_stage_check CHECK (stage IS NULL OR stage >= 1)
  `)

  await knex.schema.createTable('game_events', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('game_id').notNullable()

    table.integer('seq').notNullable()
    table.string('type', 80).notNullable()
    table.jsonb('payload').notNullable().defaultTo('{}')
    table.timestamp('occurred_at', { useTz: true }).notNullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.foreign('game_id').references('id').inTable('games').onDelete('CASCADE')

    table.unique(['game_id', 'seq'], { indexName: 'game_events_game_id_seq_unique' })
    table.index(['type'], 'game_events_type_index')
  })

  await knex.raw(`
    ALTER TABLE game_events
    ADD CONSTRAINT game_events_seq_check CHECK (seq >= 0)
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('game_events')
  await knex.schema.dropTableIfExists('game_answers')
  await knex.schema.dropTableIfExists('game_rounds')
  await knex.schema.dropTableIfExists('game_participants')
  await knex.schema.dropTableIfExists('games')
}
