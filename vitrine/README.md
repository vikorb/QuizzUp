# @quizzup/vitrine — site public de présentation

Site statique en français : page d'accueil, demande de démonstration, mentions légales, politique
de confidentialité, page 404. Pas de Vue, pas de routeur, pas de script ni de police tiers, pas de
cookie. Vite assemble des pages HTML écrites à la main, une seule feuille de style et un petit
script TypeScript (le formulaire).

Paquet autonome : il ne dépend d'aucun autre paquet à l'installation. Il lit en sources les
variables de la charte (`backoffice/frontend/src/assets/styles/main.css`) et `@quizzup/shared`
(liste des mini-jeux, utilisée par un test).

## Lancer, construire, contrôler

```bash
cd vitrine
npm install
npm run dev            # http://localhost:4176
npm run build          # dossier dist/ ; refusé tant que site.config.ts est incomplet (voir plus bas)
VITRINE_DRAFT=1 npm run build   # brouillon : à ne pas publier (PowerShell : $env:VITRINE_DRAFT='1')
npm run preview        # sert dist/ sur :4176
npm run lint           # eslint
npm run format:check   # prettier (sous Windows : npx prettier --end-of-line auto --check .)
npm run type-check
npm test               # vitest : formulaire, plugins, pages construites, liens internes
npm run lighthouse     # exige un build ; seuils bloquants >= 95 sur 4 catégories
```

`npm run lighthouse` lance Lighthouse CI sur chaque page de `dist/` (3 passages, médiane,
profil mobile) et échoue sous 0,95 en performance, accessibilité, bonnes pratiques ou SEO. Il
faut un Chrome installé (variable `CHROME_PATH` sinon). Les rapports vont dans `.lighthouseci/`.

## Changer le nom, le domaine, le contact, les informations légales

Tout est dans `site.config.ts`. Les pages n'écrivent jamais le nom du produit : elles contiennent
des variables `%SITE_…%` (`name` devient `%SITE_NAME%`, `company.legalName` devient
`%SITE_COMPANY_LEGAL_NAME%`), remplacées à la construction. Une variable inconnue fait échouer le
build. `robots.txt` et `sitemap.xml` sont générés avec `url`. Deux variables sont dérivées :
`%SITE_THEME_COLOR%` (le fond `--bg-0` de la charte) et `%SITE_OG_LOCALE%` (tirée de `lang`).
`<!-- @include header current=/demonstration.html -->` marque le lien de la page courante
(`aria-current="page"`).

Valeurs à compléter avant la mise en ligne :

