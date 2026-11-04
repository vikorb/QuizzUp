/**
 * Lance les seeds seulement sur une base vide (aucun compte `admins`).
 *
 * Utilisé au démarrage Docker : `quizz_content.js` vide le contenu (TRUNCATE … CASCADE, qui
 * emporte aussi les manches et réponses des parties). Le relancer à chaque `docker compose up`
 * effacerait l'historique des parties jouées pendant une recette. `SEED_ON_START=always`
 * rétablit l'ancien comportement (seed à chaque démarrage).
 */
const knex = require('knex')
const config = require('../knexfile')

async function main() {
  const db = knex(config)

  try {
    const force = process.env.SEED_ON_START === 'always'
    const { count } = await db('admins').count({ count: '*' }).first()

    if (!force && Number(count) > 0) {
      console.log('[seed] base déjà initialisée : seeds ignorés (SEED_ON_START=always pour forcer)')
      return
    }

    const [files] = await db.seed.run()
    console.log(`[seed] ${files.length} seeds exécutés`)
  } finally {
    await db.destroy()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
