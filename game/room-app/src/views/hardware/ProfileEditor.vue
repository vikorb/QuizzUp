<template>
  <section class="editor" data-test="profile-editor">
    <h3 class="hw-panel__subtitle">{{ $t('hardware.profiles.title') }}</h3>
    <p class="hw-hint">{{ $t('hardware.profiles.hint') }}</p>

    <div class="row">
      <select v-model="baseId" :aria-label="$t('hardware.profiles.base')" data-test="profile-base">
        <option v-for="profile in GENERIC_PROFILES" :key="profile.id" :value="profile.id">
          {{ profile.name }}
        </option>
      </select>
      <UiButton data-test="profile-copy" @click="copyProfile">
        {{ $t('hardware.profiles.copy') }}
      </UiButton>
    </div>

    <article
      v-for="profile in profiles"
      :key="profile.id"
      class="profile"
      data-test="profile"
      :data-profile="profile.id"
    >
      <header class="row">
        <input v-model="profile.name" :aria-label="$t('hardware.profiles.name')" />
        <code>{{ profile.id }}</code>
        <UiButton variant="danger" @click="removeProfile(profile.id)">
          {{ $t('hardware.profiles.removeProfile') }}
        </UiButton>
      </header>

      <ol class="channels">
        <li v-for="(channel, index) in profile.channels" :key="index" class="channel">
          <span class="channel__n">{{ index + 1 }}</span>
          <select
            :value="channel.role"
            :aria-label="$t('hardware.profiles.role')"
            @change="setRole(profile, index, $event)"
          >
            <option v-for="role in CHANNEL_ROLES" :key="role" :value="role">{{ role }}</option>
          </select>

          <template v-if="channel.role === 'colorWheel'">
            <div class="slots" data-test="slots">
              <div
                v-for="(slot, slotIndex) in channel.slots"
                :key="slotIndex"
                class="row"
                data-test="slot"
              >
                <input
                  type="number"
                  min="0"
                  max="255"
                  :value="slot.value"
                  :aria-label="$t('hardware.profiles.slotValue')"
                  data-test="slot-value"
                  @input="slot.value = byte($event)"
                />
                <input
                  type="color"
                  :value="toHex(slot.rgb)"
                  :aria-label="$t('hardware.profiles.slotColor')"
                  data-test="slot-color"
                  @input="slot.rgb = toRgb(($event.target as HTMLInputElement).value)"
                />
                <UiButton
                  :aria-label="$t('hardware.profiles.removeSlot')"
                  @click="channel.slots?.splice(slotIndex, 1)"
                >
                  ×
                </UiButton>
              </div>
              <UiButton data-test="slot-add" @click="addSlot(profile, index)">
                {{ $t('hardware.profiles.addSlot') }}
              </UiButton>
            </div>
          </template>

          <label v-else-if="channel.role === 'shutter'" class="row">
            {{ $t('hardware.profiles.open') }}
            <input
              type="number"
              min="0"
              max="255"
              :value="channel.open ?? 255"
              @input="channel.open = byte($event)"
            />
            {{ $t('hardware.profiles.closed') }}
            <input
              type="number"
              min="0"
              max="255"
              :value="channel.closed"
              :placeholder="$t('hardware.profiles.never')"
              @input="setClosed(profile, index, $event)"
            />
          </label>

          <label v-else-if="channel.role === 'gobo'" class="row">
            {{ $t('hardware.profiles.openGobo') }}
            <input
              type="number"
              min="0"
              max="255"
              :value="channel.open ?? 0"
              @input="channel.open = byte($event)"
            />
          </label>

          <label v-else-if="channel.role === 'speed' || channel.role === 'fixed'" class="row">
            {{ $t('hardware.profiles.value') }}
            <input
              type="number"
              min="0"
              max="255"
              :value="channel.value ?? 0"
              @input="channel.value = byte($event)"
            />
          </label>

          <UiButton
            :aria-label="$t('hardware.profiles.removeChannel')"
            @click="profile.channels.splice(index, 1)"
          >
            ×
          </UiButton>
        </li>
      </ol>

      <div class="row">
        <select v-model="newRole" :aria-label="$t('hardware.profiles.role')" data-test="new-role">
          <option v-for="role in CHANNEL_ROLES" :key="role" :value="role">{{ role }}</option>
        </select>
        <UiButton data-test="channel-add" @click="addChannel(profile)">
          {{ $t('hardware.profiles.addChannel') }}
        </UiButton>
      </div>
    </article>

    <template v-if="movable.length > 0">
      <h4>{{ $t('hardware.profiles.fixtures') }}</h4>
      <div v-for="fixture in movable" :key="fixture.id" class="row" data-test="fixture-invert">
        <strong>{{ fixture.name }}</strong>
        <label>
          <input v-model="fixture.invertPan" type="checkbox" data-test="invert-pan" />
          {{ $t('hardware.profiles.invertPan') }}
        </label>
        <label>
          <input v-model="fixture.invertTilt" type="checkbox" data-test="invert-tilt" />
          {{ $t('hardware.profiles.invertTilt') }}
        </label>
      </div>
    </template>

    <div class="hw-actions">
      <UiButton variant="primary" :disabled="saving" data-test="profiles-save" @click="save">
        {{ $t('hardware.advanced.save') }}
      </UiButton>
      <span v-if="saved" class="hw-ok" role="status">{{ $t('hardware.advanced.saved') }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ChannelRole, ChannelSpec, FixtureConfig, FixtureProfile } from '@quizzup/hardware'
