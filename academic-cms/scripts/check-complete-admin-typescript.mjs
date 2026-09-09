import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const candidates = [
  resolve(root, 'node_modules/typescript/lib/typescript.js'),
  '/usr/local/lib/node_modules/typescript/lib/typescript.js',
  '/usr/lib/node_modules/typescript/lib/typescript.js',
]
const compilerPath = candidates.find(existsSync)
if (!compilerPath) {
  console.log(JSON.stringify({ status: 'blocked', reason: 'typescript-compiler-unavailable' }))
  process.exit(2)
}
const importedTypeScript = await import(pathToFileURL(compilerPath).href)
const ts = importedTypeScript.default ?? importedTypeScript
const files = []
async function walk(dir) {
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) await walk(rel)
    else if (entry.isFile() && /\.(?:ts|vue)$/.test(entry.name) && (
      rel.includes('/complete-admin/') || rel.includes('/admin/complete/') || rel.includes('/pages/admin/')
    )) files.push(rel)
  }
}
for (const dir of ['server', 'app']) await walk(dir)
const errors = []
for (const file of files) {
  let source = await readFile(resolve(root, file), 'utf8')
  if (file.endsWith('.vue')) {
    const blocks = [...source.matchAll(/<script(?:\s+setup)?[^>]*>([\s\S]*?)<\/script>/gi)]
    source = blocks.map(match => match[1]).join('\n')
  }
  const result = ts.transpileModule(source, {
    fileName: file.endsWith('.vue') ? `${file}.ts` : file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
    },
    reportDiagnostics: true,
  })
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    errors.push({ file, code: diagnostic.code, message })
  }
}
console.log(JSON.stringify({ status: errors.length ? 'failed' : 'passed', files: files.length, errors }, null, 2))
process.exit(errors.length ? 1 : 0)
