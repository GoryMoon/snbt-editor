
export function slashEscape(contents: string) {
    return contents
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}

const replacements = new Map<string, string>([['\\\\', '\\'], ['\\n', '\n'], ['\\"', '"']]);

export function slashUnescape(contents: string) {
    return contents.replace(/\\(\\|n|")/g, function (replace): string {
        return replacements.get(replace) ?? '';
    });
}