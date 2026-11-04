import type { EngineAnswer, EngineQuestion, EngineTheme } from '@quizzup/game-engine'
import {
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  type QuestionKind,
} from '@quizzup/shared'

/**
 * Contenu de démonstration (mode démo, sans backoffice) : des thèmes « sans
 * tubes » (bruitages, instruments…), conformes à la piste retenue pour les droits
 * musicaux. Les URL `demo://` ne pointent vers aucun fichier : les paliers restent muets.
 *
 * Chaque thème couvre tous les mini-jeux : extraits audio (blind test), QCM texte,
 * vrai/faux, estimations (fourchettes chiffrées) et images (révélation progressive).
 * Chaque question porte son type (`kind`), comme celles du backoffice.
 */

/** QCM : énoncé, bonne réponse, puis trois mauvaises. */
type ChoiceItem = [text: string, correct: string, ...wrong: [string, string, string]]
/** Affirmation et sa véracité. */
type TrueFalseItem = [statement: string, isTrue: boolean]
/** Estimation : énoncé, quatre fourchettes croissantes, index de la bonne. */
type EstimateItem = [text: string, ranges: [string, string, string, string], correctIndex: number]
/** Image : emoji affiché, bonne réponse, puis trois mauvaises. */
type ImageItem = [emoji: string, correct: string, ...wrong: [string, string, string]]

type DemoTheme = {
  id: number
  name: string
  items: string[]
  choices: ChoiceItem[]
  trueFalse: TrueFalseItem[]
  estimates: EstimateItem[]
  imagePrompt: string
  images: ImageItem[]
}

