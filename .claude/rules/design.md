---
paths:
  - "**/*.vue"
  - "**/*.css"
---

# Design : une console de salle de jeu néon, faite main

Référence : `backoffice/docs/design/design-system.md`. Tokens :
`backoffice/frontend/src/assets/styles/main.css`. L'ambiance visée est celle d'une régie lumière :
fond presque noir teinté violet, panneaux mats, **néon rare**. Si un écran ressemble à un modèle
généré, il est à refaire.

## Règles

- **Tokens uniquement.** Aucune couleur, ombre ou rayon en dur dans un composant : `var(--…)`. S'il
  manque un token, on l'ajoute dans `main.css` avec un nom de rôle, pas de valeur.
- **Néon sélectif.** La lueur est réservée à l'élément de menu actif et au bouton primaire. **Un
  seul bouton primaire par écran.** Tout le reste est mat.
- **Couleurs de statut** (`--ok`, `--warn`, `--danger`, `--edit`) : seulement sur des points, jauges
  et pastilles de statut. Jamais pour décorer.
- **Typographie** : Exo 2. La hiérarchie se fait par la taille, la graisse et l'espace, pas par des
  boîtes. Chiffres en `tabular-nums`. Deux graisses par écran suffisent.
- **Espace** : aérer plutôt qu'encadrer. Reprendre les espacements déjà utilisés par les composants
  voisins ; pas de valeur au hasard (13px, 27px).
- **Icônes** : `@mdi/js`, une seule famille. Jamais d'émoji en guise d'icône.
- **Mouvement** : court (`--tr`, 0,16 s) et utile (retour d'action, changement d'état). Respecter
  `prefers-reduced-motion`. Pas de `backdrop-filter` lourd : il casse le défilement.
- **Tactile et accessibilité** : cibles ≥ 48 px, focus clavier visible, contraste AA, libellés sur
  les champs. Navigation : menu complet ≥ 1024 px, rail 768-1024 px, tiroir < 768 px.

## Ce qui trahit une page générée (interdit)

- Grille de trois cartes identiques « icône, titre, une phrase ».
- Dégradé violet en fond de section, de carte et de bouton à la fois.
- Tout centré, tout arrondi pareil, tout dans une carte avec bordure et ombre.
- Pastilles, badges et étiquettes posés pour remplir.
- Effet au survol sur chaque élément ; halos et lueurs partout.
- Texte creux : « Boostez », « Révolutionnez », « Solution tout-en-un », points d'exclamation.
- Illustrations génériques. On montre le produit réel : une capture de l'écran de salle, une photo
  de pupitre, un vrai plan de salle.

## Avant de dire « fini »

Regarde l'écran pour de vrai, à 1280 px et à 768 px, avec des données longues, vides et en erreur.
Une capture vaut mieux qu'une relecture du CSS. Pour une page publique : Lighthouse sur la page
construite (performance, accessibilité, bonnes pratiques, SEO).
