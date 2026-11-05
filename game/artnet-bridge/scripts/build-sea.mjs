// Construit l'exécutable unique du pont (Node Single Executable Applications, procédure Node 22) :
// esbuild (un seul fichier CommonJS) -> blob SEA -> copie du binaire `node` -> injection postject.
// Produit `dist-sea/quizzup-artnet-bridge[.exe]` pour la plateforme courante (Windows x64 en CI,
// Linux en local pour tester). Pas de signature de code : voir le README.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { inject } from 'postject'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-sea')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const exe = join(
  out,
  process.platform === 'win32' ? 'quizzup-artnet-bridge.exe' : 'quizzup-artnet-bridge'
)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await build({
  entryPoints: [join(root, 'src/main.ts')],
  outfile: join(out, 'bridge.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  define: { BUNDLED_VERSION: JSON.stringify(version) },
  logLevel: 'warning',
})

writeFileSync(
  join(out, 'sea-config.json'),
  JSON.stringify({
    main: join(out, 'bridge.cjs'),
    output: join(out, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
  })
)
const prep = spawnSync(
  process.execPath,
  ['--experimental-sea-config', join(out, 'sea-config.json')],
  { stdio: 'inherit' }
)
if (prep.status !== 0) {
  throw new Error('Génération du blob SEA en échec')
}

// Le binaire `node` de Windows est signé par Node.js ; l'injection invalide cette signature, ce
// que postject signale par un avertissement sans conséquence (doc Node : « ignore any warning »).
copyFileSync(process.execPath, exe)
await inject(exe, 'NODE_SEA_BLOB', readFileSync(join(out, 'sea-prep.blob')), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
})

rmSync(join(out, 'bridge.cjs'))
rmSync(join(out, 'sea-config.json'))
rmSync(join(out, 'sea-prep.blob'))
console.log(`Exécutable prêt : ${exe} (version ${version})`)
