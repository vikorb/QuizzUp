# Design system — Backoffice QuizzUp

> Référence du langage visuel du backoffice (US `us-front-design-01`).
> Objectif : futuriste / néon **bleu-violet**, sombre, sobre et professionnel — pas enfantin,
> néon **sélectif** (jamais partout), fait main.

## 1. Concept

Le backoffice se lit comme une **console de pilotage d'une salle de jeu néon** : fond quasi-noir
teinté violet, panneaux « verre » (dégradé + liseré haut + ombre douce), ambiance diffuse
(halos + fine grille) en arrière-plan. Le néon est **réservé** à deux endroits : l'**état actif**
du menu et le **seul** bouton primaire (dégradé bleu → violet). Tout le reste est mat.

## 2. Tokens (source : `frontend/src/assets/styles/main.css`)

Toujours passer par les variables CSS, **jamais** de couleur en dur.

| Rôle              | Token                                           | Valeur                              |
| ----------------- | ----------------------------------------------- | ----------------------------------- |
| Fond              | `--bg-0`                                        | `#05060d`                           |
| Panneau           | `--bg-card` / `--bg-card-hi`                    | violet translucide                  |
| Accent bleu       | `--accent-blue`                                 | `#4a63d8`                           |
| Accent violet     | `--accent-purple` / `--accent-pink`             | `#7458e6` / `#8b74ff`               |
| Texte             | `--text-0..3`                                   | blanc froid, opacités décroissantes |
| Bordures          | `--border-ui` / `--border-2` / `--border-hover` | violet à faible alpha               |
| **Sémantique**    | `--ok` / `--warn` / `--danger` / `--edit`       | teal / ambre / rose / bleu          |
| Surfaces / ombres | `--surface-0..3`, `--shadow-1/2`, `--glow-*`    | neutres utilitaires                 |

Rayons : `--radius`. Transition : `--tr`. Largeurs menu : `--side-w`, `--rail-w`.

**Couleurs sémantiques** (teal actif, ambre brouillon, rose danger) : uniquement en **points de
statut / jauges / pastilles**, jamais en texte de navigation.

## 3. Typographie

- **Exo 2** partout (chargée via `@import` Google Fonts dans `main.css`).
- Chiffres alignés en colonnes : `font-variant-numeric: tabular-nums`.

## 4. Composants réutilisables (`frontend/src/components/ui`)

| Composant                                                                       | Rôle                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `UiButton`                                                                      | boutons (`default` / `primary` dégradé / `danger` rouge plein / `icon` / `seg`)     |
| `StatusPill`                                                                    | pastille de statut (texte = couleur du statut + point lumineux)                     |
| `ScopeChip`                                                                     | puce de portée (Global = bleu, Entreprise = violet)                                 |
| `StatBar`                                                                       | bandeau de stats « readout » (grand chiffre + jauge de proportion)                  |
| `Tooltip`                                                                       | infobulle stylée, **cliquable** (tablette) + survol (desktop)                       |
| `ConfirmModal` + `useConfirm`                                                   | pop-up de confirmation maison (remplace `window.confirm`)                           |
| `SwitchField`                                                                   | on/off (centre vert actif / rouge inactif)                                          |
| `SelectField`                                                                   | select **custom** (menu déroulant thémé, clavier, ouverture vers le haut si besoin) |
| `form/FormField`, `FormActions`, `FormStatusToggle`, `LabelField`, `FormResult` | briques de formulaire (hauteur d'input uniforme, légende `*` obligatoire)           |
| `BaseToolBar`                                                                   | barre de filtres repliable + chips de filtres actifs (à droite du titre)            |
| `BaseCard`, `BaseTable`, `SectionLayout`                                        | conteneurs / table / mise en page de section                                        |

## 5. Navigation adaptative (tablette d'abord)

Décision fondée sur Material 3 (window size classes) + Apple HIG. Tout est consolidé dans le
**menu latéral gauche** (marque en haut, compte en bas) ; la barre du haut ne sert que pages
invitées + mobile.

| Largeur                              | Rendu                                |
| ------------------------------------ | ------------------------------------ |
| ≥ 1024px (bureau / tablette paysage) | menu **complet** (labels), repliable |
| 768–1024px (tablette portrait)       | **rail d'icônes** automatique        |
| < 768px (mobile)                     | **tiroir** (burger)                  |

Cibles tactiles ≥ 48px. État actif = texte blanc + barre d'accent violette (jamais vert).

## 6. Conventions

- **Néon sélectif** : glow réservé à l'item de menu actif et au bouton primaire.
- **Fluidité** : éviter les `backdrop-filter` lourds (coûteux au scroll) ; privilégier des
  panneaux translucides + ombres.
- **Formulaires** : champs à hauteur uniforme, légende `*` obligatoire, aides longues en
  infobulle plutôt qu'en pavé de texte.
- **i18n** : app **fr-first** (clés `fr` complètes) ; le locale `en` reste partiel.
- **Tests** : composants et vues couverts par Vitest (`tests/frontend`), mocks centralisés dans
  `tests/frontend/src/_helpers`.
