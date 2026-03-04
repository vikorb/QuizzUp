<template>
  <main class="login">
    <div class="login__bg" aria-hidden="true"></div>

    <SectionCard :max-width="480">
      <template #header>
        <SectionHeader :title="$t('auth.login.title')" :subtitle="$t('auth.login.subtitle')">
          <template #mark>
            <div class="brand__mark">Q</div>
          </template>
        </SectionHeader>
      </template>

      <form class="form" @submit.prevent="onSubmit">
        <FormField
          v-model="identifier"
          :label="$t('auth.fields.identifier.label')"
          name="identifier"
          autocomplete="username"
          :placeholder="$t('auth.fields.identifier.placeholder')"
          :disabled="loading"
          :error="fieldErrors.identifier"
          required
        />

        <FormField
          v-model="password"
          :label="$t('auth.fields.password.label')"
          name="password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          :placeholder="$t('auth.fields.password.placeholder')"
          :disabled="loading"
          :error="fieldErrors.password"
          required
          @enter="onSubmit"
        >
          <template #right>
            <button
              class="icon-btn"
              type="button"
              :disabled="loading"
              :aria-label="$t(showPassword ? 'auth.login.hidePassword' : 'auth.login.showPassword')"
              @click="showPassword = !showPassword"
            >
              <MdIcon :path="showPassword ? mdiEyeOffOutline : mdiEyeOutline" :size="18" />
            </button>
          </template>
        </FormField>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <UiButton class="submit" variant="primary" type="submit" :disabled="loading">
          <span v-if="!loading">{{ $t('auth.login.submit') }}</span>
          <span v-else>{{ $t('auth.login.submitting') }}</span>
        </UiButton>

        <p class="hint">{{ $t('auth.login.seedHint') }}</p>
      </form>
    </SectionCard>
  </main>
</template>

<script setup lang="ts">
import { mdiEyeOffOutline, mdiEyeOutline } from '@mdi/js'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import FormField from '@/components/ui/form/FormField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import SectionCard from '@/components/ui/section/SectionCard.vue'
import SectionHeader from '@/components/ui/section/SectionHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loginApi, loginReasonToI18nKey, setToken as storeToken } from '@/utils/auth'
import { getRedirect } from '@/utils/router'
import { isBlank } from '@/utils/validation'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const identifier = ref('admin@quizzup.local')
const password = ref('ChangeMe123!')
const showPassword = ref(false)
const loading = ref(false)

const formError = ref<string | null>(null)
const fieldErrors = reactive<{ identifier?: string; password?: string }>({})

function resetErrors() {
  formError.value = null
  fieldErrors.identifier = undefined
  fieldErrors.password = undefined
}

async function onSubmit() {
  resetErrors()

  if (isBlank(identifier.value)) fieldErrors.identifier = t('auth.errors.required')
  if (isBlank(password.value)) fieldErrors.password = t('auth.errors.required')
  if (fieldErrors.identifier || fieldErrors.password) return

  loading.value = true
  try {
    const result = await loginApi({
      identifier: identifier.value.trim(),
      password: password.value,
    })

    if (!result.ok) {
      formError.value = t(loginReasonToI18nKey(result.reason))
      return
    }

    storeToken(result.token)

    router.replace(getRedirect(route, '/'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 18px 14px;
  position: relative;
  overflow: hidden;
}

.login__bg {
  position: absolute;
  inset: -60px;
  opacity: 0.55;
  filter: blur(14px);
  transform: translateZ(0);
  pointer-events: none;
  -webkit-mask-image: radial-gradient(circle at 50% 40%, #000 42%, transparent 78%);
  mask-image: radial-gradient(circle at 50% 40%, #000 42%, transparent 78%);
}

.brand__mark {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-weight: 900;
  letter-spacing: 0.5px;
  background: linear-gradient(135deg, rgba(0, 98, 255, 0.22), rgba(237, 46, 251, 0.22));
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.form {
  display: grid;
  gap: 14px;
}

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 34px;
  border: 1px solid var(--border-ui);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
  border-radius: 10px;
  cursor: pointer;
  transition: var(--tr);
  padding: 0;
}

.icon-btn:hover {
  border-color: var(--border-hover);
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-0);
}

.icon-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.form-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(237, 46, 251, 0.35);
  background: rgba(237, 46, 251, 0.08);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
}

.submit {
  width: 100%;
  border-radius: 14px;
  padding: 12px 18px;
}

.hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}
</style>
