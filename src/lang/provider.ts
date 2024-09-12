import type * as monaco from 'monaco-editor';
type Monaco = typeof monaco;

import type { IGrammar, StateStack, IOnigLib, IGrammarConfiguration } from 'vscode-textmate';
import { INITIAL, Registry, parseRawGrammar } from 'vscode-textmate';
// @ts-ignore
import { generateTokensCSSForColorMap } from 'monaco-editor/esm/vs/editor/common/languages/supports/tokenization';
// @ts-ignore
import { TokenizationRegistry } from 'monaco-editor/esm/vs/editor/common/languages';
// @ts-ignore
import { Color } from 'monaco-editor/esm/vs/base/common/color';

import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

import wasmModule from 'vscode-oniguruma/release/onig.wasm?url'
import snbtTmLang from '../assets/snbt.tmLanguage.json?raw'
import conf from './languageConfig'
import vsDarkCpp from './vs_dark_cpp';

const landScopeName = 'source.snbt'
const langId = 'snbt'

export type LanguageProviderConfig = {
    monaco: Monaco
}

export class SimpleLanguageProvider {
    private monaco: Monaco
    private registry: Registry

    constructor(config: LanguageProviderConfig) {
        const { monaco } = config
        this.monaco = monaco

        const wasmBin = loadVSCodeOnigurumWASM()
            .then((data) => loadWASM(data))
            .then((): IOnigLib => {
                return {
                    createOnigScanner(patterns: string[]) { return new OnigScanner(patterns) },
                    createOnigString(s: string) { return new OnigString(s) }
                }
            })

        this.registry = new Registry({
            onigLib: wasmBin,
            loadGrammar(scopeName) {
                if (scopeName === landScopeName) {
                    return Promise.resolve(parseRawGrammar(snbtTmLang, 'lang.json'))
                }
                return Promise.resolve(null)
            },
            theme: vsDarkCpp
        })
    }

    async register() {
        this.monaco.languages.register({ id: langId })
        const encodedLangId = this.monaco.languages.getEncodedLanguageId(langId)

        const grammarConfiguration: IGrammarConfiguration = {
            balancedBracketSelectors: ['*'],
            unbalancedBracketSelectors: []
        };
        const grammar = await this.registry.loadGrammarWithConfiguration(landScopeName, encodedLangId, grammarConfiguration)
            .then((grammer: IGrammar | null) => {
                if (grammer)
                    return grammer
                else
                    throw Error(`failed to load grammar for ${landScopeName}`)
            })

        this.monaco.languages.setTokensProvider(langId, {
            getInitialState() {
                return INITIAL
            },
            tokenizeEncoded(line, state) {
                const result = grammar.tokenizeLine2(line, state as StateStack)
                const { tokens, ruleStack: endState } = result
                return { tokens, endState }
            },
        })
        this.monaco.languages.setLanguageConfiguration(langId, conf)
    }

    injectCss() {
        const cssColors = this.registry.getColorMap()
        const colorMap = cssColors.map(Color.Format.CSS.parseHex);

        TokenizationRegistry.setColorMap(colorMap)
        const css = generateTokensCSSForColorMap(colorMap)
        const style = document.createElement('style');
        style.innerHTML = css;

        const monacoColors = document.querySelector('.monaco-colors');
        if (monacoColors)
            monacoColors.parentElement?.insertBefore(style, monacoColors.nextSibling);
    }
}

// Taken from https://github.com/microsoft/vscode/blob/829230a5a83768a3494ebbc61144e7cde9105c73/src/vs/workbench/services/textMate/browser/textMateService.ts#L33-L40
async function loadVSCodeOnigurumWASM(): Promise<Response | ArrayBuffer> {
    const response = await fetch(wasmModule);
    const contentType = response.headers.get('content-type');
    if (contentType === 'application/wasm') {
        return response;
    }

    // Using the response directly only works if the server sets the MIME type 'application/wasm'.
    // Otherwise, a TypeError is thrown when using the streaming compiler.
    // We therefore use the non-streaming compiler :(.
    return await response.arrayBuffer();
}