/**
 * Accueil des joueurs (lot 2) : une partie en attente et une partie en cours peuvent coexister
 * dans une salle (le groupe suivant s'inscrit pendant que le premier joue). L'index unique
 * `games_room_id_active_unique` (une seule partie pending ou running) est remplacé par deux index
 * partiels : une seule partie `pending` et une seule partie `running` par salle.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.raw('DROP INDEX games_room_id_active_unique')
  await knex.raw(`
    CREATE UNIQUE INDEX games_room_id_pending_unique
    ON games(room_id)
    WHERE state = 'pending' AND status <> 2
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX games_room_id_running_unique
    ON games(room_id)
    WHERE state = 'running' AND status <> 2
  `)
}

/**
 * Retour arrière refusé tant qu'une salle a à la fois une partie en attente et une partie en
 * cours : l'ancien index ne pourrait pas être recréé.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const coexisting = await knex('games as pending')
    .join('games as running', 'running.room_id', 'pending.room_id')
    .where('pending.state', 'pending')
    .where('running.state', 'running')
    .whereNot('pending.status', 2)
    .whereNot('running.status', 2)
    .first('pending.room_id')

  if (coexisting) {
    throw new Error(
      'Rollback impossible : une salle a une partie en attente et une partie en cours (games.state).'
    )
  }

  await knex.raw('DROP INDEX games_room_id_running_unique')
  await knex.raw('DROP INDEX games_room_id_pending_unique')
  await knex.raw(`
    CREATE UNIQUE INDEX games_room_id_active_unique
    ON games(room_id)
    WHERE state IN ('pending', 'running') AND status <> 2
  `)
}
