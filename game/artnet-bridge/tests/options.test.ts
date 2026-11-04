import { BLACKOUT_MS, SILENCE_TIMEOUT_MS } from '@bridge/bridge'
import {
  DEFAULT_PORT,
  HELP_TEXT,
  ORIGINS_ENV,
  parseCliArgs,
  parseConfigFile,
} from '@bridge/options'

const BASE = ['--target', '192.168.1.50', '--origin', 'https://salle.quizzup.fr']

const run = (argv: string[], deps: Parameters<typeof parseCliArgs>[1] = {}) => {
  const command = parseCliArgs(argv, deps)
  if (command.kind !== 'run') {
    throw new Error(`commande ${command.kind}`)
  }
  return command.options
}

describe('ligne de commande', () => {
  it('reprend l’exemple du README', () => {
    const options = run([
      '--target',
      '192.168.1.50',
      '--universe',
      '0',
      '--port',
      '7654',
      '--origin',
      'https://salle.quizzup.fr',
    ])
    expect(options).toMatchObject({
      target: '192.168.1.50',
      port: 7654,
      artnetPort: 6454,
      origins: ['https://salle.quizzup.fr'],
      silenceTimeoutMs: SILENCE_TIMEOUT_MS,
      blackoutMs: BLACKOUT_MS,
    })
    expect(options.bind).toBeUndefined()
    const direct = options.plan.outputs.filter((output) => !output.auto)
    expect(direct).toHaveLength(1)
    expect(direct[0]!.address).toEqual({ net: 0, subnet: 0, universe: 0 })
    // Sans --map : les univers internes 1 à 15 sont recopiés vers les univers Art-Net suivants.
    expect(options.plan.outputs).toHaveLength(16)
  })

  it('a des valeurs par défaut', () => {
    const options = run(BASE)
    expect(options.port).toBe(DEFAULT_PORT)
    expect(options.mappings).toEqual([
      { from: 1, to: 512, output: { net: 0, subnet: 0, universe: 0 }, start: 1 },
    ])
  })

  it('affiche l’aide et la version', () => {
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' })
    expect(parseCliArgs(['-h', '--target', 'x'])).toEqual({ kind: 'help' })
    expect(parseCliArgs(['-v'])).toEqual({ kind: 'version' })
    expect(HELP_TEXT).toContain('--map <plage>')
    expect(HELP_TEXT).toContain('Utilisation')
  })

  it('lit les mappages répétés, l’univers NET.SUB.UNI et les autres réglages', () => {
    const options = run([
      ...BASE,
      '--map',
      '1-72:0.0.1@1',
      '--map',
      '128-148:0.0.2@1',
      '--bind',
      '192.168.200.1',
      '--artnet-port',
      '6455',
      '--timeout',
      '1500',
      '--blackout',
      '5000',
    ])
    expect(options.plan.outputs.map((output) => output.key)).toEqual([1, 2])
    expect(options).toMatchObject({
      bind: '192.168.200.1',
      artnetPort: 6455,
      silenceTimeoutMs: 1500,
      blackoutMs: 5000,
    })
    expect(run([...BASE, '--universe', '0.1.2']).plan.outputs[0]!.key).toBe(0x12)
  })

  it('accepte plusieurs origines, séparées ou répétées, et les normalise', () => {
    const options = run([
      '--target',
      '10.0.0.255',
      '--origin',
      'https://salle.quizzup.fr/,http://localhost:4174',
      '--origin',
      'HTTPS://Salle.QuizzUp.fr',
    ])
    expect(options.origins).toEqual(['https://salle.quizzup.fr', 'http://localhost:4174'])
  })

  it('lit les origines dans l’environnement', () => {
    const options = run(['--target', '10.0.0.5'], {
      env: { [ORIGINS_ENV]: 'https://a.example, https://b.example' },
    })
    expect(options.origins).toEqual(['https://a.example', 'https://b.example'])
  })

  it('explique chaque erreur', () => {
    const cases: [string[], string][] = [
      [['--origin', 'https://a.fr'], '--target est obligatoire'],
      [['--target', '192.168.1.300', '--origin', 'https://a.fr'], "n'est pas une adresse IPv4"],
      [['--target', '10.0.0.1'], '--origin est obligatoire'],
      [['--target', '10.0.0.1', '--origin', 'ftp://a.fr'], "n'est pas une origine http(s)"],
      [['--target', '10.0.0.1', '--origin', 'pas une url'], "n'est pas une origine"],
      [[...BASE, '--port', '0'], "--port : « 0 » n'est pas un entier entre 1 et 65535"],
      [[...BASE, '--port', 'abc'], '--port'],
      [[...BASE, '--port', ''], '--port'],
      [[...BASE, '--timeout', '50'], '--timeout'],
      [[...BASE, '--blackout', '100000'], '--blackout'],
      [[...BASE, '--universe', '0.0.16'], '--universe : « 0.0.16 » invalide'],
      [[...BASE, '--universe', '1', '--map', '1-2:0.0.1@1'], 'incompatibles'],
      [[...BASE, '--map', '1-72:0.0.1@500'], 'déborde'],
      [[...BASE, '--map', 'n’importe quoi'], 'Mappage illisible'],
      [[...BASE, '--bind', 'localhost'], '--bind'],
      [[...BASE, '--inconnue'], 'Option inconnue : --inconnue'],
      [[...BASE, '--target'], 'Valeur manquante pour --target'],
      [[...BASE, 'positionnel'], 'Argument inattendu : positionnel'],
    ]
    for (const [argv, message] of cases) {
      expect(() => parseCliArgs(argv), argv.join(' ')).toThrow(message)
    }
  })
})

