<template>
  <div class="prompt" :class="{ 'prompt--media': imageUrl }">
    <p v-if="hint" class="prompt__hint">{{ hint }}</p>
    <h1 class="prompt__text">{{ question.text }}</h1>
    <figure v-if="imageUrl" class="prompt__media">
      <img
        class="prompt__image"
        :src="imageUrl"
        alt=""
        :style="blur > 0 ? { filter: `blur(${blur}px)` } : undefined"
      />
    </figure>
  </div>
</template>

<script setup lang="ts">
import type { EngineQuestion } from '@quizzup/game-engine'
import { QUESTION_MEDIA_TYPE_IMAGE } from '@quizzup/shared'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    question: EngineQuestion
    hint?: string
    /** Flou de l'image en pixels (révélation progressive). */
    blur?: number
  }>(),
  { hint: '', blur: 0 }
)

const imageUrl = computed(() =>
  props.question.mediaType === QUESTION_MEDIA_TYPE_IMAGE ? props.question.mediaUrl : null
)
</script>

<style scoped>
.prompt {
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
}

.prompt__hint {
  margin: 0;
  color: var(--accent-pink);
  font-weight: 800;
  font-size: var(--stage-small);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.prompt__text {
  margin: 0;
  max-width: 1200px;
  font-size: var(--stage-title);
  font-weight: 900;
  line-height: 1.15;
  color: var(--text-0);
}

.prompt--media .prompt__text {
  font-size: clamp(24px, 2.6vw, 44px);
}

.prompt__media {
  margin: 0;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid var(--border-2);
  background: var(--surface-inset);
  box-shadow: 0 0 32px -8px var(--glow-pink);
}

.prompt__image {
  display: block;
  width: auto;
  height: clamp(110px, 24vh, 280px);
  max-width: min(720px, 80vw);
  object-fit: contain;
  transition: filter 0.2s linear;
}
</style>
