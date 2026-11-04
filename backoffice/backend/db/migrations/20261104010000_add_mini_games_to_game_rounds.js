/**
 * Nouveaux mini-jeux du moteur (cadrage §5.2) : on élargit le CHECK de
 * `game_rounds.mini_game`. La liste doit rester alignée sur `MINI_GAMES` de
 * `@quizzup/shared`.
 */
const MINI_GAMES = [
  'flash_blind_test',
  'quick_answer',
  'first_buzz',
  'true_false',
  'double_or_nothing',
  'sudden_death',
  'point_steal',
  'streak',
  'estimate',
  'progressive_reveal',
]

const toSqlList = (values) => values.map((value) => `'${value}'`).join(', ')

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.raw(`
    ALTER TABLE game_rounds
    DROP CONSTRAINT game_rounds_mini_game_check,
    ADD CONSTRAINT game_rounds_mini_game_check CHECK (mini_game IN (${toSqlList(MINI_GAMES)}))
  `)
}

/**
 * Retour au seul blind test éclair : refusé tant que des manches d'autres
 * mini-jeux existent (les supprimer casserait l'historique des parties).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const used = await knex('game_rounds').whereNot('mini_game', 'flash_blind_test').first('id')

  if (used) {
    throw new Error(
      'Rollback impossible : des manches utilisent les nouveaux mini-jeux (game_rounds.mini_game).'
    )
  }

  await knex.raw(`
    ALTER TABLE game_rounds
    DROP CONSTRAINT game_rounds_mini_game_check,
    ADD CONSTRAINT game_rounds_mini_game_check CHECK (mini_game IN ('flash_blind_test'))
  `)
}
