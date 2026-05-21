import { defineComponent, h } from 'vue'

import { toHref } from './routerMock'

type NavItem = {
  to: string
  icon?: string
  iconType?: string
  labelKey: string
}

const routerLinkExportName = 'RouterLink'

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

  formField: defineComponent({
    name: 'FormField',
    props: {
      modelValue: {
        type: String,
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
    emits: ['update:modelValue', 'enter'],
    setup(props, { emit, slots }) {
      return () =>
        h(
          'label',
          {
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
                emit('update:modelValue', (event.target as HTMLInputElement).value)
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
