<template>
  <main class="login stage-bg">
    <SectionCard :max-width="520">
      <template #header>
        <SectionHeader :title="$t('auth.login.title')" :subtitle="$t('auth.login.subtitle')">
          <template #mark>
            <div class="logo">
              <img :src="logoUrl" alt="QuizzUP" class="logo-img" />
            </div>
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

        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

        <UiButton class="submit" variant="primary" type="submit" :disabled="loading">
          {{ loading ? $t('auth.login.submitting') : $t('auth.login.submit') }}
        </UiButton>

        <div class="demo">
          <UiButton class="demo__btn" type="button" :disabled="loading" @click="onDemo">
            <MdIcon :path="mdiPlayCircleOutline" :size="18" />
            {{ $t('auth.login.demo') }}
          </UiButton>
          <p class="hint">{{ $t('auth.login.demoHint') }}</p>
        </div>
      </form>
    </SectionCard>
  </main>
</template>

<script setup lang="ts">
import logoUrl from '@backoffice-assets/img/logo.png'
import { mdiEyeOffOutline, mdiEyeOutline, mdiPlayCircleOutline } from '@mdi/js'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import FormField from '@/components/ui/FormField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import SectionCard from '@/components/ui/SectionCard.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { enterDemo, signIn } from '@/state/roomAuth'
import { loginReasonToI18nKey, loginRoomApi } from '@/utils/auth'

const { t } = useI18n()
const router = useRouter()

const identifier = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const formError = ref<string | null>(null)
const fieldErrors = reactive<{ identifier?: string; password?: string }>({})

async function onSubmit(): Promise<void> {
  formError.value = null
  fieldErrors.identifier = identifier.value.trim() ? undefined : t('auth.errors.required')
  fieldErrors.password = password.value ? undefined : t('auth.errors.required')

  if (fieldErrors.identifier || fieldErrors.password) {
    return
  }

  loading.value = true
  try {
    const result = await loginRoomApi({
      identifier: identifier.value.trim(),
      password: password.value,
    })

    if (!result.ok) {
      formError.value = t(loginReasonToI18nKey(result.reason))
      return
    }

    signIn(result.token, result.account)
    await router.replace({ name: 'launch' })
  } finally {
    loading.value = false
  }
}

async function onDemo(): Promise<void> {
  enterDemo()
  await router.replace({ name: 'launch' })
}
</script>

<style scoped>
.login {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 18px 14px;
}

.form {
  display: grid;
  gap: 14px;
}

.form-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--danger);
  background: var(--danger-bg);
  color: var(--text-1);
  font-size: 13px;
}

.submit {
  width: 100%;
  border-radius: 14px;
  padding: 12px 18px;
}

.demo {
  display: grid;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--border-ui);
}

.demo__btn {
  width: 100%;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}
</style>
