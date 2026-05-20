<template>
  <SectionLayout :title="$t('clients.create.title')" :subtitle="$t('clients.create.subtitle')">
    <BaseCard
      :title="$t('clients.create.cardTitle')"
      :neon="true"
      :no-hover="true"
      class="create-client-card"
    >
      <CreateClientForm />
    </BaseCard>
  </SectionLayout>
</template>

<script setup lang="ts">
import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import CreateClientForm from '@/views/clients/creation/CreateClientForm.vue'
</script>

<style scoped>
.create-client-card {
  margin-top: 10px;
}
</style>
