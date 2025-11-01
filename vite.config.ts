import { defineConfig } from 'vite'
import tailwindcss from "@tailwindcss/vite";
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/snbt-editor/',
  plugins: [
    tailwindcss(),
    vue()
  ],
})
