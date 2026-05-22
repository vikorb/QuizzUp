const SUPERADMIN_COMPANY_ID = 9

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  const [admin] = await knex('admins')
    .select('id')
    .where('role', 'superadmin')
    .where('company_id', SUPERADMIN_COMPANY_ID)
    .whereNot('status', 2)
    .orderBy('id', 'asc')
    .limit(1)

  if (!admin) {
    throw new Error(
      `Impossible de créer la seed quiz : aucun superadmin actif trouvé pour la compagnie ${SUPERADMIN_COMPANY_ID}.`,
    )
  }

  const companies = await knex('companies')
    .select('id')
    .whereNot('id', SUPERADMIN_COMPANY_ID)
    .whereNot('status', 2)
    .orderBy('id', 'asc')
    .limit(3)

  const globalThemes = [
    {
      name: 'Culture générale',
      mode: 'classic',
      questions: [
        {
          question: 'Quelle est la capitale de la France ?',
          answers: [
            { response: 'Paris', isCorrect: true },
            { response: 'Lyon', isCorrect: false },
            { response: 'Marseille', isCorrect: false },
            { response: 'Toulouse', isCorrect: false },
          ],
        },
        {
          question: 'Combien y a-t-il de continents généralement reconnus ?',
          answers: [
            { response: '5', isCorrect: false },
            { response: '6', isCorrect: false },
            { response: '7', isCorrect: true },
            { response: '8', isCorrect: false },
          ],
        },
        {
          question: 'Quel est le plus grand océan du monde ?',
          answers: [
            { response: 'Océan Atlantique', isCorrect: false },
            { response: 'Océan Indien', isCorrect: false },
            { response: 'Océan Arctique', isCorrect: false },
            { response: 'Océan Pacifique', isCorrect: true },
          ],
        },
        {
          question: 'Quel animal est surnommé le roi de la jungle ?',
          answers: [
            { response: 'Le tigre', isCorrect: false },
            { response: 'Le lion', isCorrect: true },
            { response: 'L’éléphant', isCorrect: false },
            { response: 'Le gorille', isCorrect: false },
          ],
        },
        {
          question: 'Combien de jours compte une année bissextile ?',
          answers: [
            { response: '364', isCorrect: false },
            { response: '365', isCorrect: false },
            { response: '366', isCorrect: true },
            { response: '367', isCorrect: false },
          ],
        },
        {
          question: 'Quelle planète est surnommée la planète rouge ?',
          answers: [
            { response: 'Vénus', isCorrect: false },
            { response: 'Mars', isCorrect: true },
            { response: 'Jupiter', isCorrect: false },
            { response: 'Mercure', isCorrect: false },
          ],
        },
        {
          question: 'Quel est le symbole chimique de l’eau ?',
          answers: [
            { response: 'CO2', isCorrect: false },
            { response: 'O2', isCorrect: false },
            { response: 'H2O', isCorrect: true },
            { response: 'NaCl', isCorrect: false },
          ],
        },
        {
          question: 'Quel pays a pour drapeau un cercle rouge sur fond blanc ?',
          answers: [
            { response: 'Japon', isCorrect: true },
            { response: 'Chine', isCorrect: false },
            { response: 'Corée du Sud', isCorrect: false },
            { response: 'Vietnam', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Histoire',
      mode: 'classic',
      questions: [
        {
          question: 'En quelle année a eu lieu la Révolution française ?',
          answers: [
            { response: '1492', isCorrect: false },
            { response: '1789', isCorrect: true },
            { response: '1815', isCorrect: false },
            { response: '1914', isCorrect: false },
          ],
        },
        {
          question: 'Qui était Napoléon Bonaparte ?',
          answers: [
            { response: 'Un roi d’Espagne', isCorrect: false },
            { response: 'Un empereur français', isCorrect: true },
            { response: 'Un explorateur portugais', isCorrect: false },
            { response: 'Un philosophe grec', isCorrect: false },
          ],
        },
        {
          question: 'Quel mur est tombé en 1989 ?',
          answers: [
            { response: 'Le mur d’Hadrien', isCorrect: false },
            { response: 'Le mur de Berlin', isCorrect: true },
            { response: 'La Grande Muraille', isCorrect: false },
            { response: 'Le mur des Lamentations', isCorrect: false },
          ],
        },
        {
          question: 'Qui a découvert l’Amérique en 1492 selon l’histoire européenne classique ?',
          answers: [
            { response: 'Marco Polo', isCorrect: false },
            { response: 'Christophe Colomb', isCorrect: true },
            { response: 'Vasco de Gama', isCorrect: false },
            { response: 'Magellan', isCorrect: false },
          ],
        },
        {
          question: 'Quelle guerre a commencé en 1914 ?',
          answers: [
            { response: 'La Première Guerre mondiale', isCorrect: true },
            { response: 'La Seconde Guerre mondiale', isCorrect: false },
            { response: 'La guerre froide', isCorrect: false },
            { response: 'La guerre de Cent Ans', isCorrect: false },
          ],
        },
        {
          question: 'Quel roi de France est surnommé le Roi-Soleil ?',
          answers: [
            { response: 'Louis IX', isCorrect: false },
            { response: 'Louis XIV', isCorrect: true },
            { response: 'Louis XVI', isCorrect: false },
            { response: 'François Ier', isCorrect: false },
          ],
        },
        {
          question: 'Dans quelle ville Jeanne d’Arc a-t-elle été brûlée vive ?',
          answers: [
            { response: 'Rouen', isCorrect: true },
            { response: 'Orléans', isCorrect: false },
            { response: 'Reims', isCorrect: false },
            { response: 'Paris', isCorrect: false },
          ],
        },
        {
          question: 'Quel empire avait Rome pour capitale ?',
          answers: [
            { response: 'L’Empire ottoman', isCorrect: false },
            { response: 'L’Empire romain', isCorrect: true },
            { response: 'L’Empire perse', isCorrect: false },
            { response: 'L’Empire byzantin uniquement', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Géographie',
      mode: 'classic',
      questions: [
        {
          question: 'Quel est le plus long fleuve du monde selon la réponse la plus courante ?',
          answers: [
            { response: 'Le Nil', isCorrect: true },
            { response: 'La Seine', isCorrect: false },
            { response: 'Le Rhin', isCorrect: false },
            { response: 'La Tamise', isCorrect: false },
          ],
        },
        {
          question: 'Dans quel pays se trouve la ville de Barcelone ?',
          answers: [
            { response: 'Italie', isCorrect: false },
            { response: 'Espagne', isCorrect: true },
            { response: 'Portugal', isCorrect: false },
            { response: 'France', isCorrect: false },
          ],
        },
        {
          question: 'Quelle est la capitale de l’Italie ?',
          answers: [
            { response: 'Milan', isCorrect: false },
            { response: 'Venise', isCorrect: false },
            { response: 'Rome', isCorrect: true },
            { response: 'Naples', isCorrect: false },
          ],
        },
        {
          question: 'Sur quel continent se trouve le Brésil ?',
          answers: [
            { response: 'Afrique', isCorrect: false },
            { response: 'Amérique du Sud', isCorrect: true },
            { response: 'Asie', isCorrect: false },
            { response: 'Europe', isCorrect: false },
          ],
        },
        {
          question: 'Quel pays possède la ville de Marrakech ?',
          answers: [
            { response: 'Algérie', isCorrect: false },
            { response: 'Tunisie', isCorrect: false },
            { response: 'Maroc', isCorrect: true },
            { response: 'Égypte', isCorrect: false },
          ],
        },
        {
          question: 'Quel est le plus grand désert chaud du monde ?',
          answers: [
            { response: 'Le Sahara', isCorrect: true },
            { response: 'Le Gobi', isCorrect: false },
            { response: 'Le Kalahari', isCorrect: false },
            { response: 'Le désert d’Atacama', isCorrect: false },
          ],
        },
        {
          question: 'Quelle montagne est la plus haute du monde ?',
          answers: [
            { response: 'Le Mont Blanc', isCorrect: false },
            { response: 'L’Everest', isCorrect: true },
            { response: 'Le Kilimandjaro', isCorrect: false },
            { response: 'Le K2', isCorrect: false },
          ],
        },
        {
          question: 'Quelle mer borde le sud de la France ?',
          answers: [
            { response: 'La mer Baltique', isCorrect: false },
            { response: 'La mer Méditerranée', isCorrect: true },
            { response: 'La mer Rouge', isCorrect: false },
            { response: 'La mer du Nord', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Cinéma',
      mode: 'classic',
      questions: [
        {
          question: 'Quel film met en scène Jack et Rose sur un paquebot ?',
          answers: [
            { response: 'Avatar', isCorrect: false },
            { response: 'Titanic', isCorrect: true },
            { response: 'Inception', isCorrect: false },
            { response: 'Gladiator', isCorrect: false },
          ],
        },
        {
          question: 'Dans quelle saga trouve-t-on le personnage Dark Vador ?',
          answers: [
            { response: 'Star Wars', isCorrect: true },
            { response: 'Harry Potter', isCorrect: false },
            { response: 'Le Seigneur des Anneaux', isCorrect: false },
            { response: 'Matrix', isCorrect: false },
          ],
        },
        {
          question: 'Quel acteur joue Iron Man dans le MCU ?',
          answers: [
            { response: 'Chris Evans', isCorrect: false },
            { response: 'Robert Downey Jr.', isCorrect: true },
            { response: 'Tom Holland', isCorrect: false },
            { response: 'Mark Ruffalo', isCorrect: false },
          ],
        },
        {
          question: 'Quel réalisateur est connu pour Jurassic Park ?',
          answers: [
            { response: 'Steven Spielberg', isCorrect: true },
            { response: 'Christopher Nolan', isCorrect: false },
            { response: 'Quentin Tarantino', isCorrect: false },
            { response: 'Martin Scorsese', isCorrect: false },
          ],
        },
        {
          question: 'Quel film contient la réplique culte “Je suis ton père” ?',
          answers: [
            { response: 'Star Wars : L’Empire contre-attaque', isCorrect: true },
            { response: 'Retour vers le futur', isCorrect: false },
            { response: 'Matrix', isCorrect: false },
            { response: 'Terminator 2', isCorrect: false },
          ],
        },
        {
          question: 'Quel est le nom du sorcier principal dans la saga Harry Potter ?',
          answers: [
            { response: 'Ron Weasley', isCorrect: false },
            { response: 'Harry Potter', isCorrect: true },
            { response: 'Drago Malefoy', isCorrect: false },
            { response: 'Severus Rogue', isCorrect: false },
          ],
        },
        {
          question: 'Quel film se déroule principalement dans les rêves ?',
          answers: [
            { response: 'Inception', isCorrect: true },
            { response: 'Avatar', isCorrect: false },
            { response: 'Joker', isCorrect: false },
            { response: 'Interstellar', isCorrect: false },
          ],
        },
        {
          question: 'Dans Le Roi Lion, quel animal est Simba ?',
          answers: [
            { response: 'Un tigre', isCorrect: false },
            { response: 'Un lion', isCorrect: true },
            { response: 'Un léopard', isCorrect: false },
            { response: 'Un guépard', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Musique',
      mode: 'audio',
      questions: [
        {
          question: 'Quel instrument possède généralement 88 touches ?',
          answers: [
            { response: 'Le piano', isCorrect: true },
            { response: 'La guitare', isCorrect: false },
            { response: 'La batterie', isCorrect: false },
            { response: 'Le violon', isCorrect: false },
          ],
        },
        {
          question: 'Quel artiste est surnommé le King of Pop ?',
          answers: [
            { response: 'Prince', isCorrect: false },
            { response: 'Michael Jackson', isCorrect: true },
            { response: 'Elvis Presley', isCorrect: false },
            { response: 'Stevie Wonder', isCorrect: false },
          ],
        },
        {
          question: 'Quel groupe a chanté Bohemian Rhapsody ?',
          answers: [
            { response: 'Queen', isCorrect: true },
            { response: 'The Beatles', isCorrect: false },
            { response: 'U2', isCorrect: false },
            { response: 'Oasis', isCorrect: false },
          ],
        },
        {
          question: 'Quel genre musical est associé à Bob Marley ?',
          answers: [
            { response: 'Reggae', isCorrect: true },
            { response: 'Métal', isCorrect: false },
            { response: 'Techno', isCorrect: false },
            { response: 'Classique', isCorrect: false },
          ],
        },
        {
          question: 'Combien de cordes possède une guitare classique standard ?',
          answers: [
            { response: '4', isCorrect: false },
            { response: '5', isCorrect: false },
            { response: '6', isCorrect: true },
            { response: '7', isCorrect: false },
          ],
        },
        {
          question: 'Quel artiste français a chanté Alors on danse ?',
          answers: [
            { response: 'Stromae', isCorrect: true },
            { response: 'Orelsan', isCorrect: false },
            { response: 'Gims', isCorrect: false },
            { response: 'Soprano', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Sport',
      mode: 'classic',
      questions: [
        {
          question: 'Combien de joueurs une équipe de football aligne-t-elle sur le terrain au début du match ?',
          answers: [
            { response: '9', isCorrect: false },
            { response: '10', isCorrect: false },
            { response: '11', isCorrect: true },
            { response: '12', isCorrect: false },
          ],
        },
        {
          question: 'Quel sport utilise une raquette et un volant ?',
          answers: [
            { response: 'Tennis', isCorrect: false },
            { response: 'Badminton', isCorrect: true },
            { response: 'Squash', isCorrect: false },
            { response: 'Padel', isCorrect: false },
          ],
        },
        {
          question: 'Dans quel sport parle-t-on de Grand Chelem ?',
          answers: [
            { response: 'Tennis', isCorrect: true },
            { response: 'Football', isCorrect: false },
            { response: 'Basketball', isCorrect: false },
            { response: 'Natation', isCorrect: false },
          ],
        },
        {
          question: 'Quelle compétition de football oppose des nations européennes ?',
          answers: [
            { response: 'La Copa América', isCorrect: false },
            { response: 'L’Euro', isCorrect: true },
            { response: 'La CAN', isCorrect: false },
            { response: 'La Ligue 1', isCorrect: false },
          ],
        },
        {
          question: 'Quel pays est célèbre pour les All Blacks ?',
          answers: [
            { response: 'Australie', isCorrect: false },
            { response: 'Nouvelle-Zélande', isCorrect: true },
            { response: 'Afrique du Sud', isCorrect: false },
            { response: 'Angleterre', isCorrect: false },
          ],
        },
        {
          question: 'Combien de points vaut un lancer franc au basket ?',
          answers: [
            { response: '1', isCorrect: true },
            { response: '2', isCorrect: false },
            { response: '3', isCorrect: false },
            { response: '4', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Sciences',
      mode: 'classic',
      questions: [
        {
          question: 'Quel gaz les plantes absorbent-elles principalement pour la photosynthèse ?',
          answers: [
            { response: 'Oxygène', isCorrect: false },
            { response: 'Dioxyde de carbone', isCorrect: true },
            { response: 'Azote', isCorrect: false },
            { response: 'Hydrogène', isCorrect: false },
          ],
        },
        {
          question: 'Quel organe pompe le sang dans le corps humain ?',
          answers: [
            { response: 'Le cerveau', isCorrect: false },
            { response: 'Le cœur', isCorrect: true },
            { response: 'Le foie', isCorrect: false },
            { response: 'Les poumons', isCorrect: false },
          ],
        },
        {
          question: 'Quelle unité mesure la force ?',
          answers: [
            { response: 'Le watt', isCorrect: false },
            { response: 'Le newton', isCorrect: true },
            { response: 'Le volt', isCorrect: false },
            { response: 'Le litre', isCorrect: false },
          ],
        },
        {
          question: 'Quelle planète est la plus proche du Soleil ?',
          answers: [
            { response: 'Mercure', isCorrect: true },
            { response: 'Vénus', isCorrect: false },
            { response: 'Terre', isCorrect: false },
            { response: 'Mars', isCorrect: false },
          ],
        },
        {
          question: 'Combien de chromosomes possède généralement un être humain ?',
          answers: [
            { response: '23', isCorrect: false },
            { response: '46', isCorrect: true },
            { response: '64', isCorrect: false },
            { response: '92', isCorrect: false },
          ],
        },
        {
          question: 'Quel métal est liquide à température ambiante ?',
          answers: [
            { response: 'Fer', isCorrect: false },
            { response: 'Mercure', isCorrect: true },
            { response: 'Cuivre', isCorrect: false },
            { response: 'Aluminium', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Tech & Web',
      mode: 'classic',
      questions: [
        {
          question: 'Que signifie HTML ?',
          answers: [
            { response: 'HyperText Markup Language', isCorrect: true },
            { response: 'HighText Machine Language', isCorrect: false },
            { response: 'HyperTool Multi Language', isCorrect: false },
            { response: 'Home Text Markup Logic', isCorrect: false },
          ],
        },
        {
          question: 'Quel langage est principalement utilisé pour styliser une page web ?',
          answers: [
            { response: 'SQL', isCorrect: false },
            { response: 'CSS', isCorrect: true },
            { response: 'Python', isCorrect: false },
            { response: 'Bash', isCorrect: false },
          ],
        },
        {
          question: 'Quel protocole est utilisé pour charger une page web sécurisée ?',
          answers: [
            { response: 'FTP', isCorrect: false },
            { response: 'SMTP', isCorrect: false },
            { response: 'HTTPS', isCorrect: true },
            { response: 'SSH', isCorrect: false },
          ],
        },
        {
          question: 'Quel système permet de versionner du code ?',
          answers: [
            { response: 'Git', isCorrect: true },
            { response: 'Docker', isCorrect: false },
            { response: 'Nginx', isCorrect: false },
            { response: 'Redis', isCorrect: false },
          ],
        },
        {
          question: 'Quel outil sert souvent à conteneuriser une application ?',
          answers: [
            { response: 'Docker', isCorrect: true },
            { response: 'Figma', isCorrect: false },
            { response: 'Jira', isCorrect: false },
            { response: 'Postman', isCorrect: false },
          ],
        },
        {
          question: 'Quel langage est exécuté dans le navigateur ?',
          answers: [
            { response: 'JavaScript', isCorrect: true },
            { response: 'PHP uniquement', isCorrect: false },
            { response: 'SQL', isCorrect: false },
            { response: 'YAML', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Jeux vidéo',
      mode: 'classic',
      questions: [
        {
          question: 'Quel plombier moustachu est la mascotte de Nintendo ?',
          answers: [
            { response: 'Mario', isCorrect: true },
            { response: 'Sonic', isCorrect: false },
            { response: 'Crash Bandicoot', isCorrect: false },
            { response: 'Kirby', isCorrect: false },
          ],
        },
        {
          question: 'Dans Minecraft, quel matériau faut-il pour fabriquer un portail du Nether ?',
          answers: [
            { response: 'Obsidienne', isCorrect: true },
            { response: 'Diamant', isCorrect: false },
            { response: 'Pierre taillée', isCorrect: false },
            { response: 'Netherrack', isCorrect: false },
          ],
        },
        {
          question: 'Quel jeu met en scène Link et Zelda ?',
          answers: [
            { response: 'The Legend of Zelda', isCorrect: true },
            { response: 'Final Fantasy', isCorrect: false },
            { response: 'Elden Ring', isCorrect: false },
            { response: 'Animal Crossing', isCorrect: false },
          ],
        },
        {
          question: 'Quel studio a créé la série GTA ?',
          answers: [
            { response: 'Rockstar Games', isCorrect: true },
            { response: 'Ubisoft', isCorrect: false },
            { response: 'Electronic Arts', isCorrect: false },
            { response: 'Valve', isCorrect: false },
          ],
        },
        {
          question: 'Dans Pokémon, quel type est efficace contre le type Eau ?',
          answers: [
            { response: 'Feu', isCorrect: false },
            { response: 'Plante', isCorrect: true },
            { response: 'Roche', isCorrect: false },
            { response: 'Acier', isCorrect: false },
          ],
        },
        {
          question: 'Quel jeu populaire utilise une île, un bus volant et une tempête ?',
          answers: [
            { response: 'Fortnite', isCorrect: true },
            { response: 'Rocket League', isCorrect: false },
            { response: 'Overwatch', isCorrect: false },
            { response: 'Valorant', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Cuisine',
      mode: 'classic',
      questions: [
        {
          question: 'Quel ingrédient est indispensable pour faire une omelette classique ?',
          answers: [
            { response: 'Des œufs', isCorrect: true },
            { response: 'Du riz', isCorrect: false },
            { response: 'Du chocolat', isCorrect: false },
            { response: 'Des lentilles', isCorrect: false },
          ],
        },
        {
          question: 'Quel pays est associé aux sushis ?',
          answers: [
            { response: 'Chine', isCorrect: false },
            { response: 'Japon', isCorrect: true },
            { response: 'Thaïlande', isCorrect: false },
            { response: 'Corée du Sud', isCorrect: false },
          ],
        },
        {
          question: 'Quel fromage est traditionnellement utilisé dans une raclette ?',
          answers: [
            { response: 'Fromage à raclette', isCorrect: true },
            { response: 'Mozzarella', isCorrect: false },
            { response: 'Feta', isCorrect: false },
            { response: 'Cheddar', isCorrect: false },
          ],
        },
        {
          question: 'Quel dessert italien signifie littéralement “tire-moi vers le haut” ?',
          answers: [
            { response: 'Tiramisu', isCorrect: true },
            { response: 'Panna cotta', isCorrect: false },
            { response: 'Gelato', isCorrect: false },
            { response: 'Cannoli', isCorrect: false },
          ],
        },
        {
          question: 'Quel ingrédient donne sa couleur rouge à une sauce tomate ?',
          answers: [
            { response: 'La tomate', isCorrect: true },
            { response: 'La carotte', isCorrect: false },
            { response: 'Le poivron vert', isCorrect: false },
            { response: 'La pomme de terre', isCorrect: false },
          ],
        },
        {
          question: 'Quelle boisson est obtenue à partir de grains torréfiés ?',
          answers: [
            { response: 'Le café', isCorrect: true },
            { response: 'Le lait', isCorrect: false },
            { response: 'Le jus d’orange', isCorrect: false },
            { response: 'L’eau pétillante', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Animaux',
      mode: 'image',
      questions: [
        {
          question: 'Quel animal miaule ?',
          answers: [
            { response: 'Le chat', isCorrect: true },
            { response: 'Le chien', isCorrect: false },
            { response: 'Le cheval', isCorrect: false },
            { response: 'La vache', isCorrect: false },
          ],
        },
        {
          question: 'Quel animal est connu pour sa trompe ?',
          answers: [
            { response: 'L’éléphant', isCorrect: true },
            { response: 'Le zèbre', isCorrect: false },
            { response: 'Le lion', isCorrect: false },
            { response: 'Le loup', isCorrect: false },
          ],
        },
        {
          question: 'Quel animal produit du miel ?',
          answers: [
            { response: 'L’abeille', isCorrect: true },
            { response: 'La fourmi', isCorrect: false },
            { response: 'Le papillon', isCorrect: false },
            { response: 'La mouche', isCorrect: false },
          ],
        },
        {
          question: 'Quel animal est le plus rapide sur terre ?',
          answers: [
            { response: 'Le guépard', isCorrect: true },
            { response: 'Le cheval', isCorrect: false },
            { response: 'Le léopard', isCorrect: false },
            { response: 'Le kangourou', isCorrect: false },
          ],
        },
        {
          question: 'Quel oiseau est souvent associé à la paix ?',
          answers: [
            { response: 'La colombe', isCorrect: true },
            { response: 'Le corbeau', isCorrect: false },
            { response: 'L’aigle', isCorrect: false },
            { response: 'Le hibou', isCorrect: false },
          ],
        },
        {
          question: 'Quel animal vit principalement dans l’eau et possède des nageoires ?',
          answers: [
            { response: 'Le poisson', isCorrect: true },
            { response: 'Le renard', isCorrect: false },
            { response: 'Le chien', isCorrect: false },
            { response: 'Le serpent', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Littérature',
      mode: 'classic',
      questions: [
        {
          question: 'Qui a écrit Les Misérables ?',
          answers: [
            { response: 'Victor Hugo', isCorrect: true },
            { response: 'Molière', isCorrect: false },
            { response: 'Émile Zola', isCorrect: false },
            { response: 'Jules Verne', isCorrect: false },
          ],
        },
        {
          question: 'Quel personnage poursuit le lapin blanc ?',
          answers: [
            { response: 'Alice', isCorrect: true },
            { response: 'Cendrillon', isCorrect: false },
            { response: 'Blanche-Neige', isCorrect: false },
            { response: 'Hermione', isCorrect: false },
          ],
        },
        {
          question: 'Qui est l’auteur du Petit Prince ?',
          answers: [
            { response: 'Antoine de Saint-Exupéry', isCorrect: true },
            { response: 'Albert Camus', isCorrect: false },
            { response: 'Jean-Paul Sartre', isCorrect: false },
            { response: 'Marcel Pagnol', isCorrect: false },
          ],
        },
        {
          question: 'Quel détective vit au 221B Baker Street ?',
          answers: [
            { response: 'Sherlock Holmes', isCorrect: true },
            { response: 'Hercule Poirot', isCorrect: false },
            { response: 'Arsène Lupin', isCorrect: false },
            { response: 'Maigret', isCorrect: false },
          ],
        },
        {
          question: 'Quel auteur a créé Arsène Lupin ?',
          answers: [
            { response: 'Maurice Leblanc', isCorrect: true },
            { response: 'Arthur Conan Doyle', isCorrect: false },
            { response: 'Victor Hugo', isCorrect: false },
            { response: 'Gustave Flaubert', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Séries TV',
      mode: 'classic',
      questions: [
        {
          question: 'Dans quelle série trouve-t-on Walter White ?',
          answers: [
            { response: 'Breaking Bad', isCorrect: true },
            { response: 'Dexter', isCorrect: false },
            { response: 'Lost', isCorrect: false },
            { response: 'The Boys', isCorrect: false },
          ],
        },
        {
          question: 'Quelle série se déroule autour du Trône de Fer ?',
          answers: [
            { response: 'Game of Thrones', isCorrect: true },
            { response: 'The Walking Dead', isCorrect: false },
            { response: 'Vikings', isCorrect: false },
            { response: 'The Crown', isCorrect: false },
          ],
        },
        {
          question: 'Dans Friends, comment s’appelle le café fréquenté par le groupe ?',
          answers: [
            { response: 'Central Perk', isCorrect: true },
            { response: 'MacLaren’s', isCorrect: false },
            { response: 'Luke’s Diner', isCorrect: false },
            { response: 'Café de Flore', isCorrect: false },
          ],
        },
        {
          question: 'Quelle série suit un groupe de survivants face à des zombies ?',
          answers: [
            { response: 'The Walking Dead', isCorrect: true },
            { response: 'The Office', isCorrect: false },
            { response: 'Suits', isCorrect: false },
            { response: 'Sherlock', isCorrect: false },
          ],
        },
        {
          question: 'Dans Stranger Things, comment s’appelle la jeune fille aux pouvoirs ?',
          answers: [
            { response: 'Eleven', isCorrect: true },
            { response: 'Max', isCorrect: false },
            { response: 'Nancy', isCorrect: false },
            { response: 'Joyce', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'France',
      mode: 'classic',
      questions: [
        {
          question: 'Quelle est la devise de la République française ?',
          answers: [
            { response: 'Liberté, Égalité, Fraternité', isCorrect: true },
            { response: 'Force, Honneur, Patrie', isCorrect: false },
            { response: 'Unité, Travail, Justice', isCorrect: false },
            { response: 'Paix, Travail, Liberté', isCorrect: false },
          ],
        },
        {
          question: 'Quelle ville est surnommée la Ville Lumière ?',
          answers: [
            { response: 'Paris', isCorrect: true },
            { response: 'Lille', isCorrect: false },
            { response: 'Nice', isCorrect: false },
            { response: 'Bordeaux', isCorrect: false },
          ],
        },
        {
          question: 'Quel monument parisien a été construit pour l’exposition universelle de 1889 ?',
          answers: [
            { response: 'La tour Eiffel', isCorrect: true },
            { response: 'Le Louvre', isCorrect: false },
            { response: 'Notre-Dame', isCorrect: false },
            { response: 'L’Arc de Triomphe', isCorrect: false },
          ],
        },
        {
          question: 'Quelle région française est connue pour ses crêpes ?',
          answers: [
            { response: 'Bretagne', isCorrect: true },
            { response: 'Alsace', isCorrect: false },
            { response: 'Provence', isCorrect: false },
            { response: 'Normandie', isCorrect: false },
          ],
        },
        {
          question: 'Quel fleuve traverse Paris ?',
          answers: [
            { response: 'La Seine', isCorrect: true },
            { response: 'La Loire', isCorrect: false },
            { response: 'Le Rhône', isCorrect: false },
            { response: 'La Garonne', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Logique & devinettes',
      mode: 'classic',
      questions: [
        {
          question: 'Je suis toujours devant toi, mais tu ne peux jamais me voir. Qui suis-je ?',
          answers: [
            { response: 'Le futur', isCorrect: true },
            { response: 'Le passé', isCorrect: false },
            { response: 'Le miroir', isCorrect: false },
            { response: 'Le soleil', isCorrect: false },
          ],
        },
        {
          question: 'Qu’est-ce qui monte mais ne redescend jamais ?',
          answers: [
            { response: 'L’âge', isCorrect: true },
            { response: 'La pluie', isCorrect: false },
            { response: 'Un ascenseur', isCorrect: false },
            { response: 'La température', isCorrect: false },
          ],
        },
        {
          question: 'Combien font 7 x 8 ?',
          answers: [
            { response: '54', isCorrect: false },
            { response: '56', isCorrect: true },
            { response: '58', isCorrect: false },
            { response: '64', isCorrect: false },
          ],
        },
        {
          question: 'Quel nombre vient après 1, 1, 2, 3, 5, 8 ?',
          answers: [
            { response: '11', isCorrect: false },
            { response: '13', isCorrect: true },
            { response: '15', isCorrect: false },
            { response: '16', isCorrect: false },
          ],
        },
        {
          question: 'Si tu doubles le nombre 12 puis retires 4, combien obtiens-tu ?',
          answers: [
            { response: '20', isCorrect: true },
            { response: '18', isCorrect: false },
            { response: '22', isCorrect: false },
            { response: '24', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Années 2000',
      mode: 'mixed',
      questions: [
        {
          question: 'Quel réseau social a été lancé en 2004 ?',
          answers: [
            { response: 'Facebook', isCorrect: true },
            { response: 'Instagram', isCorrect: false },
            { response: 'TikTok', isCorrect: false },
            { response: 'Snapchat', isCorrect: false },
          ],
        },
        {
          question: 'Quelle console portable de Nintendo est sortie en Europe dans les années 2000 avec deux écrans ?',
          answers: [
            { response: 'Nintendo DS', isCorrect: true },
            { response: 'Game Boy Color', isCorrect: false },
            { response: 'PSP Go', isCorrect: false },
            { response: 'Nintendo Switch', isCorrect: false },
          ],
        },
        {
          question: 'Quel film d’animation Pixar met en scène un poisson-clown nommé Nemo ?',
          answers: [
            { response: 'Le Monde de Nemo', isCorrect: true },
            { response: 'Toy Story', isCorrect: false },
            { response: 'Cars', isCorrect: false },
            { response: 'Ratatouille', isCorrect: false },
          ],
        },
        {
          question: 'Quel téléphone Apple est présenté pour la première fois en 2007 ?',
          answers: [
            { response: 'iPhone', isCorrect: true },
            { response: 'iPad', isCorrect: false },
            { response: 'iPod Shuffle', isCorrect: false },
            { response: 'Apple Watch', isCorrect: false },
          ],
        },
        {
          question: 'Quel jeu musical avec guitare en plastique devient très populaire dans les années 2000 ?',
          answers: [
            { response: 'Guitar Hero', isCorrect: true },
            { response: 'FIFA Street', isCorrect: false },
            { response: 'Wii Sports', isCorrect: false },
            { response: 'Les Sims', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Quiz image',
      mode: 'image',
      questions: [
        {
          question: 'Quel monument est représenté sur cette image ?',
          typeMedia: 'image',
          mediaUrl: 'https://example.com/media/eiffel.jpg',
          answers: [
            { response: 'Tour Eiffel', isCorrect: true },
            { response: 'Big Ben', isCorrect: false },
            { response: 'Colisée', isCorrect: false },
            { response: 'Statue de la Liberté', isCorrect: false },
          ],
        },
        {
          question: 'Quel animal voit-on sur cette image ?',
          typeMedia: 'image',
          mediaUrl: 'https://example.com/media/lion.jpg',
          answers: [
            { response: 'Lion', isCorrect: true },
            { response: 'Tigre', isCorrect: false },
            { response: 'Léopard', isCorrect: false },
            { response: 'Puma', isCorrect: false },
          ],
        },
        {
          question: 'Quel drapeau est affiché ?',
          typeMedia: 'image',
          mediaUrl: 'https://example.com/media/japan-flag.jpg',
          answers: [
            { response: 'Japon', isCorrect: true },
            { response: 'Suisse', isCorrect: false },
            { response: 'Canada', isCorrect: false },
            { response: 'Danemark', isCorrect: false },
          ],
        },
        {
          question: 'Quel logo tech est affiché ?',
          typeMedia: 'image',
          mediaUrl: 'https://example.com/media/github-logo.jpg',
          answers: [
            { response: 'GitHub', isCorrect: true },
            { response: 'GitLab', isCorrect: false },
            { response: 'Docker', isCorrect: false },
            { response: 'Node.js', isCorrect: false },
          ],
        },
        {
          question: 'Quel plat est visible sur l’image ?',
          typeMedia: 'image',
          mediaUrl: 'https://example.com/media/pizza.jpg',
          answers: [
            { response: 'Pizza', isCorrect: true },
            { response: 'Burger', isCorrect: false },
            { response: 'Tacos', isCorrect: false },
            { response: 'Lasagnes', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Blind test',
      mode: 'audio',
      questions: [
        {
          question: 'Quel instrument entend-on dans cet extrait ?',
          typeMedia: 'audio',
          mediaUrl: 'https://example.com/media/piano.mp3',
          answers: [
            { response: 'Piano', isCorrect: true },
            { response: 'Guitare', isCorrect: false },
            { response: 'Batterie', isCorrect: false },
            { response: 'Flûte', isCorrect: false },
          ],
        },
        {
          question: 'Quel style musical correspond à cet extrait ?',
          typeMedia: 'audio',
          mediaUrl: 'https://example.com/media/reggae.mp3',
          answers: [
            { response: 'Reggae', isCorrect: true },
            { response: 'Rock', isCorrect: false },
            { response: 'Classique', isCorrect: false },
            { response: 'Techno', isCorrect: false },
          ],
        },
        {
          question: 'Quel bruit reconnaît-on ?',
          typeMedia: 'audio',
          mediaUrl: 'https://example.com/media/dog.mp3',
          answers: [
            { response: 'Un chien', isCorrect: true },
            { response: 'Un chat', isCorrect: false },
            { response: 'Un cheval', isCorrect: false },
            { response: 'Un oiseau', isCorrect: false },
          ],
        },
        {
          question: 'Quel objet produit ce son ?',
          typeMedia: 'audio',
          mediaUrl: 'https://example.com/media/phone-ring.mp3',
          answers: [
            { response: 'Un téléphone', isCorrect: true },
            { response: 'Une alarme incendie', isCorrect: false },
            { response: 'Une voiture', isCorrect: false },
            { response: 'Une porte', isCorrect: false },
          ],
        },
        {
          question: 'Quel type de voix entend-on principalement ?',
          typeMedia: 'audio',
          mediaUrl: 'https://example.com/media/choir.mp3',
          answers: [
            { response: 'Une chorale', isCorrect: true },
            { response: 'Un solo de guitare', isCorrect: false },
            { response: 'Un bruit de moteur', isCorrect: false },
            { response: 'Une sirène', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: 'Vrai ou faux',
      mode: 'classic',
      questions: [
        {
          question: 'La Terre tourne autour du Soleil.',
          answers: [
            { response: 'Vrai', isCorrect: true },
            { response: 'Faux', isCorrect: false },
          ],
        },
        {
          question: 'Un triangle possède quatre côtés.',
          answers: [
            { response: 'Vrai', isCorrect: false },
            { response: 'Faux', isCorrect: true },
          ],
        },
        {
          question: 'L’eau bout généralement à 100°C au niveau de la mer.',
          answers: [
            { response: 'Vrai', isCorrect: true },
            { response: 'Faux', isCorrect: false },
          ],
        },
        {
          question: 'Le Soleil est une planète.',
          answers: [
            { response: 'Vrai', isCorrect: false },
            { response: 'Faux', isCorrect: true },
          ],
        },
        {
          question: 'Le français est parlé en Belgique.',
          answers: [
            { response: 'Vrai', isCorrect: true },
            { response: 'Faux', isCorrect: false },
          ],
        },
      ],
    },
  ]

  const companyThemes = companies.flatMap((company, companyIndex) => [
    {
      name: `Quiz établissement ${companyIndex + 1} - Accueil`,
      mode: 'classic',
      scope: 'company',
      companyId: company.id,
      questions: [
        {
          question: 'Quel est le but principal d’un quiz d’accueil ?',
          answers: [
            { response: 'Faire découvrir le lieu ou l’entreprise', isCorrect: true },
            { response: 'Remplacer totalement une formation', isCorrect: false },
            { response: 'Supprimer les règles internes', isCorrect: false },
            { response: 'Éviter toute interaction', isCorrect: false },
          ],
        },
        {
          question: 'Quelle information est utile pour un nouveau participant ?',
          answers: [
            { response: 'Les consignes principales', isCorrect: true },
            { response: 'Un mot de passe personnel', isCorrect: false },
            { response: 'Une donnée bancaire', isCorrect: false },
            { response: 'Une clé privée', isCorrect: false },
          ],
        },
        {
          question: 'Une question privée établissement est visible par qui ?',
          answers: [
            { response: 'Son établissement et les admins autorisés', isCorrect: true },
            { response: 'Tous les établissements concurrents', isCorrect: false },
            { response: 'Uniquement les visiteurs anonymes', isCorrect: false },
            { response: 'Personne', isCorrect: false },
          ],
        },
      ],
    },
    {
      name: `Quiz établissement ${companyIndex + 1} - Fun`,
      mode: 'mixed',
      scope: 'company',
      companyId: company.id,
      questions: [
        {
          question: 'Quel type de question rend un quiz plus dynamique ?',
          answers: [
            { response: 'Une question courte et claire', isCorrect: true },
            { response: 'Une question incompréhensible', isCorrect: false },
            { response: 'Une question sans réponse', isCorrect: false },
            { response: 'Une question trop longue', isCorrect: false },
          ],
        },
        {
          question: 'Quel média peut enrichir une question ?',
          typeMedia: 'image',
          mediaUrl: 'https://example.com/media/company-picture.jpg',
          answers: [
            { response: 'Une image', isCorrect: true },
            { response: 'Un champ vide', isCorrect: false },
            { response: 'Une erreur 500', isCorrect: false },
            { response: 'Une donnée supprimée', isCorrect: false },
          ],
        },
        {
          question: 'Quel format est souvent utilisé pour un blind test ?',
          typeMedia: 'audio',
          mediaUrl: 'https://example.com/media/company-sound.mp3',
          answers: [
            { response: 'Audio', isCorrect: true },
            { response: 'Texte uniquement', isCorrect: false },
            { response: 'SQL brut', isCorrect: false },
            { response: 'Mot de passe', isCorrect: false },
          ],
        },
      ],
    },
  ])

  const themes = [...globalThemes, ...companyThemes]

  await knex.transaction(async (trx) => {
    await trx.raw(
      'TRUNCATE TABLE answers, question_themes, questions, themes RESTART IDENTITY CASCADE',
    )

    for (const themeSeed of themes) {
      const scope = themeSeed.scope ?? 'global'
      const companyId = scope === 'company' ? themeSeed.companyId : null

      const [theme] = await trx('themes')
        .insert({
          admin_id: admin.id,
          company_id: companyId,
          scope,
          name: themeSeed.name,
          mode: themeSeed.mode,
          status: themeSeed.status ?? 1,
        })
        .returning(['id'])

      for (const questionSeed of themeSeed.questions) {
        const [question] = await trx('questions')
          .insert({
            admin_id: admin.id,
            company_id: companyId,
            scope,
            question: questionSeed.question,
            type_media: questionSeed.typeMedia ?? 'none',
            media_url: questionSeed.mediaUrl ?? null,
            status: questionSeed.status ?? 1,
          })
          .returning(['id'])

        await trx('question_themes')
          .insert({
            question_id: question.id,
            theme_id: theme.id,
          })
          .onConflict(['question_id', 'theme_id'])
          .ignore()

        await trx('answers').insert(
          questionSeed.answers.map((answer) => ({
            admin_id: admin.id,
            question_id: question.id,
            response: answer.response,
            is_correct: answer.isCorrect,
            status: answer.status ?? 1,
          })),
        )
      }
    }
  })
}
