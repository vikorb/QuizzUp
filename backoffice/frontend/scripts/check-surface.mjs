// Garantie des deux constructions (conception du lot 12, §3) : construit le frontend en mode
// `centre` puis `console`, et vérifie que le marqueur `data-surface` des écrans réservés à la
// console est absent de la construction du centre et présent dans celle de la console.
// Sans cette seconde condition, le contrôle ne pourrait jamais échouer.
//   node scripts/check-surface.mjs
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKER = 'data-surface'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteBin = path.join(
  path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin/vite.js'
)

// Dossier de sortie de chaque mode (voir vite.config.ts).
const surfaces = [
  { mode: 'centre', dir: 'dist', expectMarker: false },
  { mode: 'console', dir: 'dist-console', expectMarker: true },
]

function build(mode) {
  const result = spawnSync(process.execPath, [viteBin, 'build', '--mode', mode], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`check-surface : la construction « ${mode} » a échoué.`)
    process.exit(1)
  }
}

function filesWithMarker(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    if (readFileSync(file, 'utf8').includes(MARKER)) found.push(path.relative(root, file))
  }
  return found
}

let failed = false
for (const { mode, dir, expectMarker } of surfaces) {
  build(mode)
  const found = filesWithMarker(path.join(root, dir))
  if (expectMarker && found.length === 0) {
    console.error(`check-surface : « ${MARKER} » absent de ${dir} (construction ${mode}).`)
    failed = true
  } else if (!expectMarker && found.length > 0) {
    console.error(`check-surface : « ${MARKER} » trouvé dans la construction ${mode} :`)
    for (const file of found) console.error(`  ${file}`)
    failed = true
  } else {
    console.log(
      `check-surface : ${mode} OK (${MARKER} ${expectMarker ? `dans ${found.length} fichier(s)` : 'absent'}).`
    )
  }
}
process.exit(failed ? 1 : 0)
