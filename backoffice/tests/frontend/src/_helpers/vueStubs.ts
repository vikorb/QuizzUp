import { defineComponent, h } from 'vue'

import { toHref } from './routerMock'

type NavItem = {
  to: string
  icon?: string
  iconType?: string
  labelKey: string
}

type TableColumn = {
  key?: string
  name?: string
  field?: string
  label?: string
}

const routerLinkExportName = 'RouterLink'

function columnKey(column: TableColumn): string {
  return String(column.key ?? column.name ?? column.field ?? '')
}

export const frontendStubs = {
  [routerLinkExportName]: defineComponent({
    name: 'RouterLink',
    props: {
      to: {
        type: [String, Object],
        required: true,
      },
    },
    setup(props, { slots, attrs }) {
      return () =>
        h(
          'a',
          {
            ...attrs,
            href: toHref(props.to),
            'data-test': 'router-link',
            'data-to': JSON.stringify(props.to),
          },
          slots.default?.(),
        )
    },
  }),

  authButton: defineComponent({
    name: 'AuthButton',
    props: {
      variant: String,
      loginKey: String,
      logoutKey: String,
    },
    setup(props) {
      return () =>
        h(
          'button',
          {
            type: 'button',
            'data-test': 'auth-button',
            'data-variant': props.variant,
            'data-login-key': props.loginKey,
            'data-logout-key': props.logoutKey,
          },
          'auth-button',
        )
    },
  }),

  baseBanner: defineComponent({
    name: 'BaseBanner',
    props: {
      variant: String,
      message: String,
    },
    emits: ['dismiss'],
    setup(props, { emit }) {
      return () =>
        props.message
          ? h(
              'div',
              {
                'data-test': 'base-banner',
                'data-variant': props.variant,
              },
              [
                h('span', props.message),
                h(
                  'button',
                  {
                    type: 'button',
                    'data-test': 'base-banner-dismiss',
                    onClick: () => emit('dismiss'),
                  },
                  'dismiss',
                ),
              ],
            )
          : null
    },
  }),

  baseCard: defineComponent({
    name: 'BaseCard',
    props: {
      title: String,
      loading: Boolean,
      error: String,
      empty: Boolean,
      loadingLabel: String,
      emptyLabel: String,
      errorNamespace: String,
    },
    setup(props, { slots, attrs }) {
      return () =>
        h(
          'section',
          {
            ...attrs,
            'data-test': 'base-card',
            'data-title': props.title,
            'data-loading': String(props.loading),
            'data-error': props.error,
            'data-empty': String(props.empty),
            'data-error-namespace': props.errorNamespace,
          },
          [
            h('h2', { 'data-test': 'base-card-title' }, props.title),
            props.loading ? h('p', { 'data-test': 'base-card-loading' }, props.loadingLabel) : null,
            props.error ? h('p', { 'data-test': 'base-card-error' }, props.error) : null,
            props.empty ? h('p', { 'data-test': 'base-card-empty' }, props.emptyLabel) : null,
            slots.actions ? h('div', { 'data-test': 'base-card-actions' }, slots.actions()) : null,
            h('div', { 'data-test': 'base-card-content' }, slots.default?.()),
          ],
        )
    },
  }),

  baseTable: defineComponent({
    name: 'BaseTable',
    props: {
      columns: {
        type: Array,
        default: () => [],
      },
      items: {
        type: Array,
        default: () => [],
      },
      rowKey: String,
    },
    setup(props, { slots }) {
      return () =>
        h(
          'table',
          {
            'data-test': 'base-table',
            'data-row-key': props.rowKey,
          },
          [
            h(
              'tbody',
              (props.items as Record<string, unknown>[]).map((item) =>
                h(
                  'tr',
                  {
                    'data-test': 'base-table-row',
                    'data-row-id': String(item.id),
                  },
                  (props.columns as TableColumn[]).map((column) => {
                    const key = columnKey(column)
                    const slot = slots[`cell-${key}`]

                    return h(
                      'td',
                      {
                        'data-test': `base-table-cell-${key}`,
                      },
                      slot ? slot({ value: item[key], item }) : String(item[key] ?? ''),
                    )
                  }),
                ),
              ),
            ),
          ],
        )
    },
  }),

  baseToolBar: defineComponent({
    name: 'BaseToolBar',
    props: {
      resetLabel: String,
      resetDisabled: Boolean,
      primaryLabel: String,
      showPrimary: Boolean,
    },
    emits: ['reset', 'primary'],
    setup(props, { emit, slots }) {
      return () =>
        h('section', { 'data-test': 'base-toolbar' }, [
          h('div', { 'data-test': 'base-toolbar-content' }, slots.default?.()),
          h(
            'button',
            {
              type: 'button',
              disabled: props.resetDisabled,
              'data-test': 'base-toolbar-reset',
              onClick: () => emit('reset'),
            },
            props.resetLabel,
          ),
          props.showPrimary
            ? h(
                'button',
                {
                  type: 'button',
                  'data-test': 'base-toolbar-primary',
                  onClick: () => emit('primary'),
                },
                props.primaryLabel,
              )
            : null,
        ])
    },
  }),

  formActions: defineComponent({
    name: 'FormActions',
    props: {
      cancelLabel: String,
      submitLabel: String,
      submittingLabel: String,
      loading: Boolean,
      disabled: Boolean,
    },
    emits: ['cancel'],
    setup(props, { emit }) {
      return () =>
        h('div', { 'data-test': 'form-actions' }, [
          h(
            'button',
            {
              type: 'button',
              disabled: props.disabled,
              'data-test': 'form-actions-cancel',
              onClick: () => emit('cancel'),
            },
            props.cancelLabel,
          ),
          h(
            'button',
            {
              type: 'submit',
              disabled: props.disabled,
              'data-test': 'form-actions-submit',
            },
            props.loading ? props.submittingLabel : props.submitLabel,
          ),
        ])
    },
  }),

  formField: defineComponent({
    name: 'FormField',
    props: {
      modelValue: {
        type: [String, Number],
        default: '',
      },
      label: String,
      name: String,
      type: {
        type: String,
        default: 'text',
      },
      autocomplete: String,
      placeholder: String,
      disabled: {
        type: Boolean,
        default: false,
      },
      error: String,
      required: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:modelValue', 'update:model-value', 'enter'],
    setup(props, { emit, slots, attrs }) {
      return () =>
        h(
          'label',
          {
            ...attrs,
            'data-test': 'form-field',
            'data-name': props.name,
          },
          [
            h('span', { 'data-test': 'form-field-label' }, props.label),
            h('input', {
              name: props.name,
              value: props.modelValue,
              type: props.type,
              autocomplete: props.autocomplete,
              placeholder: props.placeholder,
              disabled: props.disabled,
              required: props.required,
              'aria-invalid': props.error ? 'true' : 'false',
              onInput: (event: Event) => {
                const value = (event.target as HTMLInputElement).value
                emit('update:modelValue', value)
                emit('update:model-value', value)
              },
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                  emit('enter')
                }
              },
            }),
            slots.right ? h('div', { 'data-test': 'form-field-right' }, slots.right()) : null,
            props.error ? h('p', { 'data-test': 'form-field-error' }, props.error) : null,
          ],
        )
    },
  }),

  formResult: defineComponent({
    name: 'FormResult',
    props: {
      error: String,
      success: String,
    },
    setup(props) {
      return () =>
        h('div', { 'data-test': 'form-result' }, [
          props.error ? h('p', { 'data-test': 'form-result-error' }, props.error) : null,
          props.success ? h('p', { 'data-test': 'form-result-success' }, props.success) : null,
        ])
    },
  }),

  languageSwitcher: defineComponent({
    name: 'LanguageSwitcher',
    props: {
      variant: String,
      showLabel: {
        type: Boolean,
        default: true,
      },
    },
    setup(props) {
      return () =>
        h(
          'div',
          {
            'data-test': 'language-switcher',
            'data-variant': props.variant,
            'data-show-label': String(props.showLabel),
          },
          'language-switcher',
        )
    },
  }),

  mdIcon: defineComponent({
    name: 'MdIcon',
    props: {
      path: String,
      size: Number,
    },
    setup(props) {
      return () =>
        h('svg', {
          'data-test': 'md-icon',
          'data-path': props.path,
          'data-size': String(props.size),
        })
    },
  }),

  navGroup: defineComponent({
    name: 'NavGroup',
    props: {
      label: String,
      items: {
        type: Array,
        default: () => [],
      },
    },
    setup(props, { slots }) {
      return () =>
        h(
          'section',
          {
            'data-test': 'nav-group',
            'data-label': props.label,
          },
          [
            h('h2', { 'data-test': 'nav-group-label' }, props.label),
            ...(props.items as NavItem[]).map((item) =>
              h(
                'a',
                {
                  href: item.to,
                  'data-test': 'nav-item',
                  'data-to': item.to,
                  'data-label-key': item.labelKey,
                },
                item.labelKey,
              ),
            ),
            slots.default?.(),
          ],
        )
    },
  }),

  navbarFrame: defineComponent({
    name: 'NavbarFrame',
    props: {
      withSidebar: {
        type: Boolean,
        default: false,
      },
      showBurger: {
        type: Boolean,
        default: false,
      },
      sidebarOpen: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['toggle-sidebar'],
    setup(props, { slots, emit }) {
      return () =>
        h(
          'div',
          {
            'data-test': 'navbar-frame',
            'data-with-sidebar': String(props.withSidebar),
            'data-show-burger': String(props.showBurger),
            'data-sidebar-open': String(props.sidebarOpen),
          },
          [
            props.showBurger
              ? h(
                  'button',
                  {
                    type: 'button',
                    'data-test': 'frame-burger',
                    onClick: () => emit('toggle-sidebar'),
                  },
                  'burger',
                )
              : null,
            props.withSidebar && slots.sidebar
              ? h('aside', { 'data-test': 'frame-sidebar' }, slots.sidebar())
              : null,
            slots.default?.(),
            slots.overlay ? h('div', { 'data-test': 'frame-overlay' }, slots.overlay()) : null,
          ],
        )
    },
  }),

  sectionCard: defineComponent({
    name: 'SectionCard',
    props: {
      maxWidth: Number,
    },
    setup(props, { slots }) {
      return () =>
        h(
          'section',
          {
            'data-test': 'section-card',
            'data-max-width': String(props.maxWidth),
          },
          [
            slots.header ? h('header', { 'data-test': 'section-card-header' }, slots.header()) : null,
            h('div', { 'data-test': 'section-card-content' }, slots.default?.()),
          ],
        )
    },
  }),

  sectionHeader: defineComponent({
    name: 'SectionHeader',
    props: {
      title: String,
      subtitle: String,
    },
    setup(props, { slots }) {
      return () =>
        h('div', { 'data-test': 'section-header' }, [
          slots.mark ? h('div', { 'data-test': 'section-header-mark' }, slots.mark()) : null,
          h('h1', { 'data-test': 'section-header-title' }, props.title),
          h('p', { 'data-test': 'section-header-subtitle' }, props.subtitle),
        ])
    },
  }),

  sectionLayout: defineComponent({
    name: 'SectionLayout',
    props: {
      title: String,
      subtitle: String,
    },
    setup(props, { slots }) {
      return () =>
        h('main', { 'data-test': 'section-layout' }, [
          h('h1', { 'data-test': 'section-layout-title' }, props.title),
          h('p', { 'data-test': 'section-layout-subtitle' }, props.subtitle),
          slots.default?.(),
        ])
    },
  }),

  selectField: defineComponent({
    name: 'SelectField',
    props: {
      modelValue: {
        type: [String, Number],
        default: '',
      },
      label: String,
      options: {
        type: Array,
        default: () => [],
      },
    },
    emits: ['update:modelValue', 'update:model-value'],
    setup(props, { emit }) {
      return () =>
        h('label', { 'data-test': 'select-field' }, [
          h('span', { 'data-test': 'select-field-label' }, props.label),
          h(
            'select',
            {
              value: props.modelValue,
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value
                emit('update:modelValue', value)
                emit('update:model-value', value)
              },
            },
            (props.options as Array<{ label: string; value: string | number }>).map((option) =>
              h('option', { value: option.value }, option.label),
            ),
          ),
        ])
    },
  }),

  switchField: defineComponent({
    name: 'SwitchField',
    props: {
      modelValue: Boolean,
      disabled: Boolean,
      label: String,
      size: String,
    },
    emits: ['change'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            type: 'button',
            disabled: props.disabled,
            role: 'switch',
            'aria-checked': String(props.modelValue),
            'aria-label': props.label,
            'data-test': 'switch-field',
            'data-size': props.size,
            onClick: () => emit('change', !props.modelValue),
          },
          props.label,
        )
    },
  }),

  uiButton: defineComponent({
    name: 'UiButton',
    props: {
      variant: String,
      type: {
        type: String,
        default: 'button',
      },
      disabled: {
        type: Boolean,
        default: false,
      },
      ariaLabel: String,
    },
    setup(props, { slots, attrs }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            type: props.type,
            disabled: props.disabled,
            'aria-label': props.ariaLabel,
            'data-test': 'ui-button',
            'data-variant': props.variant,
          },
          slots.default?.(),
        )
    },
  }),
}
