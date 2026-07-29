<template>
  <div class="base-table-wrap">
    <table class="base-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" :class="getColumnClass(column)">
            {{ column.label }}
          </th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="(item, rowIndex) in items" :key="getRowKey(item, rowIndex)">
          <td v-for="column in columns" :key="column.key" :class="getColumnClass(column)">
            <slot
              :name="`cell-${column.key}`"
              :item="item"
              :value="getValue(item, column.key)"
              :column="column"
              :row-index="rowIndex"
            >
              {{ getValue(item, column.key) }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
export type BaseTableColumn = {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  className?: string
}

const props = defineProps<{
  columns: BaseTableColumn[]
  items: Record<string, unknown>[]
  rowKey?: string
}>()

function getValue(item: Record<string, unknown>, key: string): unknown {
  return item[key]
}

function getRowKey(item: Record<string, unknown>, rowIndex: number): string | number {
  if (props.rowKey) {
    const value = item[props.rowKey]
    if (typeof value === 'string' || typeof value === 'number') {
      return value
    }
  }

  return rowIndex
}

function getColumnClass(column: BaseTableColumn): (string | undefined)[] {
  return [
    column.align === 'right' ? 'base-table__cell--right' : undefined,
    column.align === 'center' ? 'base-table__cell--center' : undefined,
    column.className,
  ]
}
</script>

<style scoped>
.base-table-wrap {
  max-height: 500px;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--surface-inset);
}

.base-table {
  width: 100%;
  border-collapse: collapse;
}

.base-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-elevated);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-2);
}

.base-table th,
.base-table td {
  padding: 12px 12px;
  border-bottom: 1px solid var(--border-ui);
  text-align: left;
  font-size: 13px;
}

.base-table th {
  color: var(--text-2);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
  background: var(--surface-0);
}

/* Survol de ligne : fond violet léger + liseré néon à gauche. */
.base-table tbody tr {
  box-shadow: inset 3px 0 0 transparent;
  transition: var(--tr);
}

.base-table tbody tr:hover {
  box-shadow: inset 3px 0 0 var(--accent-purple);
}

.base-table tbody tr:hover td {
  background: var(--row-hover);
}

.base-table th.base-table__cell--right,
.base-table td.base-table__cell--right {
  text-align: right;
  white-space: nowrap;
}

.base-table th.base-table__cell--center,
.base-table td.base-table__cell--center {
  text-align: center;
}
</style>
