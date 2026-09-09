import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[vue()],resolve:{alias:{'#imports':fileURLToPath(new URL('./imports.ts',import.meta.url))}},define:{'import.meta.client':'true','import.meta.server':'false'},build:{outDir:'../dist',emptyOutDir:true},server:{proxy:{'/transfer-api':{target:'http://127.0.0.1:8787',ws:true}}}});