const DEMO_THEMES: DemoTheme[] = [
  {
    id: 9001,
    name: 'Instruments',
    items: ['Piano', 'Violon', 'Guitare', 'Batterie', 'Trompette', 'Flûte', 'Harpe', 'Saxophone'],
    choices: [
      ['Combien de cordes compte une guitare classique ?', '6', '4', '7', '12'],
      ['Combien de touches compte un piano standard ?', '88', '76', '92', '100'],
      ['Combien de cordes compte un violon ?', '4', '3', '5', '6'],
      [
        'À quelle famille d’instruments appartient le saxophone ?',
        'Les bois',
        'Les cuivres',
        'Les cordes',
        'Les percussions',
      ],
      [
        'Lequel de ces instruments à cordes frottées est le plus grave ?',
        'La contrebasse',
        'Le violoncelle',
        'L’alto',
        'Le violon',
      ],
      [
        'Quel instrument est composé de lames de bois frappées avec des mailloches ?',
        'Le xylophone',
        'Le triangle',
        'La timbale',
        'La cymbale',
      ],
    ],
    trueFalse: [
      ['Le piano est un instrument à cordes frappées.', true],
      ['La trompette appartient à la famille des bois.', false],
      ['La flûte traversière appartient à la famille des bois, même en métal.', true],
      ['Le tuba joue plus aigu que la trompette.', false],
      ['Une harpe de concert possède sept pédales.', true],
      ['Le violoncelle se joue posé sur l’épaule.', false],
    ],
    estimates: [
      [
        'Combien de cordes compte une harpe de concert ?',
        ['Moins de 20', '20 à 39', '40 à 59', '60 ou plus'],
        2,
      ],
      [
        'En quelle année Adolphe Sax a-t-il breveté le saxophone ?',
        ['Avant 1800', '1800 à 1849', '1850 à 1899', '1900 ou après'],
        1,
      ],
      [
        'Combien de touches noires compte un piano standard ?',
        ['Moins de 30', '30 à 39', '40 à 49', '50 ou plus'],
        1,
      ],
      [
        'Combien d’octaves couvre un piano standard ?',
        ['Moins de 5', '5 à 6', '7 à 8', '9 ou plus'],
        2,
      ],
    ],
    imagePrompt: 'Quel instrument se cache derrière l’image ?',
    images: [
      ['🎹', 'Piano', 'Harpe', 'Guitare', 'Flûte'],
      ['🎻', 'Violon', 'Guitare', 'Harpe', 'Saxophone'],
      ['🎺', 'Trompette', 'Saxophone', 'Flûte', 'Batterie'],
      ['🥁', 'Batterie', 'Piano', 'Trompette', 'Violon'],
    ],
  },
  {
    id: 9002,
    name: 'Bruits du quotidien',
    items: [
      'Machine à café',
      'Aspirateur',
      'Porte qui grince',
      'Sonnette',
      'Micro-ondes',
      'Clavier',
      'Douche',
      'Réveil',
    ],
    choices: [
      [
        'Quel appareil chauffe les aliments grâce à des ondes électromagnétiques ?',
        'Le micro-ondes',
        'Le mixeur',
        'La bouilloire',
        'Le réfrigérateur',
      ],
      [
        'Quelle est la touche la plus longue d’un clavier d’ordinateur ?',
        'La barre d’espace',
        'Entrée',
        'Majuscule',
        'Tabulation',
      ],
      [
        'Quel appareil sert à mesurer la température ?',
        'Le thermomètre',
        'Le baromètre',
        'L’hygromètre',
        'L’anémomètre',
      ],
      ['Quelle unité mesure le niveau sonore ?', 'Le décibel', 'Le hertz', 'Le watt', 'Le lumen'],
      [
        'De quel pays l’espresso est-il originaire ?',
        'L’Italie',
        'Le Brésil',
        'La Colombie',
        'L’Éthiopie',
      ],
      [
        'Quelles sont les six premières lettres d’un clavier français ?',
        'AZERTY',
        'QWERTY',
        'QWERTZ',
        'ABCDEF',
      ],
    ],
    trueFalse: [
      ['Le son se propage plus vite dans l’eau que dans l’air.', true],
      ['Le son peut se propager dans le vide.', false],
      ['Le hertz est l’unité de mesure de la fréquence.', true],
      ['Une ampoule LED consomme plus qu’une ampoule à incandescence qui éclaire autant.', false],
      ['L’oreille humaine entend les ultrasons.', false],
      ['Une semaine compte 168 heures.', true],
    ],
    estimates: [
      [
        'À quelle température l’eau bout-elle au niveau de la mer, en °C ?',
        ['Moins de 80', '80 à 99', '100 à 119', '120 ou plus'],
        2,
      ],
      [
        'Combien de touches compte un clavier d’ordinateur complet (avec pavé numérique) ?',
        ['Moins de 60', '60 à 89', '90 à 119', '120 ou plus'],
        2,
      ],
      [
        'À quelle vitesse le son se propage-t-il dans l’air, en mètres par seconde ?',
        ['Moins de 100', '100 à 299', '300 à 499', '500 ou plus'],
        2,
      ],
      [
        'Combien de minutes compte une journée ?',
        ['Moins de 1 000', '1 000 à 1 999', '2 000 à 2 999', '3 000 ou plus'],
        1,
      ],
    ],
    imagePrompt: 'Quel bruit du quotidien se cache derrière l’image ?',
    images: [
      ['☕', 'Machine à café', 'Micro-ondes', 'Aspirateur', 'Douche'],
      ['⏰', 'Réveil', 'Sonnette', 'Clavier', 'Micro-ondes'],
      ['🚿', 'Douche', 'Aspirateur', 'Porte qui grince', 'Machine à café'],
      ['🔔', 'Sonnette', 'Réveil', 'Porte qui grince', 'Clavier'],
    ],
  },
  {
    id: 9003,
    name: 'Animaux',
    items: ['Chat', 'Chien', 'Coq', 'Vache', 'Loup', 'Éléphant', 'Grenouille', 'Hibou'],
    choices: [
      [
        'Quel est le plus grand animal vivant sur Terre ?',
        'La baleine bleue',
        'L’éléphant d’Afrique',
        'Le requin-baleine',
        'La girafe',
      ],
      ['Combien de pattes a une araignée ?', '8', '6', '10', '12'],
      [
        'Comment appelle-t-on le petit de la vache ?',
        'Le veau',
        'Le poulain',
        'L’agneau',
        'Le chevreau',
      ],
      [
        'Quel est l’animal terrestre le plus rapide ?',
        'Le guépard',
        'Le lion',
        'Le cheval',
        'Le loup',
      ],
      ['Quel oiseau est un emblème de la France ?', 'Le coq', 'L’aigle', 'Le pigeon', 'Le hibou'],
      [
        'Quel mammifère est capable de voler ?',
        'La chauve-souris',
        'Le hérisson',
        'La taupe',
        'La loutre',
      ],
    ],
    trueFalse: [
      ['La baleine est un mammifère.', true],
      ['L’autruche est capable de voler.', false],
      ['Le dauphin respire grâce à des branchies.', false],
      ['La pieuvre possède trois cœurs.', true],
      ['La grenouille est un amphibien.', true],
      ['Le panda géant se nourrit principalement de viande.', false],
    ],
    estimates: [
      [
        'Combien de mois dure la gestation d’une éléphante ?',
        ['Moins de 10', '10 à 15', '16 à 19', '20 ou plus'],
        3,
      ],
      [
        'Quelle vitesse maximale un guépard atteint-il, en km/h ?',
        ['Moins de 50', '50 à 79', '80 à 129', '130 ou plus'],
        2,
      ],
      [
        'Combien de vertèbres cervicales compte le cou d’une girafe ?',
        ['Moins de 5', '5 à 9', '10 à 19', '20 ou plus'],
        1,
      ],
      [
        'Combien pèse un éléphant d’Afrique mâle adulte, en kilos ?',
        ['Moins de 1 000', '1 000 à 2 999', '3 000 à 9 999', '10 000 ou plus'],
        2,
      ],
    ],
    imagePrompt: 'Quel animal se cache derrière l’image ?',
    images: [
      ['🐘', 'Éléphant', 'Vache', 'Loup', 'Chien'],
      ['🦉', 'Hibou', 'Coq', 'Chat', 'Grenouille'],
      ['🐸', 'Grenouille', 'Hibou', 'Chat', 'Vache'],
      ['🐓', 'Coq', 'Hibou', 'Chien', 'Loup'],
    ],
  },
  {
    id: 9004,
    name: 'Transports',
    items: ['Train', 'Moto', 'Hélicoptère', 'Vélo', 'Avion', 'Tramway', 'Bateau', 'Camion'],
    choices: [
      [
        'Comment s’appelle le train à grande vitesse de la SNCF ?',
        'Le TGV',
        'L’ICE',
        'Le Shinkansen',
        'L’AVE',
      ],
      ['Combien de roues possède un tricycle ?', '3', '2', '4', '6'],
      [
        'Quel tunnel relie la France au Royaume-Uni ?',
        'Le tunnel sous la Manche',
        'Le tunnel du Mont-Blanc',
        'Le tunnel du Fréjus',
        'Le tunnel du Saint-Gothard',
      ],
      [
        'Quel appareil vole grâce à un rotor ?',
        'L’hélicoptère',
        'La montgolfière',
        'Le planeur',
        'Le dirigeable',
      ],
      [
        'Quelle ville possède le plus ancien métro du monde ?',
        'Londres',
        'Paris',
        'New York',
        'Berlin',
      ],
      [
        'Dans quel pays circule le Shinkansen ?',
        'Le Japon',
        'La Chine',
        'La Corée du Sud',
        'L’Allemagne',
      ],
    ],
    trueFalse: [
      ['Le Concorde était un avion supersonique.', true],
      ['Le Titanic a coulé lors de son voyage inaugural.', true],
      ['Le métro de Paris a été inauguré avant celui de Londres.', false],
      ['En France, les voitures roulent à gauche.', false],
      ['Un tandem est un vélo conçu pour deux personnes.', true],
      ['Un voilier a besoin d’un moteur pour avancer.', false],
    ],
    estimates: [
      [
        'En quelle année les frères Wright ont-ils réalisé leur premier vol motorisé ?',
        ['Avant 1850', '1850 à 1899', '1900 à 1949', '1950 ou après'],
        2,
      ],
      [
        'Quel record de vitesse sur rail un TGV a-t-il établi en 2007, en km/h ?',
        ['Moins de 300', '300 à 449', '450 à 599', '600 ou plus'],
        2,
      ],
      [
        'En quelle année le tunnel sous la Manche a-t-il été inauguré ?',
        ['Avant 1970', '1970 à 1989', '1990 à 2009', '2010 ou après'],
        2,
      ],
      [
        'Combien de kilomètres mesure le tunnel sous la Manche ?',
        ['Moins de 20', '20 à 39', '40 à 59', '60 ou plus'],
        2,
      ],
    ],
    imagePrompt: 'Quel moyen de transport se cache derrière l’image ?',
    images: [
      ['🚂', 'Train', 'Tramway', 'Camion', 'Bateau'],
      ['🚁', 'Hélicoptère', 'Avion', 'Moto', 'Vélo'],
      ['🚲', 'Vélo', 'Moto', 'Tramway', 'Camion'],
      ['✈️', 'Avion', 'Hélicoptère', 'Bateau', 'Train'],
    ],
  },
  {
    id: 9005,
    name: 'Sports',
    items: ['Tennis', 'Basket', 'Boxe', 'Ping-pong', 'Golf', 'Natation', 'Escrime', 'Bowling'],
    choices: [
      [
        'Combien de joueurs une équipe de football aligne-t-elle sur le terrain ?',
        '11',
        '9',
        '10',
        '12',
      ],
      [
        'Dans quel sport utilise-t-on un volant ?',
        'Le badminton',
        'Le tennis',
        'Le squash',
        'Le ping-pong',
      ],
      [
        'Tous les combien d’années ont lieu les Jeux olympiques d’été ?',
        '4 ans',
        '2 ans',
        '3 ans',
        '5 ans',
      ],
      [
        'Quelle ville a accueilli les Jeux olympiques d’été de 2024 ?',
        'Paris',
        'Londres',
        'Los Angeles',
        'Tokyo',
      ],
      [
        'Combien de joueurs une équipe de basket aligne-t-elle sur le terrain ?',
        '5',
        '4',
        '6',
        '7',
      ],
      [
        'Quel tournoi de tennis se dispute à Paris sur terre battue ?',
        'Roland-Garros',
        'Wimbledon',
        'L’US Open',
        'L’Open d’Australie',
      ],
    ],
    trueFalse: [
      ['Un marathon mesure 42,195 km.', true],
      ['Au golf, le but est de jouer le plus de coups possible.', false],
      ['Le Tour de France est une course cycliste.', true],
      ['Au rugby, on peut faire une passe en avant à la main.', false],
      ['Hors arrêts de jeu et prolongations, un match de football dure 90 minutes.', true],
      ['Le tournoi de Wimbledon se joue sur terre battue.', false],
    ],
    estimates: [
      [
        'Quelle est la longueur d’une piscine olympique, en mètres ?',
        ['Moins de 25', '25 à 49', '50 à 74', '75 ou plus'],
        2,
      ],
      [
        'En quelle année ont eu lieu les premiers Jeux olympiques modernes ?',
        ['Avant 1850', '1850 à 1899', '1900 à 1949', '1950 ou après'],
        1,
      ],
      [
        'Combien de points vaut une partie parfaite au bowling ?',
        ['Moins de 100', '100 à 199', '200 à 299', '300 ou plus'],
        3,
      ],
      [
        'À quelle hauteur se trouve un panier de basket, en centimètres ?',
        ['Moins de 250', '250 à 299', '300 à 349', '350 ou plus'],
        2,
      ],
    ],
    imagePrompt: 'Quel sport se cache derrière l’image ?',
    images: [
      ['🏀', 'Basket', 'Bowling', 'Tennis', 'Golf'],
      ['🎾', 'Tennis', 'Ping-pong', 'Golf', 'Basket'],
      ['🥊', 'Boxe', 'Escrime', 'Natation', 'Bowling'],
      ['⛳', 'Golf', 'Tennis', 'Escrime', 'Natation'],
    ],
  },
  {
    id: 9006,
    name: 'Météo et nature',
    items: ['Orage', 'Pluie', 'Vent', 'Vagues', 'Grêle', 'Cascade', 'Feu de bois', 'Neige'],
    choices: [
      [
        'Quel instrument mesure la pression atmosphérique ?',
        'Le baromètre',
        'Le thermomètre',
        'L’anémomètre',
        'Le pluviomètre',
      ],
      [
        'Quelle est la plus haute montagne du monde ?',
        'L’Everest',
        'Le K2',
        'Le mont Blanc',
        'Le Kilimandjaro',
      ],
      [
        'Quel est le plus long fleuve de France ?',
        'La Loire',
        'La Seine',
        'Le Rhône',
        'La Garonne',
      ],
      [
        'Quel bruit accompagne l’éclair lors d’un orage ?',
        'Le tonnerre',
        'Le mistral',
        'Le ressac',
        'Le grésil',
      ],
      [
        'Quel gaz les plantes absorbent-elles pour la photosynthèse ?',
        'Le dioxyde de carbone',
        'L’hélium',
        'L’azote',
        'L’hydrogène',
      ],
      [
        'Quel instrument mesure la vitesse du vent ?',
        'L’anémomètre',
        'Le baromètre',
        'L’hygromètre',
        'Le sismographe',
      ],
    ],
    trueFalse: [
      ['Un arc-en-ciel naît de la lumière du soleil dans des gouttes de pluie.', true],
      ['La foudre ne tombe jamais deux fois au même endroit.', false],
      ['À pression normale, l’eau gèle à 0 °C.', true],
      ['Le Sahara est le plus grand désert chaud du monde.', true],
      ['Le mont Blanc est plus haut que l’Everest.', false],
      ['Lors d’un orage, on entend le tonnerre avant de voir l’éclair.', false],
    ],
    estimates: [
      [
        'Quelle est l’altitude du mont Everest, en mètres ?',
        ['Moins de 6 000', '6 000 à 7 999', '8 000 à 9 999', '10 000 ou plus'],
        2,
      ],
      [
        'Combien de kilomètres mesure la Loire ?',
        ['Moins de 500', '500 à 899', '900 à 1 199', '1 200 ou plus'],
        2,
      ],
      [
        'À partir de quelle vitesse de vent parle-t-on d’ouragan (force 12), en km/h ?',
        ['Moins de 60', '60 à 99', '100 à 149', '150 ou plus'],
        2,
      ],
      [
        'Combien de kilomètres mesure la circonférence de la Terre à l’équateur ?',
        ['Moins de 10 000', '10 000 à 29 999', '30 000 à 49 999', '50 000 ou plus'],
        2,
      ],
    ],
    imagePrompt: 'Quel phénomène se cache derrière l’image ?',
    images: [
      ['⛈️', 'Orage', 'Grêle', 'Vent', 'Pluie'],
      ['🌊', 'Vagues', 'Cascade', 'Pluie', 'Vent'],
      ['🔥', 'Feu de bois', 'Orage', 'Cascade', 'Neige'],
      ['❄️', 'Neige', 'Grêle', 'Pluie', 'Vagues'],
    ],
  },
]

