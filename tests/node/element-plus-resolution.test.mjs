import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc'

const appRoot = resolve(import.meta.dirname, '../../app')

test('every Element Plus template component resolves to an explicit setup binding', async () => {
  const files = (await readdir(appRoot, { recursive: true })).filter(file => file.endsWith('.vue'))
  assert.ok(files.length > 100, 'expected the complete application SFC tree')
  for (const file of files) {
    const filename = resolve(appRoot, file)
    const source = await readFile(filename, 'utf8')
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [], `${file} must parse as a Vue SFC`)
    if (!descriptor.template) continue
    const bindings = descriptor.scriptSetup ? compileScript(descriptor, { id: `element-plus-${file}` }).bindings : {}
    const template = compileTemplate({
      source: descriptor.template.content,
      filename,
      id: `element-plus-${file}`,
      compilerOptions: { bindingMetadata: bindings },
    })
    assert.deepEqual(template.errors, [], `${file} template must compile`)
    const unresolved = [...template.code.matchAll(/resolveComponent\("(El[A-Z][A-Za-z0-9]*)"\)/gu)].map(match => match[1])
    assert.deepEqual(unresolved, [], `${file} has unresolved Element Plus components: ${unresolved.join(', ')}`)
  }
})