describe('fichier de configuration', () => {
  const salle = JSON.stringify({
    target: '192.168.200.187',
    bind: '192.168.200.1',
    origins: ['https://salle.quizzup.fr'],
    maps: ['1-72:0.0.1@1', { from: 128, to: 148, output: '0.0.2', start: 1 }],
    port: 7654,
    artnetPort: 6454,
    timeoutMs: 1000,
    blackoutMs: 3000,
  })

  it('lit tous les réglages', () => {
    const options = run(['--config', 'salle.json'], { readFile: () => salle })
    expect(options).toMatchObject({
      target: '192.168.200.187',
      bind: '192.168.200.1',
      origins: ['https://salle.quizzup.fr'],
      port: 7654,
    })
    expect(options.plan.outputs.map((output) => output.key)).toEqual([1, 2])
  })

  it('laisse la ligne de commande et l’environnement prioritaires', () => {
    const options = run(
      ['--config', 'salle.json', '--target', '192.168.200.255', '--map', '1-10:0.0.5@1'],
      { readFile: () => salle, env: { [ORIGINS_ENV]: 'http://localhost:4174' } }
    )
    expect(options.target).toBe('192.168.200.255')
    expect(options.origins).toEqual(['http://localhost:4174'])
    expect(options.plan.outputs.map((output) => output.key)).toEqual([5])
  })

  it('lit un univers seul et une origine seule', () => {
    const options = run(['--config', 'c.json'], {
      readFile: () =>
        JSON.stringify({ target: '10.0.0.2', universe: '0.0.3', origins: 'https://a.fr' }),
    })
    expect(options.plan.outputs[0]!.key).toBe(3)
    expect(options.origins).toEqual(['https://a.fr'])
  })

  it('explique les fichiers invalides', () => {
    const read = (text: string) => () => text
    expect(() => parseCliArgs(['--config', 'c.json'])).toThrow('lecture de fichier indisponible')
    expect(() =>
      parseCliArgs(['--config', 'absent.json'], {
        readFile: () => {
          throw new Error('ENOENT')
        },
      })
    ).toThrow('--config absent.json : lecture impossible (ENOENT)')
    expect(() => parseCliArgs(['--config', 'c.json'], { readFile: read('{') })).toThrow(
      'JSON invalide'
    )
    expect(() => parseCliArgs(['--config', 'c.json'], { readFile: read('[]') })).toThrow(
      'un objet JSON est attendu'
    )
    expect(() => parseCliArgs(['--config', 'c.json'], { readFile: read('{"cible":1}') })).toThrow(
      'clé(s) inconnue(s) cible'
    )
    expect(() =>
      parseCliArgs(['--config', 'c.json'], {
        readFile: read('{"target":"10.0.0.1","origins":[1]}'),
      })
    ).toThrow('origins : liste de chaînes attendue')
    expect(() =>
      parseCliArgs(['--config', 'c.json', ...BASE], { readFile: read('{"maps":"1-2:0.0.1"}') })
    ).toThrow('maps : liste de mappages attendue')
    expect(() =>
      parseCliArgs(['--config', 'c.json', ...BASE], { readFile: read('{"maps":[{"from":1}]}') })
    ).toThrow('Mappage invalide')
  })

  it('valide directement un contenu', () => {
    expect(parseConfigFile('{"target":"1.2.3.4"}', 'x.json')).toEqual({ target: '1.2.3.4' })
    expect(() => parseConfigFile('null', 'x.json')).toThrow('un objet JSON est attendu')
  })
})