const AUDIO_QUESTIONS_PER_THEME = 10

/**
 * Plages d'ids par type, relatives à `theme.id * 100` : 0-9 audio, 10-19 QCM,
 * 20-29 vrai/faux, 30-39 estimation, 40-49 image. Les réponses valent
 * `questionId * 10 + position` : uniques tant qu'une question en a moins de 10.
 */
const ID_OFFSET = { audio: 0, choice: 10, trueFalse: 20, estimate: 30, image: 40 } as const

function buildAnswers(questionId: number, texts: string[], correctIndex: number): EngineAnswer[] {
  return texts.map((text, position) => ({
    id: questionId * 10 + position,
    text,
    isCorrect: position === correctIndex,
  }))
}

function buildAudioQuestion(theme: DemoTheme, index: number): EngineQuestion {
  const id = theme.id * 100 + ID_OFFSET.audio + index
  const count = theme.items.length
  // 4 propositions consécutives (en boucle) ; la première est la bonne, le moteur mélange.
  const options = [0, 1, 2, 3].map((offset) => theme.items[(index + offset) % count] ?? '')

  return {
    id,
    text: `${theme.name} — extrait ${index + 1}`,
    mediaType: QUESTION_MEDIA_TYPE_AUDIO,
    mediaUrl: `demo://${theme.id}/${index + 1}`,
    mediaStartMs: 0,
    kind: QUESTION_KIND_QCM,
    answers: buildAnswers(id, options, 0),
  }
}

