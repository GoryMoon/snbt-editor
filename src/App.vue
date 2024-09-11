<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import monacoEditor from 'monaco-editor/esm/vs/editor/editor.api'
import { ref, shallowRef } from 'vue'
import { parse, stringify } from 'nbtify'
import { debounce } from 'remeda';
import { LanguageProvider, ThemeProvider } from 'monaco-textmate-provider'

import githubLogo from './assets/github.png'
import { slashEscape, slashUnescape } from './utils';


const MONACO_EDITOR_OPTIONS: monacoEditor.editor.IStandaloneDiffEditorConstructionOptions = {
  automaticLayout: true,
  formatOnType: true,
  formatOnPaste: true,
  guides: {
    bracketPairs: true,
  },
  minimap: {
    enabled: false,
  },
  padding: {
    top: 5
  }
}

const code = ref("{}")
const error = ref("")
const cursorPos = ref("Ln 1, Col 1")
const selectedAmount = ref("")

function setError(err: unknown) {
  if (typeof err === 'string')
    error.value = err
  else if (err instanceof Error)
    error.value = err.message
}

function clearErrors() {
  error.value = ""
}

function formatString(input: string, minify: boolean) {
  try {
    const parsed = parse(input)
    const result = stringify(parsed, { space: minify ? 0 : 4 })
    clearErrors()
    return result
  } catch (e) {
    setError(e)
  }
  return false;
}


const monacoRef = shallowRef<typeof monacoEditor>()
const editorRef = shallowRef<monacoEditor.editor.IStandaloneCodeEditor>()

const debouncedChange = debounce((data: string) => {
  if (monacoRef.value === undefined || editorRef.value === undefined) return

  const model = editorRef.value.getModel()
  if (model == null) return

  try {
    parse(data)
  } catch (e) {
    if (e instanceof Error) {
      const match = e.message.match(/^Unexpected character (.+) at position (\d*)$/)
      if (match !== null) {
        const preData = data.substring(0, parseInt(match[2]))
        const row = preData.split('\n').length
        const col = parseInt(match[2]) - preData.substring(0, preData.lastIndexOf('\n')).length + 1
        setError(`Unexpected <span class="bg-base-300 py-1 px-2 rounded text-sm">${match[1]}</span> at (${row}:${col})`)

        monacoRef.value.editor.setModelMarkers(model, 'owner', [
          {
            startLineNumber: row,
            startColumn: col,
            endLineNumber: row,
            endColumn: col,
            message: `Unexpected: ${match[1]}`,
            severity: monacoRef.value.MarkerSeverity.Error
          }
        ])
      }
      return
    }
  }

  clearErrors()
  monacoRef.value.editor.setModelMarkers(model, 'owner', [])
}, { waitMs: 300 })

