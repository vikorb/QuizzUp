<template>
  <section class="import-report" aria-labelledby="import-report-title">
    <h3 id="import-report-title" class="import-report__title">
      {{ t('questionImport.report.title') }}
    </h3>

    <div class="import-report__counts">
      <span class="import-report__rows">
        {{ t('questionImport.report.rows', { count: rows }, rows) }}
      </span>
      <StatusPill
        tone="ok"
        :label="t('questionImport.report.valid', { count: valid }, valid)"
        data-test="import-report-valid"
      />
      <StatusPill
        v-if="invalid > 0"
        tone="danger"
        :label="t('questionImport.report.invalid', { count: invalid }, invalid)"
        data-test="import-report-invalid"
      />
    </div>

    <p v-if="invalid === 0" class="import-report__note" data-test="import-report-clean">
      {{ t('questionImport.report.clean', { count: valid }, valid) }}
    </p>

    <template v-else>
      <p class="import-report__note" data-test="import-report-blocked">
        {{ t('questionImport.report.blocked') }}
      </p>

      <p
        v-if="errors.length < invalid"
        class="import-report__note"
        data-test="import-report-truncated"
      >
        {{ t('questionImport.report.truncated', { shown: errors.length }) }}
      </p>

      <BaseTable :columns="columns" :items="items" row-key="key">
        <template #cell-column="{ value }">
          <code v-if="value" class="import-report__column">{{ value }}</code>
          <span v-else class="import-report__none">—</span>
        </template>
      </BaseTable>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseTable, { type BaseTableColumn } from '@/components/ui/BaseTable.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { QuestionImportRowError } from '@/types/questionImport'
import { getImportErrorKey } from '@/utils/question/import'

const props = defineProps<{
  /** Lignes de données lues, valides ou non. */
  rows: number
  valid: number
  /** Le serveur n'en renvoie que 200 au plus : `rows - valid` donne le total. */
  errors: QuestionImportRowError[]
}>()

const { t, te } = useI18n()

const invalid = computed(() => props.rows - props.valid)

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'line', label: t('questionImport.report.line') },
  { key: 'column', label: t('questionImport.report.column') },
  { key: 'message', label: t('questionImport.report.error') },
])

const items = computed(() =>
  props.errors.map((error, index) => ({
    key: index,
    line: error.line,
    column: error.column,
    message: t(getImportErrorKey(error.code, te)),
  }))
)
</script>

<style scoped>
.import-report {
  display: grid;
  gap: 12px;
}

.import-report__title {
  margin: 0;
  color: var(--text-0);
  font-size: 15px;
  font-weight: 900;
}

.import-report__counts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.import-report__rows {
  color: var(--text-1);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.import-report__note {
  margin: 0;
  color: var(--text-1);
  font-size: 13px;
}

.import-report__column {
  color: var(--text-0);
  font-size: 12px;
}

.import-report__none {
  color: var(--text-3);
}

/* Le tableau tient dans 768 px : ligne et colonne étroites, le message prend le reste et revient à la ligne. */
.import-report :deep(td:nth-child(1)),
.import-report :deep(th:nth-child(1)) {
  width: 64px;
  font-variant-numeric: tabular-nums;
}

.import-report :deep(td:nth-child(2)),
.import-report :deep(th:nth-child(2)) {
  width: 120px;
  overflow-wrap: anywhere;
}

.import-report :deep(td:nth-child(3)) {
  overflow-wrap: anywhere;
}
</style>
