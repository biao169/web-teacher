<script setup lang="ts">
import { Mail, MapPin, Phone } from '@lucide/vue'
import type { PublicProfileDetailViewModel } from '~~/shared/contracts/public-content'
import ProfileLinks from '../ProfileLinks.vue'
import { mediaSurnameFallback } from '~/utils/media-fallback'
defineProps<{ model: PublicProfileDetailViewModel }>()
</script>
<template>
  <div><PublicContentPageHero :meta="model.meta" :locale="model.locale" hide-description />
    <section class="public-content-section"><div class="public-container public-detail-layout"><aside class="public-profile-aside"><PublicMediaImage :media="model.item.avatar" :initials="model.item.name" :fallback-text="mediaSurnameFallback(model.item.name)" aspect="portrait" eager priority /><div class="public-tag-list"><PublicUiBadge v-if="model.item.role" tone="accent">{{ model.item.role }}</PublicUiBadge><PublicUiBadge v-if="model.item.title" tone="outline">{{ model.item.title }}</PublicUiBadge></div><p v-if="model.item.organization">{{ model.item.organization }}</p><p v-if="model.item.lab">{{ model.item.lab }}</p>
      <address v-if="model.item.contact" class="public-contact-list"><a v-if="model.item.contact.email" :href="`mailto:${model.item.contact.email}`"><Mail :size="17" aria-hidden="true" />{{ model.item.contact.email }}</a><a v-if="model.item.contact.phone" :href="`tel:${model.item.contact.phone}`"><Phone :size="17" aria-hidden="true" />{{ model.item.contact.phone }}</a><span v-if="model.item.contact.office"><MapPin :size="17" aria-hidden="true" />{{ model.item.contact.office }}</span></address>
      <ProfileLinks :links="model.item.links" :locale="model.locale" /></aside>
      <div class="public-detail-main"><PublicContentLongText :title="model.locale === 'zh' ? '个人简介' : 'Biography'" :text="model.item.biography" id="profile-biography" /><PublicContentLongText :title="model.locale === 'zh' ? '教育经历' : 'Education'" :text="model.item.education" id="profile-education" /><PublicContentLongText :title="model.locale === 'zh' ? '科研与工作经历' : 'Research and professional experience'" :text="model.item.experience" id="profile-experience" /><PublicContentLongText :title="model.locale === 'zh' ? '招生说明' : 'Prospective students'" :text="model.item.recruiting" id="profile-recruiting" /></div>
    </div></section>
  </div>
</template>
