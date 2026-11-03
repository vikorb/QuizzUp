/**
 * Extraits audio des questions (US-MEDIA-01) : le fichier lui-même vit dans le stockage
 * média (`MEDIA_STORAGE_DIR`), la question ne garde que sa clé et ses métadonnées.
 * `media_url` reste disponible pour un lien externe (image / vidéo) mais n'est plus utilisé
 * par l'audio uploadé.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('questions', (table) => {
    table.text('media_key').nullable()
    table.string('media_mime_type', 50).nullable()
    table.integer('media_size_bytes').nullable()
    table.integer('media_duration_ms').nullable()
    table.integer('media_start_ms').notNullable().defaultTo(0)
    table.string('media_original_name', 255).nullable()
    table.bigInteger('media_uploaded_by').nullable()
    table.timestamp('media_uploaded_at', { useTz: true }).nullable()
    table.timestamp('media_rights_attested_at', { useTz: true }).nullable()

    table.foreign('media_uploaded_by').references('id').inTable('admins').onDelete('SET NULL')
  })

  await knex.raw(`
    ALTER TABLE questions
    ADD CONSTRAINT questions_media_key_unique UNIQUE (media_key),
    ADD CONSTRAINT questions_media_mime_type_check CHECK (
      media_mime_type IS NULL OR media_mime_type IN ('audio/mpeg', 'audio/ogg')
    ),
    ADD CONSTRAINT questions_media_file_check CHECK (
      (media_key IS NULL AND media_mime_type IS NULL AND media_size_bytes IS NULL)
      OR
      (media_key IS NOT NULL AND media_mime_type IS NOT NULL AND media_size_bytes > 0)
    ),
    ADD CONSTRAINT questions_media_duration_ms_check CHECK (
      media_duration_ms IS NULL OR media_duration_ms > 0
    ),
    ADD CONSTRAINT questions_media_start_ms_check CHECK (media_start_ms >= 0)
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw(`
    ALTER TABLE questions
    DROP CONSTRAINT IF EXISTS questions_media_start_ms_check,
    DROP CONSTRAINT IF EXISTS questions_media_duration_ms_check,
    DROP CONSTRAINT IF EXISTS questions_media_file_check,
    DROP CONSTRAINT IF EXISTS questions_media_mime_type_check,
    DROP CONSTRAINT IF EXISTS questions_media_key_unique
  `)

  await knex.schema.alterTable('questions', (table) => {
    table.dropForeign(['media_uploaded_by'])
    table.dropColumn('media_rights_attested_at')
    table.dropColumn('media_uploaded_at')
    table.dropColumn('media_uploaded_by')
    table.dropColumn('media_original_name')
    table.dropColumn('media_start_ms')
    table.dropColumn('media_duration_ms')
    table.dropColumn('media_size_bytes')
    table.dropColumn('media_mime_type')
    table.dropColumn('media_key')
  })
}