- `domain` (provisoirement `example.org`, d'où `url`, `appUrl`, `apiUrl` et `contactEmail`) ;
- `company` : `legalName`, `legalForm`, `shareCapital`, `address`, `registration`, `vatNumber`,
  `phone`, `publicationDirector` ;
- `host` : `name`, `address`, `phone` ;
- `privacy.retention` : durée de conservation d'une demande de démonstration ;
- `legalUpdatedAt` quand les pages légales changent.

**Le build échoue** tant qu'une valeur vaut `À COMPLÉTER` ou contient `example.org` : le message
liste les valeurs à renseigner (`company.legalName`, `domain`, etc.). Pour construire quand même un
brouillon (tests, Lighthouse, essai local), définir `VITRINE_DRAFT=1` ; la CI le fait dans le job
`vitrine`. Un `dist/` construit ainsi affiche « À COMPLÉTER » dans les pages légales et ne doit pas
être mis en ligne.

Le logo (`logo` dans la configuration) est un fichier de `public/` ; ses dimensions sont celles du
fichier. Pour l'anglais : ajouter une entrée dans `src/messages.ts` et des pages HTML avec
`lang="en"` ; la structure est prête, aucune page anglaise n'existe dans ce lot.

## Formulaire de démonstration

`src/form.ts` valide les champs (nom, centre, e-mail, téléphone et message facultatifs, nombre de
salles, consentement), puis poste en JSON vers `<apiUrl>/public/v1/demo-requests`. Les noms et les
bornes sont ceux de `CreateDemoRequestRequest` (`backoffice/docs/api/openapi.yaml`) : nom 120
caractères, centre 160, e-mail 254, téléphone `^[+0-9 ().-]{6,32}$`, 1 à 50 salles, message 2 000.
`tests/form.test.ts` compare les bornes partagées à `@quizzup/shared`, `tests/build.test.ts` celles
de la page.

```json
{
  "name": "…",
  "centerName": "…",
  "email": "…",
  "phone": "… (omis si vide)",
  "roomsCount": 3,
  "message": "… (omis si vide)",
  "consent": true,
  "website": ""
}
```

L'adresse de l'API est `apiUrl` de `site.config.ts` (dérivée de `domain`), écrite dans le
`data-api-url` du formulaire à la construction ; aucune adresse n'est en dur dans le script.
Si `apiUrl` est vide, le script ne touche pas au formulaire : il garde la validation du navigateur
et ouvre la messagerie, comme sans JavaScript.

Le champ caché de la page s'appelle `trap` (un nom que les navigateurs et gestionnaires de mots de
passe ne remplissent pas) : s'il est rempli, le script affiche un succès sans rien envoyer. La clé
`website` du corps JSON reste vide : c'est celle qu'attend la route. Réponses : 2xx envoyé (la
route répond 202), 400 ou 422 refusé, 429 trop de demandes, autre statut ou absence de réponse
(15 s) : message d'erreur avec l'adresse de contact. Pour un 400 `invalid_body`, le script lit
seulement les clés de `details.fieldErrors` (`centerName` devient le champ « Centre », `roomsCount`
le champ « Nombre de salles »), signale chaque champ refusé sous le champ avec son propre texte
(jamais celui du serveur) et place le focus sur le premier. Sans JavaScript, le formulaire ouvre
la messagerie (`mailto:`).

L'API doit autoriser l'origine de la vitrine (CORS) : le navigateur envoie la requête depuis un
autre domaine.

## Captures d'écran

Les images viennent de l'écran de salle réel en mode démo (`public/captures/`, WebP en trois
largeurs et un JPEG de repli). Pour les refaire :

```bash
cd game/e2e
npm install
npm --prefix ../room-app install
npx playwright install chromium
npm run captures
```

Le script (`game/e2e/captures/vitrine.spec.ts`, hors suite de tests) démarre l'écran de salle sur
:4174, joue le parcours en horloge figée, prend des captures 1920 x 1080 et les convertit dans
Chromium. `CAPTURES_MINI_GAME=<code>` choisit le mini-jeu montré, `CAPTURES_OUT=<dossier>` le
dossier de sortie.

## Déployer

`dist/` est un dossier de fichiers statiques : le copier derrière n'importe quel serveur web.
Seuls les fichiers de `dist/assets/` portent une empreinte dans leur nom (cache long possible) ;
les pages HTML, les captures et la police se revalident.

Exemple Caddy (en-têtes de sécurité, pages sans extension, 404). À adapter au domaine ; `<apiUrl>`
est l'adresse de l'API (`connect-src` ne l'autorise que pour le formulaire). Aucun `unsafe-inline`
n'est nécessaire : le site n'embarque ni script ni style en ligne.

```caddyfile
www.example.org {
	root * /srv/vitrine
	encode zstd gzip
	file_server

	try_files {path} {path}.html

	header {
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://api.example.org; form-action 'self' mailto:; frame-ancestors 'none'; base-uri 'self'"
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Content-Type-Options "nosniff"
	}

	@hashed path /assets/*
	header @hashed Cache-Control "public, max-age=31536000, immutable"

	handle_errors {
		rewrite * /404.html
		file_server
	}
}
```

Le bloc ci-dessus est une proposition : `deploy/` n'est pas modifié par ce paquet.
