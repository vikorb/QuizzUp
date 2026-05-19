import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({
  path: path.resolve(process.cwd(), 'backend/.env'),
})

process.env.API_PORT ||= '3001'
process.env.CORS_ORIGIN ||= 'http://localhost:4173'
process.env.JWT_EXPIRES_IN ||= '2h'
