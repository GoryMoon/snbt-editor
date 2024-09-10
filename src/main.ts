import { createApp } from 'vue'
import { install as VueMonacoEditorPlugin } from '@guolao/vue-monaco-editor'
import './style.css'
import App from './App.vue'

createApp(App)
    .use(VueMonacoEditorPlugin, {
        paths: {
            // The recommended CDN config
            vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.51.0/min/vs',
        }
    })
    .mount('#app')