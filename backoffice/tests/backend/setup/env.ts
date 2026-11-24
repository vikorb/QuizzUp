import { existsSync } from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

const envPath = path.resolve(process.cwd(), 'backend/.env')

// .env n'est pas versionné : repli sur .env.example (clone neuf, CI)
dotenv.config({
  path: existsSync(envPath) ? envPath : path.resolve(process.cwd(), 'backend/.env.example'),
})

process.env.API_PORT ||= '3001'
process.env.CORS_ORIGIN ||= 'http://localhost:4173'
process.env.JWT_EXPIRES_IN ||= '2h'
// Un backend/.env local sans cette variable fermerait la console : les tests de superadmin en
// 127.0.0.1 doivent passer quand même.
process.env.CONSOLE_ALLOWED_CIDRS ||= '127.0.0.1/32 ::1/128'
// Clé de TEST des secrets TOTP (32 octets en base64), sans valeur hors des tests ; `||=` comme ci-dessus.
process.env.TOTP_ENCRYPTION_KEY ||= 'VEVTVC1PTkxZLW5vdC1hLXNlY3JldC1rZXktMDAwMDA='