const handleChange = (data: string) => debouncedChange.call(data)
const handleMount = async (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) => {

  // Register language
  monaco.languages.register({
    id: 'snbt',
    aliases: [
      'S-NBT',
      'snbt'
    ]
  })

  // Register language provider
  const languageProvider = new LanguageProvider({
    monaco: monaco,
    wasm: new URL('https://unpkg.com/vscode-oniguruma@2.0.1/release/onig.wasm'),
    grammarSourceMap: {
      snbt: {
        scopeName: 'source.snbt',
        tmLanguageFile: new URL('/snbt.tmLanguage.json', import.meta.url),
        languageConfigurationFile: new URL('/snbt.languageConfig.json', import.meta.url),
      },
    },
  });

  // Register theme
  const themeProvider = new ThemeProvider({
    monaco: monaco,
    registry: await languageProvider.getRegistry(),
    themeSources: {
      default: new URL('/dark-plus-syntax-color-theme.json', import.meta.url)
    }
  });

  await themeProvider.setTheme('default')

  // Register formatter
  monaco.languages.registerDocumentFormattingEditProvider('snbt', {
    provideDocumentFormattingEdits(model, _options) {
      const res = formatString(model.getValue(), false)

      return [
        {
          range: model.getFullModelRange(),
          text: res === false ? model.getValue() : res
        }
      ]
    }
  })

  editor.addAction({
    id: 'editor.action.minfiyDocument',
    label: 'Minfiy sNBT',
    contextMenuGroupId: '1_modification',
    contextMenuOrder: 98,
    run(editor, ..._args) {

      const model = editor.getModel();
      if (model == null) return

      const res = formatString(model.getValue(), true)
      if (res !== false) {
        editor.getModel()?.setValue(res)
      }
    },
  })

  editor.addAction({
    id: 'editor.action.escapeString',
    label: 'Minify and Escape',
    contextMenuGroupId: '1_modification',
    contextMenuOrder: 99,
    run(editor, ..._args) {

      const model = editor.getModel();
      if (model == null) return

      const res = formatString(model.getValue(), true)
      if (res !== false) {
        model.setValue('"' + slashEscape(res) + '"')
      }
    },
  })

  editor.addAction({
    id: 'editor.action.unescapeString',
    label: 'Unescape and Format',
    contextMenuGroupId: '1_modification',
    contextMenuOrder: 97,
    run(editor, ..._args) {
      const model = editor.getModel();
      if (model == null) return

      let res = slashUnescape(model.getValue().replace(/^"/g, '').replace(/"$/g, ''))
      let formatted = formatString(res, false)
      if (formatted !== false) {
        model.setValue(formatted)
      }
    },
  })

  editor.onDidChangeCursorPosition((event) => {
    if (event.secondaryPositions.length > 0) {
      cursorPos.value = `${event.secondaryPositions.length + 1} selections`
    } else {
      const pos = event.position
      cursorPos.value = `Ln ${pos.lineNumber}, Col ${pos.column}`
    }
  })

  editor.onDidChangeCursorSelection((event) => {
    const model = editor.getModel()
    if (model === null) return

    const selectedCount = model.getValueInRange(event.selection).length

    if (event.secondarySelections.length > 0) {
      let count = event.secondarySelections.map((sel) => model.getValueInRange(sel).length).reduce((sum, a) => sum + a, 0)
      count += selectedCount

      selectedAmount.value = event.secondarySelections.length + 1 < count ? `(${count} characters selected)` : ''
    } else if (!event.selection.isEmpty()) {
      selectedAmount.value = `(${selectedCount} selected)`
    } else {
      selectedAmount.value = ''
    }
  })

  return (editorRef.value = editor, monacoRef.value = monaco);
}

function formatCode() {
  editorRef.value?.trigger('editor', 'editor.action.formatDocument', null)
}

function minifyCode() {
  editorRef.value?.trigger('editor', 'editor.action.minfiyDocument', null)
}

function unescapeCode() {
  editorRef.value?.trigger('editor', 'editor.action.unescapeString', null)
}

function escapeCode() {
  editorRef.value?.trigger('editor', 'editor.action.escapeString', null)
}

</script>

<template>
  <div class="flex flex-col h-full max-h-screen">
    <div class="navbar bg-base-100">
      <div class="navbar-start">
        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </div>
          <ul tabindex="0" class="menu menu-sm dropdown-content bg-base-200 rounded-box z-[1] mt-3 w-52 p-2 shadow">
            <li class="py-2"><a @click="unescapeCode">Unescape and Format</a></li>
            <li class="py-2"><a @click="formatCode">Format SNBT</a></li>
            <li class="py-2"><a @click="minifyCode">Minify SNBT</a></li>
            <li class="py-2"><a @click="escapeCode">Minfiy and Escape</a></li>
          </ul>
        </div>
        <span>SNBT Editor</span>
      </div>
      <div class="navbar-center hidden lg:flex">
        <ul class="menu menu-horizontal px-1">
          <li><a @click="unescapeCode">Unescape and Format</a></li>
          <li><a @click="formatCode">Format SNBT</a></li>
          <li><a @click="minifyCode">Minify SNBT</a></li>
          <li><a @click="escapeCode">Minfiy and Escape</a></li>
        </ul>
      </div>
      <div class="navbar-end">
        <a class="btn btn-ghost" href="https://github.com/GoryMoon/snbt-editor">
          <img height="30" width="30" :src="githubLogo" alt="Github logo">
        </a>
      </div>
    </div>
    <div class="flex-auto min-h-0">
      <VueMonacoEditor language="snbt" v-model:value="code" theme="vs-dark" :options="MONACO_EDITOR_OPTIONS"
        @mount="handleMount" @change="handleChange" />
    </div>
    <div class="bg-base-200 w-full text-sm p-1 px-4 flex flex-row justify-between">
      <span>
        Right-click or press <kbd class="kbd kbd-sm">F1</kbd> to show the Command Palette
      </span>
      <span>
        {{ cursorPos }} {{ selectedAmount }}
      </span>
    </div>
    <div class="my-5 text-white" v-if="error.length > 0">
      <span class="mb-5 ml-5" v-html="error"></span>
    </div>
  </div>
</template>

<style scoped></style>