import {
  CHANNEL_ROLES,
  defaultColorWheelSlots,
  findProfile,
  GENERIC_PROFILES,
} from '@quizzup/hardware'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import { saveRoomHardwareConfig, useRoomHardware } from '@/hardware/roomHardware'

const { hardware } = useRoomHardware()
const { t } = useI18n()

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const profiles = ref<FixtureProfile[]>([])
const fixtures = ref<FixtureConfig[]>([])
const baseId = ref(GENERIC_PROFILES[0]?.id ?? '')
const newRole = ref<ChannelRole>('colorWheel')
const saving = ref(false)
const saved = ref(false)

function load(): void {
  profiles.value = clone(hardware.value.config.lighting.customProfiles)
  fixtures.value = clone(hardware.value.config.lighting.fixtures)
}
load()
watch(() => hardware.value.config, load)

/** Appareils avec pan et tilt : ce sont les seuls à pouvoir être inversés. */
const movable = computed(() =>
  fixtures.value.filter((fixture) =>
    findProfile(fixture.profileId, profiles.value)?.channels.some(
      (channel) => channel.role === 'pan'
    )
  )
)

/** Entier 0-255 saisi (vide ou invalide = 0). */
function byte(event: Event): number {
  const value = Math.round(Number((event.target as HTMLInputElement).value))
  return Number.isFinite(value) ? Math.min(255, Math.max(0, value)) : 0
}

/** Remplace un canal (les fonctions n'écrivent pas dans leurs paramètres). */
const replaceChannel = (profile: FixtureProfile, index: number, channel: ChannelSpec) =>
  profile.channels.splice(index, 1, channel)

function setClosed(profile: FixtureProfile, index: number, event: Event): void {
  const { closed: _previous, ...channel } = profile.channels[index] as ChannelSpec
  const empty = (event.target as HTMLInputElement).value === ''
  replaceChannel(profile, index, empty ? channel : { ...channel, closed: byte(event) })
}

const toHex = (rgb: readonly number[]) =>
  `#${rgb.map((part) => part.toString(16).padStart(2, '0')).join('')}`

function toRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** Canal neuf d'un rôle, avec ses réglages par défaut. */
function makeChannel(role: ChannelRole): ChannelSpec {
  if (role === 'colorWheel') {
    return { role, slots: defaultColorWheelSlots() }
  }
  if (role === 'shutter') {
    return { role, open: 255 }
  }
  return role === 'gobo' ? { role, open: 0 } : { role }
}

/** Changer de rôle repart d'un canal propre : les réglages de l'ancien rôle n'ont plus de sens. */
function setRole(profile: FixtureProfile, index: number, event: Event): void {
  replaceChannel(
    profile,
    index,
    makeChannel((event.target as HTMLSelectElement).value as ChannelRole)
  )
}

function addChannel(profile: FixtureProfile): void {
  profile.channels.push(makeChannel(newRole.value))
}

function addSlot(profile: FixtureProfile, index: number): void {
  const channel = profile.channels[index] as ChannelSpec
  const slots = channel.slots ?? []
  const next = Math.min(255, Math.max(-10, ...slots.map((slot) => slot.value)) + 10)
  replaceChannel(profile, index, {
    ...channel,
    slots: [...slots, { value: next, rgb: [255, 255, 255] }],
  })
}

/** Copie un profil générique en profil sur mesure : seul moyen de modifier ses réglages. */
function copyProfile(): void {
  const base = findProfile(baseId.value)
  if (!base) {
    return
  }
  let id = `custom-${base.id}`
  for (let copy = 2; profiles.value.some((profile) => profile.id === id); copy += 1) {
    id = `custom-${base.id}-${copy}`
  }
  profiles.value.push({
    ...clone(base),
    id,
    name: `${base.name} ${t('hardware.profiles.copySuffix')}`,
  })
}

function removeProfile(id: string): void {
  profiles.value = profiles.value.filter((profile) => profile.id !== id)
}

async function save(): Promise<void> {
  saved.value = false
  saving.value = true
  try {
    const config = hardware.value.config
    await saveRoomHardwareConfig({
      ...config,
      lighting: { ...config.lighting, customProfiles: profiles.value, fixtures: fixtures.value },
    })
    saved.value = true
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.editor {
  display: grid;
  gap: 12px;
  color: var(--text-1);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.profile {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-ui);
  border-radius: 14px;
}

.channels {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.channel {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.channel__n {
  min-width: 2ch;
  font-weight: 700;
}

.slots {
  display: grid;
  gap: 6px;
}

input,
select {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-ui);
  background: var(--bg-field);
  color: var(--text-0);
}

input[type='number'] {
  width: 5em;
}

input[type='checkbox'] {
  width: auto;
}
</style>
