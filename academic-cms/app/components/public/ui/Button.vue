<script setup lang="ts">
withDefaults(defineProps<{
  href: string
  external?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
  showExternalIcon?: boolean
}>(), {
  external: false,
  variant: 'secondary',
  showExternalIcon: false,
})
</script>

<template>
  <PublicSmartLink
    class="public-button pub:inline-flex pub:items-center pub:justify-center"
    :class="`public-button--${variant}`"
    :href="href"
    :external="external"
    :show-external-icon="showExternalIcon"
  >
    <slot />
  </PublicSmartLink>
</template>
