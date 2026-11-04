/* global __dirname */
const path = require('node:path')

// Les migrations Knex ne doivent pas être réécrites par `eslint --fix` (elles sont partagées et
// rejouées telles quelles) ; elles restent contrôlées par `npm run lint` et mises en forme par
// prettier, que `format:check` exige.
const MIGRATIONS_DIR = path.join(__dirname, 'backend', 'db', 'migrations') + path.sep

const eslintFix = (files) => {
  const targets = files.filter((file) => !file.startsWith(MIGRATIONS_DIR))

  return targets.length > 0
    ? [`eslint --fix ${targets.map((file) => JSON.stringify(file)).join(' ')}`]
    : []
}

module.exports = {
  '*.{js,cjs,mjs,ts,tsx,vue}': eslintFix,
  '*.{js,cjs,mjs,ts,tsx,vue,json,md,yml,yaml,css,scss,html}': ['prettier --write'],
}
