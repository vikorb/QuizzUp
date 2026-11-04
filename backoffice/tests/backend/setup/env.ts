import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'

const envPath = path.resolve(process.cwd(), 'backend/.env')

// .env n'est pas versionné : repli sur .env.example (clone neuf, CI)
dotenv.config({
  path: existsSync(envPath) ? envPath : path.resolve(process.cwd(), 'backend/.env.example'),
})

process.env.API_PORT ||= '3001'
process.env.CORS_ORIGIN ||= 'http://localhost:4173'
process.env.JWT_EXPIRES_IN ||= '2h'