function buildTextQuestion(
  id: number,
  text: string,
  answers: string[],
  correctIndex: number,
  kind: QuestionKind
): EngineQuestion {
  return {
    id,
    text,
    mediaType: QUESTION_MEDIA_TYPE_NONE,
    mediaUrl: null,
    mediaStartMs: 0,
    kind,
    answers: buildAnswers(id, answers, correctIndex),
  }
}

/** Image SVG autonome (pas de réseau) : fond dégradé sombre et grand emoji centré. */
export function buildEmojiImageUrl(emoji: string): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0" stop-color="#1b1f3b"/><stop offset="1" stop-color="#06070f"/>',
    '</linearGradient></defs>',
    '<rect width="400" height="300" fill="url(#g)"/>',
    `<text x="200" y="160" font-size="180" text-anchor="middle" dominant-baseline="central">${emoji}</text>`,
    '</svg>',
  ].join('')

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildThemeQuestions(theme: DemoTheme): EngineQuestion[] {
  const base = theme.id * 100

  const audio = Array.from({ length: AUDIO_QUESTIONS_PER_THEME }, (_item, index) =>
    buildAudioQuestion(theme, index)
  )
  const choices = theme.choices.map(([text, ...answers], index) =>
    buildTextQuestion(base + ID_OFFSET.choice + index, text, answers, 0, QUESTION_KIND_QCM)
  )
  const trueFalse = theme.trueFalse.map(([statement, isTrue], index) =>
    buildTextQuestion(
      base + ID_OFFSET.trueFalse + index,
      statement,
      ['Vrai', 'Faux'],
      isTrue ? 0 : 1,
      QUESTION_KIND_TRUE_FALSE
    )
  )
  const estimates = theme.estimates.map(([text, ranges, correctIndex], index) =>
    buildTextQuestion(
      base + ID_OFFSET.estimate + index,
      text,
      ranges,
      correctIndex,
      QUESTION_KIND_ESTIMATE
    )
  )
  const images = theme.images.map(([emoji, ...answers], index): EngineQuestion => {
    const id = base + ID_OFFSET.image + index
    return {
      id,
      text: theme.imagePrompt,
      mediaType: QUESTION_MEDIA_TYPE_IMAGE,
      mediaUrl: buildEmojiImageUrl(emoji),
      mediaStartMs: 0,
      kind: QUESTION_KIND_QCM,
      answers: buildAnswers(id, answers, 0),
    }
  })

  return [...audio, ...choices, ...trueFalse, ...estimates, ...images]
}

export function getDemoThemes(): EngineTheme[] {
  return DEMO_THEMES.map((theme) => ({
    id: theme.id,
    name: theme.name,
    questions: buildThemeQuestions(theme),
  }))
}
