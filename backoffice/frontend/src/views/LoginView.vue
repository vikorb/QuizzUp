<template>
  <main class="login">
    <div class="login__bg" aria-hidden="true"></div>

    <SectionCard :max-width="480">
      <template #header>
        <SectionHeader :title="$t('auth.login.title')" :subtitle="$t('auth.login.subtitle')">
          <template #mark>
            <div class="logo">
              <img src="@/assets/img/logo.png" alt="Logo" class="logo-img" />
            </div>
          </template>
        </SectionHeader>
      </template>

      <LoginForm />
    </SectionCard>
  </main>
</template>

<script setup lang="ts">
import SectionCard from '@/components/ui/section/SectionCard.vue'
import SectionHeader from '@/components/ui/section/SectionHeader.vue'
import LoginForm from '@/views/login/LoginForm.vue'
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
</style>
