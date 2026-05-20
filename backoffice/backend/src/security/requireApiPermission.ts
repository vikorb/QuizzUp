import type { FastifyReply, FastifyRequest } from 'fastify'

import type { ApiAction, ApiResource } from './permissions'
import { canRoleAccessApi } from './permissions'

export function requireApiPermission(
  req: FastifyRequest,
  reply: FastifyReply,
  resource: ApiResource,
  action: ApiAction,
): boolean {
  const role = String(req.user.role)

  if (!canRoleAccessApi(role, resource, action)) {
    reply.code(403).send({ error: 'forbidden' })
    return false
  }

  return true
}
