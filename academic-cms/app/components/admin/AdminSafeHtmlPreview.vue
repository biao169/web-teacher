<script setup lang="ts">
const props=defineProps<{ html:string }>()
const srcdoc=computed(()=>`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data: https:;"><base target="_blank"><style>body{font:14px/1.65 system-ui,sans-serif;margin:0;padding:12px;color:#303133;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style></head><body>${props.html??''}</body></html>`)
</script>
<template><iframe class="safe-html-preview" :srcdoc="srcdoc" sandbox="allow-popups allow-popups-to-escape-sandbox" title="安全 HTML 预览" /></template>
<style scoped>.safe-html-preview{display:block;width:100%;min-height:24rem;border:1px solid var(--el-border-color);border-radius:.5rem;background:#fff}</style>
