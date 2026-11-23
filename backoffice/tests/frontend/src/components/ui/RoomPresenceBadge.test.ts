import { createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { ROOM_PRESENCE, type RoomLive } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import RoomPresenceBadge from '@/components/ui/RoomPresenceBadge.vue'

const NOW = Date.parse('2026-11-23T10:05:00.000Z')

function mountBadge(room: RoomLive | null, uncertain = false) {
  return mountWithFrontendMocks(RoomPresenceBadge, { props: { room, uncertain, now: NOW } })
}

describe('components/ui/RoomPresenceBadge.vue', () => {
  it.each([
    [ROOM_PRESENCE.ONLINE, 'online', 'live.presence.online'],
    [ROOM_PRESENCE.IN_GAME, 'in_game', 'live.presence.in_game'],
    [ROOM_PRESENCE.OFFLINE, 'offline', 'live.presence.offline'],
  ])('shows the %s presence as text and not only as a colour', (presence, kind, label) => {
    const wrapper = mountBadge(createRoomLive({ presence }))

    expect(wrapper.get('[data-test="room-presence"]').attributes('data-presence')).toBe(kind)
    expect(wrapper.text()).toContain(label)
    // Le point est décoratif : le texte porte le sens.
    expect(wrapper.get('.room-presence__dot').attributes('aria-hidden')).toBe('true')
  })

  it('says "seen ago" only for an offline room', () => {
    expect(mountBadge(createRoomLive()).find('[data-test="room-presence-seen"]').exists()).toBe(
      false
    )
    expect(
      mountBadge(createRoomLive({ presence: ROOM_PRESENCE.IN_GAME }))
        .find('[data-test="room-presence-seen"]')
        .exists()
    ).toBe(false)

    const offline = mountBadge(createRoomLive({ presence: ROOM_PRESENCE.OFFLINE }))

    expect(offline.get('[data-test="room-presence-seen"]').text()).toBe('live.presence.seenAgo')
  })

  it('says "never seen" for an offline room that never reported', () => {
    const wrapper = mountBadge(
      createRoomLive({ presence: ROOM_PRESENCE.OFFLINE, lastSeenAt: null })
    )

    expect(wrapper.get('[data-test="room-presence-seen"]').text()).toBe('live.presence.neverSeen')
  })

  it('claims nothing while the stream is cut, whatever the last known presence', () => {
    for (const presence of Object.values(ROOM_PRESENCE)) {
      const wrapper = mountBadge(createRoomLive({ presence }), true)

      expect(wrapper.get('[data-test="room-presence"]').attributes('data-presence')).toBe('unknown')
      expect(wrapper.text()).toContain('live.presence.unknown')
      expect(wrapper.text()).not.toContain('live.presence.online')
      expect(wrapper.text()).not.toContain('live.presence.seenAgo')
    }
  })

  it('shows an unknown state for a room missing from the stream', () => {
    const wrapper = mountBadge(null)

    expect(wrapper.get('[data-test="room-presence"]').attributes('data-presence')).toBe('unknown')
    expect(wrapper.text()).toContain('live.presence.unknown')
  })
})
