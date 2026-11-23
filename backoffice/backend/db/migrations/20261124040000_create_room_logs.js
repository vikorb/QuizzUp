/**
 * Journaux d'erreurs des salles (lot 7e) : l'écran de salle envoie ses erreurs (`POST /room/logs`),
 * le personnel les lit.
 *
 * - C'est un journal : pas de `status` ni de suppression logique. Les lignes disparaissent avec la
 *   salle, au bout de `ROOM_LOG_RETENTION_DAYS` jours (30 par défaut) ou au-delà de 5 000 lignes
 *   par salle ; le nettoyage a lieu à chaque insertion (aucune tâche planifiée).
 * - Les longueurs et listes de valeurs reprennent les constantes `ROOM_LOG_*` de `@quizzup/shared` ;
 *   un test les compare (`tests/backend/src/db/roomLogsSchema.test.ts`).
 * - `occurrences` compte les répétitions d'une même erreur regroupées par l'écran de salle.
 * - Aucun e-mail ni donnée de joueur : le serveur masque les adresses et ne garde du contexte que
 *   quelques clés de la liste blanche.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('room_logs', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('company_id').notNullable()
    table.bigInteger('room_id').notNullable()

    table.string('level', 10).notNullable()
    table.string('code', 64).notNullable()
    table.string('message', 300).notNullable()
    table.jsonb('context').nullable()
    table.string('app_version', 32).notNullable()
    table.integer('occurrences').notNullable().defaultTo(1)

    table.timestamp('occurred_at', { useTz: true }).notNullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE')
    table.foreign('room_id').references('id').inTable('rooms').onDelete('CASCADE')

    table.index(['company_id'], 'room_logs_company_id_index')
  })

  await knex.raw(`
    CREATE INDEX room_logs_room_id_created_at_index
    ON room_logs (room_id, created_at DESC)
  `)

  await knex.raw(`
    ALTER TABLE room_logs
    ADD CONSTRAINT room_logs_level_check CHECK (level IN ('error', 'warn')),
    ADD CONSTRAINT room_logs_occurrences_check CHECK (occurrences >= 1),
    ADD CONSTRAINT room_logs_context_size_check CHECK (
      context IS NULL OR length(context::text) <= 1024
    )
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('room_logs')
}
