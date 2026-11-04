/**
 * Seeds au démarrage Docker.
 *
 * - Base vide (aucun compte `admins`) : tous les seeds.
 * - Base déjà remplie : seulement le seed de démo (`quizz_content_demo_room.js`, idempotent),
 *   pour que les comptes et thèmes du guide de test existent toujours, même sur un volume
 *   créé avant leur arrivée ou après un premier démarrage interrompu.
 *
 * Pourquoi pas tous les seeds à chaque fois : `quizz_content.js` vide le contenu
 * (TRUNCATE … CASCADE, qui emporte aussi les manches et réponses des parties) ; le relancer à
 * chaque `docker compose up` effacerait l'historique des parties jouées pendant une recette.
 * `SEED_ON_START=always` rétablit l'ancien comportement (tous les seeds à chaque démarrage).
 */
const knex = require('knex')
const config = require('../knexfile')

const DEMO_SEED_FILE = 'quizz_content_demo_room.js'

async function main() {
  const db = knex(config)

  try {
    const force = process.env.SEED_ON_START === 'always'
    const { count } = await db('admins').count({ count: '*' }).first()

    if (force || Number(count) === 0) {
      const [files] = await db.seed.run()
      console.log(`[seed] ${files.length} seeds exécutés`)
      return
    }

    // La démo ne doit jamais empêcher l'API de démarrer : une erreur est seulement signalée.
    try {
      await db.seed.run({ specific: DEMO_SEED_FILE })
      console.log(`[seed] base déjà initialisée : seul ${DEMO_SEED_FILE} est rejoué`)
    } catch (error) {
      console.error(`[seed] ${DEMO_SEED_FILE} ignoré après une erreur :`, error)
    }
  } finally {
    await db.destroy()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
