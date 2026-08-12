<template>
  <div class="select-field">
    <LabelField :label="label" :for-id="id" :required="required" />

    <div ref="controlRef" class="select-field__control">
      <button
        :id="id"
        type="button"
        class="select-field__trigger"
        :class="{
          'select-field__trigger--error': !!error,
          'select-field__trigger--open': open,
        }"
        :disabled="disabled"
        :aria-label="ariaLabel"
        aria-haspopup="listbox"
        :aria-expanded="open"
        @click="toggleOpen"
        @keydown="onTriggerKeydown"
      >
        <span
          class="select-field__value"
          :class="{ 'select-field__value--placeholder': selectedLabel === null }"
        >
          {{ selectedLabel ?? placeholder ?? '' }}
        </span>
        <MdIcon class="select-field__chevron" :path="mdiChevronDown" :size="18" />
      </button>

      <ul
        v-if="open"
        class="select-field__menu"
        :class="{ 'select-field__menu--up': dropUp }"
        role="listbox"
      >
        <li
          v-for="(option, index) in options"
          :key="String(option.value)"
          class="select-field__option"
          :class="{
            'select-field__option--active': index === highlightedIndex,
            'select-field__option--selected': isSelected(option),
            'select-field__option--disabled': option.disabled,
          }"
          role="option"
          :aria-selected="isSelected(option)"
          @click="selectOption(option)"
          @mousemove="highlightedIndex = index"
        >
          <span class="select-field__option-label">{{ option.label }}</span>
          <MdIcon
            v-if="isSelected(option)"
            class="select-field__check"
            :path="mdiCheck"
            :size="16"
          />
        </li>
      </ul>
    </div>

    <input v-if="name" type="hidden" :name="name" :value="modelValue ?? ''" />

    <p v-if="error" class="select-field__error">
      {{ error }}
    </p>

    <p v-else-if="hint" class="select-field__hint">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { mdiCheck, mdiChevronDown } from '@mdi/js'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import LabelField from '@/components/ui/form/LabelField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import type { SelectFieldOption } from '@/types/form'

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null
    options: SelectFieldOption[]
    label?: string
    id?: string
    name?: string
    placeholder?: string
    hint?: string
    error?: string
    disabled?: boolean
    required?: boolean
    ariaLabel?: string
  }>(),
  {
    modelValue: '',
    label: undefined,
    id: undefined,
    name: undefined,
    placeholder: undefined,
    hint: undefined,
    error: undefined,
    disabled: false,
    required: false,
    ariaLabel: undefined,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

const open = ref(false)
const dropUp = ref(false)
const highlightedIndex = ref(-1)
const controlRef = ref<HTMLElement | null>(null)

const selectedLabel = computed<string | null>(() => {
  const current = String(props.modelValue ?? '')
  const match = props.options.find((option) => String(option.value) === current)
  return match ? match.label : null
})

function isSelected(option: SelectFieldOption): boolean {
  return String(option.value) === String(props.modelValue ?? '')
}

function openMenu(): void {
  if (props.disabled) return

  // Ouvre vers le haut si l'espace en dessous est trop court (ex. select en bas
  // du menu latéral), pour ne pas être rogné.
  const rect = controlRef.value?.getBoundingClientRect()
  const spaceBelow = rect ? window.innerHeight - rect.bottom : Number.POSITIVE_INFINITY
  dropUp.value = spaceBelow < 280

  open.value = true
  const selectedIndex = props.options.findIndex((option) => isSelected(option))
  highlightedIndex.value = selectedIndex >= 0 ? selectedIndex : 0
}

function closeMenu(): void {
  open.value = false
}

function toggleOpen(): void {
  if (open.value) {
    closeMenu()
  } else {
    openMenu()
  }
}

function selectOption(option: SelectFieldOption): void {
  if (option.disabled) return

  const value = String(option.value)
  emit('update:modelValue', value)
  emit('change', value)
  closeMenu()
}

function moveHighlight(delta: number): void {
  const count = props.options.length
  if (count === 0) return

  let next = highlightedIndex.value
  for (let step = 0; step < count; step += 1) {
    next = (next + delta + count) % count
    if (!props.options[next]?.disabled) break
  }
  highlightedIndex.value = next
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) return

  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openMenu()
    }
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(-1)
      break
    case 'Home':
      event.preventDefault()
      highlightedIndex.value = 0
      break
    case 'End':
      event.preventDefault()
      highlightedIndex.value = props.options.length - 1
      break
    case 'Enter':
    case ' ': {
      event.preventDefault()
      const option = props.options[highlightedIndex.value]
      if (option) selectOption(option)
      break
    }
    case 'Escape':
      event.preventDefault()
      closeMenu()
      break
    case 'Tab':
      closeMenu()
      break
  }
}

function onDocumentPointerDown(event: Event): void {
  if (!controlRef.value) return
  if (!controlRef.value.contains(event.target as Node)) {
    closeMenu()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    void nextTick(() => document.addEventListener('pointerdown', onDocumentPointerDown))
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<style scoped>
.select-field {
  display: grid;
  gap: 8px;
}

.select-field__control {
  position: relative;
}

.select-field__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  padding: 0 12px 0 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--bg-field);
  color: var(--text-0);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--tr),
    box-shadow var(--tr),
    background var(--tr);
}

.select-field__trigger:hover {
  border-color: var(--border-2);
  background: var(--surface-1);
}

.select-field__trigger--open,
.select-field__trigger:focus-visible {
  outline: none;
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px var(--glow-soft);
}

.select-field__trigger--error {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-bg);
}

.select-field__trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.select-field__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-field__value--placeholder {
  color: var(--text-3);
}

.select-field__chevron {
  flex: 0 0 auto;
  color: var(--text-2);
  transition: transform var(--tr);
}

.select-field__trigger--open .select-field__chevron {
  transform: rotate(180deg);
}

.select-field__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 40;
  margin: 0;
  padding: 6px;
  list-style: none;
  max-height: 264px;
  overflow-y: auto;
  border-radius: 14px;
  border: 1px solid var(--border-2);
  background: var(--bg-elevated);
  box-shadow:
    0 18px 40px -18px rgba(0, 0, 0, 0.8),
    0 0 0 1px var(--surface-1) inset;
  animation: select-menu-in 0.14s cubic-bezier(0.4, 0, 0.2, 1);
}

.select-field__menu--up {
  top: auto;
  bottom: calc(100% + 6px);
}

@keyframes select-menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.select-field__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 9px;
  cursor: pointer;
  color: var(--text-1);
  font-size: 14px;
}

.select-field__option--active {
  background: var(--surface-2);
  color: var(--text-0);
}

.select-field__option--selected {
  color: var(--accent-pink);
  font-weight: 600;
}

.select-field__option--selected.select-field__option--active {
  background: var(--glow-soft);
}

.select-field__option--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.select-field__check {
  flex: 0 0 auto;
  color: var(--accent-pink);
}

.select-field__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.select-field__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
