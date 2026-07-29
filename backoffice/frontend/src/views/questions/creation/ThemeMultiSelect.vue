<template>
  <section
    ref="rootRef"
    class="theme-multiselect"
    :class="{
      'theme-multiselect--open': isOpen,
      'theme-multiselect--error': Boolean(error),
      'theme-multiselect--disabled': disabled,
    }"
  >
    <div class="theme-multiselect__header">
      <div>
        <label class="theme-multiselect__label" :for="inputId">
          {{ label }}
          <span v-if="required" class="theme-multiselect__required">*</span>
        </label>
        <p v-if="hint" class="theme-multiselect__hint">
          {{ hint }}
        </p>
      </div>

      <span class="theme-multiselect__counter">
        {{ selectedThemes.length }} {{ $t('questions.form.selectedThemes') }}
      </span>
    </div>

    <div
      class="theme-multiselect__control"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="dropdownId"
      @click="focusSearch"
    >
      <div class="theme-multiselect__chips">
        <button
          v-for="theme in selectedThemes"
          :key="theme.id"
          class="theme-chip"
          type="button"
          :disabled="disabled"
          :title="$t('questions.form.removeTheme')"
          @click.stop="removeTheme(theme.id)"
        >
          <span class="theme-chip__content">
            <span class="theme-chip__name">{{ theme.name }}</span>
            <span class="theme-chip__meta">{{ getThemeMeta(theme) }}</span>
          </span>
          <span class="theme-chip__remove" aria-hidden="true">×</span>
        </button>

        <input
          :id="inputId"
          ref="searchInputRef"
          v-model="searchQuery"
          class="theme-multiselect__input"
          type="search"
          :disabled="disabled"
          :placeholder="inputPlaceholder"
          autocomplete="off"
          @focus="openDropdown"
          @keydown.down.prevent="highlightNext"
          @keydown.up.prevent="highlightPrevious"
          @keydown.enter.prevent="selectHighlightedTheme"
          @keydown.esc.prevent="closeDropdown"
          @keydown.backspace="removeLastThemeWhenSearchIsEmpty"
        />
      </div>

      <button
        class="theme-multiselect__toggle"
        type="button"
        :disabled="disabled"
        :aria-label="$t('questions.form.selectTheme')"
        @click.stop="toggleDropdown"
      >
        <span aria-hidden="true">⌄</span>
      </button>
    </div>

    <Transition name="theme-multiselect-fade">
      <div
        v-if="isOpen && !disabled"
        :id="dropdownId"
        class="theme-multiselect__dropdown"
        role="listbox"
      >
        <div class="theme-multiselect__dropdown-head">
          <span>{{ $t('questions.form.searchThemes') }}</span>
          <strong>{{ availableThemes.length }}</strong>
        </div>

        <button
          v-for="(theme, index) in availableThemes"
          :key="theme.id"
          class="theme-option"
          :class="{ 'theme-option--highlighted': index === highlightedIndex }"
          type="button"
          role="option"
          :aria-selected="false"
          @mouseenter="highlightedIndex = index"
          @mousedown.prevent="selectTheme(theme.id)"
        >
          <span class="theme-option__icon">
            {{ getThemeInitials(theme.name) }}
          </span>

          <span class="theme-option__content">
            <span class="theme-option__name">{{ theme.name }}</span>
            <span class="theme-option__meta">{{ getThemeMeta(theme) }}</span>
          </span>

          <span class="theme-option__add">
            {{ $t('questions.form.addTheme') }}
          </span>
        </button>

        <p v-if="availableThemes.length === 0" class="theme-multiselect__empty">
          {{ $t('questions.form.noThemeResult') }}
        </p>
      </div>
    </Transition>

    <p v-if="error" class="theme-multiselect__error">
      {{ error }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Theme } from '@/types/question'

const props = withDefaults(
  defineProps<{
    modelValue: number[]
    themes: Theme[]
    label: string
    placeholder: string
    hint?: string
    error?: string
    disabled?: boolean
    required?: boolean
  }>(),
  {
    hint: '',
    error: '',
    disabled: false,
    required: false,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: number[]): void
}>()

const { t } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const isOpen = ref(false)
const highlightedIndex = ref(0)

const inputId = `theme-multiselect-${Math.random().toString(36).slice(2)}`
const dropdownId = `${inputId}-dropdown`

const selectedIdSet = computed(() => new Set(props.modelValue.map(Number)))

