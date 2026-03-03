require('dotenv').config()
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const jwt = require('@fastify/jwt')
const bcrypt = require('bcryptjs')
const { z } = require('zod')
const db = require('./db')

const app = Fastify({ logger: true })

app.register(cors, {
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
})

app.register(jwt, {
  secret: process.env.JWT_SECRET,
})

app.get('/health', async () => ({ status: 'ok' }))

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})

app.post('/auth/login', async (req, reply) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return reply.code(400).send(parsed.error.flatten())

  const { identifier, password } = parsed.data
  const isEmail = identifier.includes('@')

  const query = db('admins')
    .select(
      'id',
      'company_id',
      'role',
      'firstname',
      'lastname',
      'username',
      'email',
      'mdp_hash',
      'status',
      'deleted_at'
    )
    .where('status', 1)
    .whereNull('deleted_at')

  if (isEmail) query.andWhereRaw('lower(email) = lower(?)', [identifier])
  else query.andWhereRaw('lower(username) = lower(?)', [identifier])

  const admin = await query.first()
  if (!admin) return reply.code(401).send({ error: 'invalid_credentials' })

  const ok = await bcrypt.compare(password, admin.mdp_hash)
  if (!ok) return reply.code(401).send({ error: 'invalid_credentials' })

  const token = app.jwt.sign(
    { sub: String(admin.id), company_id: admin.company_id, role: admin.role },
    { expiresIn: '12h' }
  )

  return {
    token,
    admin: {
      id: admin.id,
      company_id: admin.company_id,
      role: admin.role,
      firstname: admin.firstname,
      lastname: admin.lastname,
      username: admin.username,
      email: admin.email,
    },
  }
})

app.get('/me', { preHandler: [async (req) => req.jwtVerify()] }, async (req, reply) => {
  const adminId = Number(req.user.sub)
  const admin = await db('admins')
    .select(
      'id',
      'company_id',
      'role',
      'firstname',
      'lastname',
      'username',
      'email',
      'status',
      'created_at',
      'updated_at'
    )
    .where({ id: adminId })
    .first()

  if (!admin) return reply.code(404).send({ error: 'not_found' })
  return { admin }
})

const port = Number(process.env.API_PORT || 3001)
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
