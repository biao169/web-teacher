<script setup lang="ts">
import { computed } from 'vue'
import { Mail, Phone, MapPin } from '@lucide/vue'
import type { PublicHomeViewModel } from '~~/shared/contracts/public-site'
import { publicDetailHref } from '~~/shared/utils/public-detail-link'
import ProfileLinks from '../ProfileLinks.vue'
import NavigationLink from '../NavigationLink.vue'
import { mediaSurnameFallback } from '~/utils/media-fallback'
const props = defineProps<{ model: PublicHomeViewModel }>()
const profile = computed(() => props.model.featuredProfile)
</script>
<template><section id="profile" class="public-home-profile" aria-labelledby="public-home-title"><div class="public-container">
  <div v-if="profile" class="public-home-profile__body">
    <div class="public-home-profile__photo"><PublicMediaImage :media="profile.avatar" :initials="profile.name" :fallback-text="mediaSurnameFallback(profile.name)" aspect="portrait" eager priority /></div>
    <div class="public-home-profile__content">
      <h1 id="public-home-title"><NuxtLink class="public-home-profile__name" :to="publicDetailHref(profile.href, `/${model.locale}#profile`)">{{ profile.name }}</NuxtLink></h1>
      <p v-if="profile.role || profile.title || profile.organization || profile.lab" class="public-home-profile__meta">{{ [profile.role, profile.title, profile.organization, profile.lab].filter(Boolean).join(' · ') }}</p>
      <p v-if="profile.biography" class="public-home-profile__biography">{{ profile.biography }}</p>
      <address v-if="profile.contact" class="public-home-profile__contact">
        <a v-if="profile.contact.email" :href="`mailto:${profile.contact.email}`"><Mail :size="16" aria-hidden="true" />{{ profile.contact.email }}</a>
        <a v-if="profile.contact.phone" :href="`tel:${profile.contact.phone}`"><Phone :size="16" aria-hidden="true" />{{ profile.contact.phone }}</a>
        <span v-if="profile.contact.office"><MapPin :size="16" aria-hidden="true" />{{ profile.contact.office }}</span>
      </address>
      <ProfileLinks v-if="profile.links?.length" :links="profile.links" :locale="model.locale" />
    </div>
  </div>
  <div v-else class="public-home-profile__empty"><h1 id="public-home-title">{{ model.site.name }}</h1><p>{{ model.locale === 'zh' ? '暂无公开精选教师资料。' : 'No featured faculty profile is available.' }}</p></div>
  <nav v-if="model.navigation.hero.length" class="public-actions public-home-shortcuts" :aria-label="model.locale === 'zh' ? '首页快捷入口' : 'Homepage shortcuts'"><NavigationLink v-for="item in model.navigation.hero" :key="item.uid" :link="item" /></nav>
</div></section></template>