const selectedThemes = computed(() =>
  props.modelValue
    .map((themeId) => props.themes.find((theme) => Number(theme.id) === Number(themeId)))
    .filter((theme): theme is Theme => Boolean(theme))
)

const availableThemes = computed(() => {
  const search = searchQuery.value.trim().toLowerCase()

  return props.themes
    .filter((theme) => !selectedIdSet.value.has(Number(theme.id)))
    .filter((theme) => {
      if (!search) {
        return true
      }

      return [theme.name, theme.mode, theme.scope].some((value) =>
        String(value).toLowerCase().includes(search)
      )
    })
    .slice(0, 10)
})

const inputPlaceholder = computed(() => {
  if (selectedThemes.value.length > 0) {
    return t('questions.form.searchThemesPlaceholder')
  }

  return props.placeholder
})

watch(
  () => searchQuery.value,
  () => {
    highlightedIndex.value = 0
  }
)

watch(
  () => availableThemes.value.length,
  (length) => {
    if (highlightedIndex.value >= length) {
      highlightedIndex.value = Math.max(length - 1, 0)
    }
  }
)

function normalizeThemeIds(themeIds: number[]): number[] {
  return [
    ...new Set(themeIds.map(Number).filter((themeId) => Number.isInteger(themeId) && themeId > 0)),
  ]
}

function openDropdown(): void {
  if (props.disabled) {
    return
  }

  isOpen.value = true
}

function closeDropdown(): void {
  isOpen.value = false
  highlightedIndex.value = 0
}

function toggleDropdown(): void {
  if (isOpen.value) {
    closeDropdown()
    return
  }

  focusSearch()
}

async function focusSearch(): Promise<void> {
  if (props.disabled) {
    return
  }

  openDropdown()
  await nextTick()
  searchInputRef.value?.focus()
}

function selectTheme(themeId: number): void {
  if (props.disabled || selectedIdSet.value.has(Number(themeId))) {
    return
  }

  emit('update:modelValue', normalizeThemeIds([...props.modelValue, Number(themeId)]))
  searchQuery.value = ''
  highlightedIndex.value = 0
  void focusSearch()
}

function removeTheme(themeId: number): void {
  if (props.disabled) {
    return
  }

  emit(
    'update:modelValue',
    normalizeThemeIds(
      props.modelValue.filter((selectedThemeId) => Number(selectedThemeId) !== Number(themeId))
    )
  )
}

function selectHighlightedTheme(): void {
  const theme = availableThemes.value[highlightedIndex.value]

  if (!theme) {
    return
  }

  selectTheme(theme.id)
}

function highlightNext(): void {
  if (!isOpen.value) {
    openDropdown()
    return
  }

  if (availableThemes.value.length === 0) {
    return
  }

  highlightedIndex.value = (highlightedIndex.value + 1) % availableThemes.value.length
}

function highlightPrevious(): void {
  if (!isOpen.value) {
    openDropdown()
    return
  }

  if (availableThemes.value.length === 0) {
    return
  }

  highlightedIndex.value =
    highlightedIndex.value === 0 ? availableThemes.value.length - 1 : highlightedIndex.value - 1
}

function removeLastThemeWhenSearchIsEmpty(): void {
  if (searchQuery.value || props.modelValue.length === 0) {
    return
  }

  const lastThemeId = props.modelValue[props.modelValue.length - 1]

  if (lastThemeId !== undefined) {
    removeTheme(lastThemeId)
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!rootRef.value || rootRef.value.contains(event.target as Node)) {
    return
  }

  closeDropdown()
}

function getThemeMeta(theme: Theme): string {
  return `${t(`questions.themeModes.${theme.mode}`)} · ${t(`questions.scope.${theme.scope}`)}`
}

function getThemeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<style scoped>
.theme-multiselect {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border-2);
  border-radius: 22px;
  background:
    radial-gradient(circle at top left, var(--glow-blue), transparent 34%),
    linear-gradient(135deg, var(--surface-2), var(--surface-0)), var(--bg-card);
  box-shadow: inset 0 1px 0 var(--surface-3);
}

.theme-multiselect--open {
  border-color: var(--border-hover);
  box-shadow:
    0 0 0 1px var(--glow-soft),
    0 18px 50px var(--shadow-1),
    inset 0 1px 0 var(--surface-3);
}

.theme-multiselect--error {
  border-color: var(--danger);
}

.theme-multiselect--disabled {
  opacity: 0.72;
}

.theme-multiselect__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.theme-multiselect__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-0);
  font-size: 14px;
  font-weight: 950;
}

