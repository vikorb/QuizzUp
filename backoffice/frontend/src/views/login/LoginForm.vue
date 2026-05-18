<template>
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
        <UiButton
          variant="icon"
          type="button"
          :disabled="loading"
          :aria-label="$t(showPassword ? 'auth.login.hidePassword' : 'auth.login.showPassword')"
          @click="showPassword = !showPassword"
        >
          <MdIcon :path="showPassword ? mdiEyeOffOutline : mdiEyeOutline" :size="18" />
        </UiButton>
      </template>
    </FormField>

    <p v-if="formError" class="form-error">{{ formError }}</p>

    <UiButton class="submit" variant="primary" type="submit" :disabled="loading">
      <span v-if="!loading">{{ $t('auth.login.submit') }}</span>
      <span v-else>{{ $t('auth.login.submitting') }}</span>
    </UiButton>

    <p class="hint">{{ $t('auth.login.seedHint') }}</p>
  </form>
</template>

<script setup lang="ts">
import { mdiEyeOffOutline, mdiEyeOutline } from '@mdi/js'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import FormField from '@/components/ui/form/FormField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
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
.form {
  display: grid;
  gap: 14px;
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
