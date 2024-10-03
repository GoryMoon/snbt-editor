<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import monacoEditor from 'monaco-editor/esm/vs/editor/editor.api'
import { ref, shallowRef, useTemplateRef } from 'vue'
import { parse, stringify } from 'nbtify'
import { debounce } from 'remeda';

import githubLogo from './assets/github.png'
import { slashEscape, slashUnescape } from './utils';
import { SimpleLanguageProvider } from './lang/provider';
import Code from './component/Code.vue';

const MONACO_EDITOR_OPTIONS: monacoEditor.editor.IStandaloneEditorConstructionOptions = {
  autoIndent: 'advanced',
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoSurround: 'languageDefined',
  automaticLayout: true,
  fontLigatures: true,
  guides: {
    bracketPairs: 'active'
  },
  minimap: {
    enabled: false,
  },
  padding: {
    top: 5
  },
  bracketPairColorization: {
    enabled: true
  }
}

const code = ref("{}")
const error = ref("")
const cursorPos = ref("Ln 1, Col 1")
const selectedAmount = ref("")
const menuItems = ref([
  { name: 'Unescape and Format', action: unescapeCode },
  { name: 'Format SNBT', action: formatCode },
  { name: 'Minify SNBT', action: minifyCode },
  { name: 'Minify and Escape', action: escapeCode },
  { name: '?', action: showHelp }
])
const helpModalRef = useTemplateRef('help-modal')

const monacoRef = shallowRef<typeof monacoEditor>()
const editorRef = shallowRef<monacoEditor.editor.IStandaloneCodeEditor>()

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
    if (typeof e === 'string')
      error.value = e
    else if (e instanceof Error && !formatError(input, e)) {
      error.value = e.message
    }
  }
  return false;
}

function formatError(data: string, e: Error) {
  if (monacoRef.value === undefined || editorRef.value === undefined) return false
  const model = editorRef.value.getModel()
  if (model == null) return false

  const match = e.message.match(/^Unexpected character (.+) at position (\d*)$/)
  if (match !== null) {
    const preData = data.substring(0, parseInt(match[2]))
    const row = preData.split('\n').length
    const col = parseInt(match[2]) - preData.substring(0, preData.lastIndexOf('\n')).length + 1
    error.value = `Unexpected <span class="bg-base-300 py-1 px-2 rounded text-sm">${match[1]}</span> at (${row}:${col})`

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
    return true
  }
  return false
}

const debouncedChange = debounce((data: string) => {
  if (monacoRef.value === undefined || editorRef.value === undefined) return

  const model = editorRef.value.getModel()
  if (model == null) return

  try {
    parse(data)
  } catch (e) {
    if (e instanceof Error) {
      formatError(data, e)
      return
    }
  }

  clearErrors()
  monacoRef.value.editor.setModelMarkers(model, 'owner', [])
}, { waitMs: 300 })

function handleChange(data: string) {
  debouncedChange.call(data)
}

async function handleBeforeMount(monaco: typeof monacoEditor) {
  const languageProvider = new SimpleLanguageProvider({ monaco })
  await languageProvider.register()
  languageProvider.injectCss()
}

function handleMount(editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) {

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
    label: 'Minfiy SNBT',
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

function showHelp() {
  helpModalRef.value?.showModal()
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
            <li v-for="item in menuItems" class="py-2"><a @click="item.action">{{ item.name }}</a></li>
          </ul>
        </div>
        <span>SNBT Editor</span>
      </div>
      <div class="navbar-center hidden lg:flex">
        <ul class="menu menu-horizontal px-1">
          <li v-for="item in menuItems"><a @click="item.action">{{ item.name }}</a></li>
        </ul>
      </div>
      <div class="navbar-end">
        <a class="btn btn-ghost" target="_blank" href="https://github.com/GoryMoon/snbt-editor">
          <img height="30" width="30" :src="githubLogo" alt="Github logo">
        </a>
      </div>
    </div>
    <div class="flex-auto min-h-0">
      <VueMonacoEditor language="snbt" v-model:value="code" theme="vs-dark" :options="MONACO_EDITOR_OPTIONS"
        @beforeMount="handleBeforeMount" @mount="handleMount" @change="handleChange" />
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
  <dialog ref="help-modal" class="modal">
    <div class="modal-box w-11/12 max-w-4xl">
      <form method="dialog">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
      </form>
      <h3 class="text-2xl font-bold">SNBT Editor Help</h3>
      <p class="pt-4 px-2">
        This tool helps for reading and editing <a class="link" target="_blank" href="https://minecraft.wiki/w/NBT_format#SNBT_format">SNBT</a> data. Either as an escaped string or raw data.<br>
        Just past the string <Code>""</Code> or  data <Code>{}</Code>/<Code>[]</Code> directly into the editor and press on of the buttons to modify it.<br>
      </p>
      <p class="py-4 px-2">
        This editor has a subset of features that <a class="link" target="_blank" href="https://code.visualstudio.com/">Visual Studio Code</a> has, this can be seen when using some features like the <b>Command Pallete</b>,
        right-clicking, pressing <kbd class="kbd kbd-sm ">F1</kbd> or <kbd class="kbd kbd-sm">Ctrl + F</kbd><br>
        The buttons at the top is also available as right-click actions.
      </p>
      <div class="divider my-0"></div>
      <h4 class="font-bold">Unescape and Format</h4>
      <p class="p-4">
        Use this if your input data is a string, like: <Code>"{item:\"minecraft:stone\"}</Code><br>
        This button first unescapes the string (removes the first and last <Code>"</Code> and all relevant <Code>\</Code>), it then formats the data so it's east to read and edit.
      </p>
      <div class="divider my-0"></div>
      <h4 class="font-bold">Format</h4>
      <p class="p-4">
        Use this if your input data is unescaped, like: <Code>{item:"minecraft:stone"}</Code><br>
        This button formats any valid SNBT string so it's east to read and edit.
      </p>
      <div class="divider my-0"></div>
      <h4 class="font-bold">Minify</h4>
      <p class="p-4">
        This button just minifies the current data in the editor, this us useful when you to use it elsewhere, it often needs to be minified so it fits on one line.
      </p>
      <div class="divider my-0"></div>
      <h4 class="font-bold">Minify and Escape</h4>
      <p class="p-4">
        This button does the same as the other minify button but in addition it also escapes all <Code>"</Code>, <Code>\</Code> and newlines, it also adds <Code>"</Code> at the start and end of the string.
      </p>

      <div class="divider my-0"></div>
      <p>
        This tool uses the <a class="link" target="_blank" href="https://github.com/Offroaders123/NBTify">NBTify</a> tool by <a class="link" target="_blank" href="https://github.com/Offroaders123">Offroaders123</a> to format and minify.<br>
        Made by <a class="link" target="_blank" href="https://github.com/GoryMoon">GoryMoon</a>
      </p>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
</template>

<style scoped>

</style>
