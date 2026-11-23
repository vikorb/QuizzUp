/**
 * Demandes de démonstration envoyées depuis la vitrine (lot 12c).
 *
 * Ressource de l'éditeur : pas de `company_id`, c'est une exception voulue à la règle
 * multi-tenant. Pas de colonne `status` (0/1/2 a déjà un autre sens dans le projet) : une demande
 * est « traitée » quand `processed_at` est renseigné. On ne stocke ni adresse IP ni navigateur.
 * Les demandes sont purgées 12 mois après `created_at` (`jobs/purgeDemoRequests.ts`).
 *
 * Le plafond de `rooms_count` doit rester aligné sur `DEMO_REQUEST_ROOMS_MAX` de `@quizzup/shared`.
 */
const ROOMS_MAX = 50

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas attendre indéfiniment un verrou sur `admins` (clé étrangère) pendant un déploiement.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.createTable('demo_requests', (table) => {
    table.bigIncrements('id').primary()

    table.string('contact_name', 120).notNullable()
    table.string('center_name', 160).notNullable()
    table.string('email', 254).notNullable()
    table.string('phone', 32).nullable()
    table.smallint('rooms_count').notNullable()
    table.text('message').nullable()
    table.string('locale', 2).nullable()

    table.timestamp('consent_at', { useTz: true }).notNullable()
    table.timestamp('processed_at', { useTz: true }).nullable()
    table.bigInteger('processed_by').nullable()

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.foreign('processed_by').references('id').inTable('admins').onDelete('SET NULL')

    table.index(['processed_at', 'created_at'], 'demo_requests_processed_at_created_at_index')
  })

  await knex.raw(`
    ALTER TABLE demo_requests
    ADD CONSTRAINT demo_requests_rooms_count_check CHECK (rooms_count BETWEEN 1 AND ${ROOMS_MAX})
  `)
}

/**
 * Refusé tant que la table contient des demandes : ce sont des données personnelles reçues de
 * prospects, qu'un retour arrière détruirait sans trace.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const existing = await knex('demo_requests').first('id')

  if (existing) {
    throw new Error(
      'Rollback impossible : la table demo_requests contient des demandes (les exporter ou les supprimer d’abord).'
    )
  }

  await knex.schema.dropTableIfExists('demo_requests')
}
