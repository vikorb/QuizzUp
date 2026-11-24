/**
 * Playlist d'un fournisseur d'extraits (Deezer) rattachée à un thème `audio` : le thème garde
 * seulement le fournisseur et la référence de la playlist. Aucun titre ni lien d'extrait n'est
 * enregistré : le serveur lit la playlist chez le fournisseur à chaque envoi du contenu à la salle.
 *
 * Les deux colonnes vont ensemble (toutes deux nulles ou toutes deux renseignées) et la playlist
 * n'existe que sur un thème en mode `audio`.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas bloquer les requêtes de la table `themes` si un verrou est déjà pris.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('themes', (table) => {
    table.string('playlist_provider', 20).nullable()
    table.string('playlist_ref', 64).nullable()
  })

  await knex.raw(String.raw`
    ALTER TABLE themes
    ADD CONSTRAINT themes_playlist_provider_check CHECK (
      playlist_provider IS NULL OR playlist_provider IN ('deezer')
    ),
    ADD CONSTRAINT themes_playlist_ref_check CHECK (
      playlist_ref IS NULL OR playlist_ref ~ '^\d{1,20}$'
    ),
    ADD CONSTRAINT themes_playlist_pair_check CHECK (
      (playlist_provider IS NULL) = (playlist_ref IS NULL)
    ),
    ADD CONSTRAINT themes_playlist_audio_check CHECK (
      playlist_ref IS NULL OR mode = 'audio'
    )
  `)
}

/**
 * Retour arrière refusé tant qu'un thème référence une playlist : supprimer les colonnes perdrait
 * cette référence. Il faut d'abord retirer ces playlists depuis le backoffice.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const usedTheme = await knex('themes').whereNotNull('playlist_provider').first('id')

  if (usedTheme) {
    throw new Error(
      'Rollback impossible : des thèmes utilisent une playlist de fournisseur (themes.playlist_provider).'
    )
  }

  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.raw(`
    ALTER TABLE themes
    DROP CONSTRAINT IF EXISTS themes_playlist_audio_check,
    DROP CONSTRAINT IF EXISTS themes_playlist_pair_check,
    DROP CONSTRAINT IF EXISTS themes_playlist_ref_check,
    DROP CONSTRAINT IF EXISTS themes_playlist_provider_check
  `)

  await knex.schema.alterTable('themes', (table) => {
    table.dropColumn('playlist_ref')
    table.dropColumn('playlist_provider')
  })
}
