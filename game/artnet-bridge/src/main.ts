#!/usr/bin/env node
import { readFileSync } from 'node:fs'

import { runCli } from './cli.js'

// Sans `await` de premier niveau : l'exécutable (SEA) est un unique script CommonJS.
void runCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  env: process.env,
  readFile: (path) => readFileSync(path, 'utf8'),
  onShutdown: (handler) => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
      process.on(signal, handler)
    }
  },
}).then((exitCode) => {
  process.exitCode = exitCode
})