.theme-multiselect__required {
  color: var(--danger);
}

.theme-multiselect__hint {
  margin: 5px 0 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.45;
}

.theme-multiselect__counter {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--text-1);
  background: var(--surface-3);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.theme-multiselect__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 8px;
  min-height: 54px;
  padding: 8px;
  border: 1px solid var(--border-2);
  border-radius: 18px;
  background: var(--surface-inset);
  cursor: text;
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.theme-multiselect__control:focus-within {
  border-color: var(--border-hover);
  background: var(--surface-inset);
}

.theme-multiselect__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.theme-multiselect__input {
  flex: 1 1 170px;
  min-width: 150px;
  height: 34px;
  border: 0;
  outline: none;
  color: var(--text-0);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}

.theme-multiselect__input::placeholder {
  color: var(--text-3);
}

.theme-multiselect__toggle {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  align-self: start;
  border: 1px solid var(--border-2);
  border-radius: 12px;
  color: var(--text-1);
  background: var(--surface-2);
  cursor: pointer;
  font-size: 18px;
  font-weight: 900;
}

.theme-multiselect__toggle:hover:not(:disabled) {
  border-color: var(--border-hover);
  background: var(--surface-3);
}

.theme-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-height: 34px;
  padding: 4px 6px 4px 11px;
  border: 1px solid var(--border-2);
  border-radius: 999px;
  color: var(--text-1);
  background: linear-gradient(135deg, var(--glow-blue), var(--glow-soft)), var(--surface-2);
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}

.theme-chip:hover:not(:disabled) {
  border-color: var(--border-hover);
  background: linear-gradient(135deg, var(--glow-blue), var(--glow-pink)), var(--surface-2);
  transform: translateY(-1px);
}

.theme-chip__content {
  display: grid;
  gap: 1px;
  min-width: 0;
  text-align: left;
}

.theme-chip__name {
  overflow: hidden;
  max-width: 220px;
  color: var(--text-0);
  font-size: 13px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-chip__meta {
  color: var(--text-2);
  font-size: 10px;
  font-weight: 800;
}

.theme-chip__remove {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  color: var(--text-0);
  background: var(--surface-3);
  font-size: 15px;
  line-height: 1;
}

.theme-multiselect__dropdown {
  position: absolute;
  z-index: 20;
  top: calc(100% - 10px);
  right: 16px;
  left: 16px;
  display: grid;
  gap: 6px;
  max-height: 330px;
  padding: 10px;
  overflow-y: auto;
  border: 1px solid var(--border-2);
  border-radius: 18px;
  background: linear-gradient(135deg, var(--bg-card-hi), var(--bg-card)), var(--bg-elevated);
  box-shadow:
    0 24px 70px var(--shadow-2),
    inset 0 1px 0 var(--surface-2);
  backdrop-filter: blur(16px);
}

.theme-multiselect__dropdown-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 6px 8px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.theme-multiselect__dropdown-head strong {
  color: var(--primary);
}

.theme-option {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--text-1);
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    transform 0.14s ease;
}

.theme-option:hover,
.theme-option--highlighted {
  border-color: var(--border-2);
  background: var(--surface-2);
  transform: translateY(-1px);
}

.theme-option__icon {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  color: var(--text-0);
  background:
    radial-gradient(circle at 30% 20%, var(--surface-3), transparent 32%),
    linear-gradient(135deg, var(--glow-blue), var(--glow-pink)), var(--bg-card-hi);
  font-size: 12px;
  font-weight: 950;
}

.theme-option__content {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.theme-option__name {
  overflow: hidden;
  color: var(--text-0);
  font-size: 13px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-option__meta {
  color: var(--text-2);
  font-size: 12px;
  font-weight: 750;
}

.theme-option__add {
  color: var(--primary);
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
}

.theme-multiselect__empty,
.theme-multiselect__error {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
}

.theme-multiselect__empty {
  padding: 14px;
  border: 1px dashed var(--border-2);
  border-radius: 14px;
  color: var(--text-2);
  text-align: center;
}

.theme-multiselect__error {
  color: var(--danger);
}

.theme-multiselect-fade-enter-active,
.theme-multiselect-fade-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.theme-multiselect-fade-enter-from,
.theme-multiselect-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 820px) {
  .theme-multiselect__header {
    flex-direction: column;
    gap: 10px;
  }

  .theme-multiselect__counter {
    width: fit-content;
  }

  .theme-option {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .theme-option__add {
    grid-column: 2;
  }
}
</style>
