/**
 * 6 pupitres au maximum (décision d'Enzo, 2026-11-04) : on élargit le CHECK de
 * `game_participants.podium` de 1..4 à 1..6. Le plafond doit rester aligné sur `GAME_PODIUMS`
 * de `@quizzup/shared`. Le nombre de pupitres d'une salle (4 par défaut) vit dans
 * `rooms.config`, pas dans le schéma.
 */
const MAX_PODIUM = 6
const PREVIOUS_MAX_PODIUM = 4

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.raw(`
    ALTER TABLE game_participants
    DROP CONSTRAINT game_participants_podium_check,
    ADD CONSTRAINT game_participants_podium_check CHECK (podium BETWEEN 1 AND ${MAX_PODIUM})
  `)
}

/**
 * Retour à 4 pupitres : refusé tant qu'un participant occupe un pupitre 5 ou 6
 * (les supprimer ou les déplacer fausserait l'historique des parties).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const used = await knex('game_participants').where('podium', '>', PREVIOUS_MAX_PODIUM).first('id')

  if (used) {
    throw new Error(
      `Rollback impossible : des participants occupent un pupitre au-delà de ${PREVIOUS_MAX_PODIUM} (game_participants.podium).`
    )
  }

  await knex.raw(`
    ALTER TABLE game_participants
    DROP CONSTRAINT game_participants_podium_check,
    ADD CONSTRAINT game_participants_podium_check CHECK (podium BETWEEN 1 AND ${PREVIOUS_MAX_PODIUM})
  `)
}
