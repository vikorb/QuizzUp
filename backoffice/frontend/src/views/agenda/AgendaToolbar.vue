<template>
  <BaseToolBar
    :title="$t('agenda.filters.title')"
    :collapsible="false"
    :show-reset="false"
    :show-primary="false"
  >
    <div class="agenda-toolbar">
      <SelectField
        v-if="showCompany"
        id="agenda-company"
        :model-value="companyId"
        :label="$t('agenda.filters.company')"
        :options="companyOptions"
        @update:model-value="$emit('update:companyId', $event)"
      />

      <SelectField
        id="agenda-room"
        :model-value="roomId"
        :label="$t('agenda.filters.room')"
        :options="roomOptions"
        :disabled="roomOptions.length === 0"
        @update:model-value="$emit('update:roomId', $event)"
      />

      <div class="agenda-date">
        <UiButton
          class="agenda-date__step"
          type="button"
          data-test="agenda-previous-day"
          :title="$t('agenda.filters.previousDay')"
          :aria-label="$t('agenda.filters.previousDay')"
          @click="$emit('shift', -1)"
        >
          <MdIcon :path="mdiChevronLeft" :size="20" />
        </UiButton>

        <FormField
          id="agenda-date"
          type="date"
          :model-value="date"
          :label="$t('agenda.filters.date')"
          @update:model-value="$emit('update:date', $event)"
        />

        <UiButton
          class="agenda-date__step"
          type="button"
          data-test="agenda-next-day"
          :title="$t('agenda.filters.nextDay')"
          :aria-label="$t('agenda.filters.nextDay')"
          @click="$emit('shift', 1)"
        >
          <MdIcon :path="mdiChevronRight" :size="20" />
        </UiButton>
      </div>

      <RoomPresenceBadge
        v-if="roomId"
        class="agenda-toolbar__presence"
        :room="presenceRoom"
        :uncertain="presenceUncertain"
        :now="now"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js'
import type { RoomLive } from '@quizzup/shared'

import BaseToolBar from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import RoomPresenceBadge from '@/components/ui/RoomPresenceBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { SelectFieldOption } from '@/types/form'

defineProps<{
  roomOptions: SelectFieldOption[]
  roomId: string
  /** Jour affiché, `YYYY-MM-DD` (jour du calendrier de la salle). */
  date: string
  showCompany: boolean
  companyId: string
  companyOptions: SelectFieldOption[]
  /** Présence de la salle choisie, reçue du flux en direct ; `null` si absente du flux. */
  presenceRoom: RoomLive | null
  presenceUncertain: boolean
  now: number
}>()

defineEmits<{
  (event: 'update:roomId', value: string): void
  (event: 'update:date', value: string): void
  (event: 'update:companyId', value: string): void
  (event: 'shift', days: number): void
}>()
</script>

<style scoped>
.agenda-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
  width: 100%;
}

.agenda-toolbar > :deep(.select-field) {
  flex: 1 1 200px;
  max-width: 280px;
}

.agenda-date {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.agenda-date__step.agenda-date__step {
  min-width: 48px;
  min-height: 48px;
  padding: 0;
}

.agenda-date :deep(.ff__control) {
  min-height: 48px;
  font-variant-numeric: tabular-nums;
  color-scheme: dark;
}

.agenda-toolbar__presence {
  align-self: center;
  min-height: 48px;
}

.agenda-toolbar :deep(.select-field__trigger) {
  min-height: 48px;
}
</style>
