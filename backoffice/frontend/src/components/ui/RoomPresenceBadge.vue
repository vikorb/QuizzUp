<template>
  <span class="room-presence" :data-presence="kind" data-test="room-presence">
    <span class="room-presence__dot" aria-hidden="true" />
    <span class="room-presence__label">{{ $t(getRoomPresenceLabelKey(kind)) }}</span>
    <span v-if="seenText" class="room-presence__seen" data-test="room-presence-seen">
      {{ seenText }}
    </span>
  </span>
</template>

<script setup lang="ts">
import type { RoomLive } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { formatSeenAgo, getRoomPresenceKind, getRoomPresenceLabelKey } from '@/utils/room/presence'

const props = defineProps<{
  /** État reçu du flux en direct ; `null` si la salle n'y figure pas. */
  room: RoomLive | null
  /** Flux coupé ou pas encore ouvert : la dernière présence connue n'est plus fiable. */
  uncertain: boolean
  /** Heure courante (ms), pour « vu il y a … ». */
  now: number
}>()

const { t, locale } = useI18n()

const kind = computed(() => getRoomPresenceKind(props.room, props.uncertain))

// Seule une salle annoncée hors ligne par un flux ouvert affiche sa dernière activité.
const seenText = computed(() => {
  if (kind.value !== 'offline' || !props.room) {
    return null
  }

  const ago = props.room.lastSeenAt
    ? formatSeenAgo(props.room.lastSeenAt, props.now, locale.value)
    : null

  return ago ? t('live.presence.seenAgo', { ago }) : t('live.presence.neverSeen')
})
</script>

<style scoped>
.room-presence {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  white-space: nowrap;
  color: var(--text-1);
}

.room-presence__label {
  font-weight: 700;
}

.room-presence__seen {
  color: var(--text-2);
}

/* La couleur de statut reste sur le point : le texte porte le sens. */
.room-presence__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-3);
}

.room-presence[data-presence='online'] .room-presence__dot {
  background: var(--ok);
}

.room-presence[data-presence='in_game'] .room-presence__dot {
  background: var(--edit);
}

.room-presence[data-presence='unknown'] .room-presence__dot {
  background: var(--warn);
}
</style>
