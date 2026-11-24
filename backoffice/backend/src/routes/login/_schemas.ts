import { TOTP_CODE_LENGTH } from '@quizzup/shared'
import { z } from 'zod'

// Une application affiche souvent « 123 456 » : les espaces sont retirés avant le contrôle.
const withoutSpaces = z.string().transform((value) => value.replace(/\s/g, ''))

/** Code de deuxième facteur : code TOTP, sinon code de secours (`xxxxx-xxxxx`). */
export const secondFactorCodeSchema = withoutSpaces.pipe(z.string().min(1).max(32))

export const challengeSchema = z.object({
  challengeToken: z.string().min(1).max(2048),
})

export const challengeCodeSchema = challengeSchema.extend({
  code: secondFactorCodeSchema,
})

export const confirmEnrollmentSchema = challengeSchema.extend({
  code: withoutSpaces.pipe(
    z
      .string()
      .length(TOTP_CODE_LENGTH)
      .regex(/^[0-9]+$/)
  ),
})

export const codeSchema = z.object({ code: secondFactorCodeSchema })
