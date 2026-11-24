import { describe, expect, it } from 'vitest'

import {
  buildCreateGamePayload,
  canRemoveGameParticipant,
  createDefaultGameFormValues,
  hasGameFormErrors,
  setGameOpenJoin,
  setGameScheduled,
  validateGameForm,
} from '@/utils/game/form'

function openJoinForm() {
  const form = createDefaultGameFormValues()

  form.roomId = '10'
  setGameOpenJoin(form, true)

  return form
}

describe('setGameOpenJoin', () => {
  it('is off by default', () => {
    expect(createDefaultGameFormValues().openJoin).toBe(false)
  })

  it('drops the blank starting participant, since players sign up afterwards', () => {
    const form = createDefaultGameFormValues()

    setGameOpenJoin(form, true)

    expect(form.openJoin).toBe(true)
    expect(form.participants).toEqual([])
  })

  it('keeps a participant the operator has filled in', () => {
    const form = createDefaultGameFormValues()
    form.participants[0].displayName = 'Les Quizzeurs'

    setGameOpenJoin(form, true)

    expect(form.participants).toHaveLength(1)
  })

  it('puts one participant back when switched off again', () => {
    const form = openJoinForm()

    setGameOpenJoin(form, false)

    expect(form.openJoin).toBe(false)
    expect(form.participants).toHaveLength(1)
  })

  it('does not put a participant back on a scheduled session, which may have none', () => {
    const form = createDefaultGameFormValues()
    setGameScheduled(form, true)

    setGameOpenJoin(form, false)

    expect(form.participants).toEqual([])
  })

  it('does not put a participant back when a game open to sign-ups stops being scheduled', () => {
    const form = openJoinForm()
    setGameScheduled(form, true)

    setGameScheduled(form, false)

    expect(form.participants).toEqual([])
  })

  it('lets the game have no participant, never an immediate game without sign-ups', () => {
    expect(canRemoveGameParticipant([], true)).toBe(false)
    expect(validateGameForm(openJoinForm(), 4).participants).toEqual([])
    expect(hasGameFormErrors(validateGameForm(openJoinForm(), 4))).toBe(false)
  })
})

describe('buildCreateGamePayload with sign-ups by QR code', () => {
  it('sends openJoin with no participant', () => {
    const payload = buildCreateGamePayload(openJoinForm())

    expect(payload.openJoin).toBe(true)
    expect(payload.participants).toEqual([])
  })

  it('omits openJoin when the switch is off', () => {
    expect(buildCreateGamePayload(createDefaultGameFormValues())).not.toHaveProperty('openJoin')
  })

  it('omits openJoin for a scheduled session, where the server ignores it', () => {
    const form = openJoinForm()
    form.scheduledDate = '2026-12-05'
    form.scheduledTime = '14:00'
    setGameScheduled(form, true)

    const payload = buildCreateGamePayload(form)

    expect(payload.scheduledAt).toBeDefined()
    expect(payload).not.toHaveProperty('openJoin')
  })
})
