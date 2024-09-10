<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor';
import monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import { ref, shallowRef } from 'vue';
import { parse, stringify } from "nbtify";
import { LanguageProvider, ThemeProvider } from 'monaco-textmate-provider';


const MONACO_EDITOR_OPTIONS: monacoEditor.editor.IStandaloneDiffEditorConstructionOptions = {
  automaticLayout: true,
  formatOnType: true,
  formatOnPaste: true,
  minimap: {
    enabled: false,
  }
}

const code = ref("[{}]")
const errors = ref<string[]>(["", "", "", ""])

function pushError(err: unknown) {
  let toAdd: string = ''

  if (typeof err === 'string')
    toAdd = err
  else if (err instanceof Error)
    toAdd = err.message

  if (toAdd.length <= 0) return

  if (errors.value.length >= 4) errors.value.pop()

  errors.value.unshift(toAdd)
}

function clearErrors() {
  errors.value = ["", "", "", ""]
}

function formatString(input: string, minify: boolean) {
  try {
    const parsed = parse(input)
    const result = stringify(parsed, { space: minify ? 0 : 4 })
    clearErrors()
    return result
  } catch (e) {
    pushError(e)
  }
  return false;
}

const editorRef = shallowRef<monacoEditor.editor.IStandaloneCodeEditor>()
const handleMount = async (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) => {
  monaco.languages.register({ id: 'greyscript' });
  monaco.languages.register({
    id: 'snbt',
    aliases: [
      'S-NBT',
      'snbt'
    ]
  })
  const languageProvider = new LanguageProvider({
    monaco: monaco,
    wasm: new URL('https://unpkg.com/vscode-oniguruma@2.0.1/release/onig.wasm'),
    grammarSourceMap: {
      greyscript: {
        scopeName: 'source.src',
        tmLanguageFile: new URL(
          'https://unpkg.com/greyscript-textmate@1.0.6/dist/greyscript.tmLanguage.json'
        ),
        languageConfigurationFile: new URL(
          'https://unpkg.com/greyscript-textmate@1.0.6/dist/greyscriptLanguageConfig.json'
        )
      },
      snbt: {
        scopeName: 'source.snbt',
        tmLanguageFile: new URL('/snbt.tmLanguage.json', import.meta.url),
        languageConfigurationFile: new URL('/snbt.languageConfig.json', import.meta.url),
      },
    },
  });

  const themeProvider = new ThemeProvider({
    monaco: monaco,
    registry: await languageProvider.getRegistry(),
    themeSources: {
      default: new URL('/dark-plus-syntax-color-theme.json', import.meta.url)
    }
  });

  await themeProvider.setTheme('default')

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
    run(editor, ..._args) {

      const model = editor.getModel();
      if (model == null) return

      const res = formatString(model.getValue(), true)
      if (res !== false) {
        editor.getModel()?.setValue(res)
      }
    },
  })

  function slashEscape(contents: string) {
    return contents
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  const replacements = new Map<string, string>([['\\\\', '\\'], ['\\n', '\n'], ['\\"', '"']]);

  function slashUnescape(contents: string) {
    return contents.replace(/\\(\\|n|")/g, function (replace): string {
      return replacements.get(replace) ?? '';
    });
  }

  editor.addAction({
    id: 'editor.action.escapeString',
    label: 'Escape string',
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
    label: 'Unescape string',
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

  return (editorRef.value = editor);
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
  <div class="flex flex-col h-full max-h-full">
    <div class="p-5 flex grow-0 shrink justify-center">
      <button class="btn mx-5" @click="unescapeCode">Unescape and Format</button>
      <button class="btn mx-5" @click="formatCode">Format SNBT</button>
      <button class="btn mx-5" @click="minifyCode">Minify SNBT</button>
      <button class="btn mx-5" @click="escapeCode">Minfiy and Escape</button>
    </div>
    <div class="flex-auto">
      <VueMonacoEditor language="snbt" v-model:value="code" theme="vs-dark" :options="MONACO_EDITOR_OPTIONS"
        @mount="handleMount" />
    </div>
    <div class="m-5 flex-none text-white">
      <span v-for="(error, index) in errors" :key="index">{{ error }}<br /></span>
    </div>
  </div>
</template>

<style scoped></style>
