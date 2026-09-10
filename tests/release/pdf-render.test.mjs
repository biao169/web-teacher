import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pdfFixture } from '../helpers/pdf-fixture.mjs'
const require = createRequire(import.meta.url)
const packagePath = require.resolve('pdfjs-dist/package.json')
const canvas = createRequire(packagePath)('@napi-rs/canvas')
for (const name of ['DOMMatrix', 'Path2D', 'ImageData']) globalThis[name] ??= canvas[name]
test('actual PDF.js renders two mixed-size pages with selectable text using CSP-compatible options', async () => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(pdfFixture()), useWasm: false, disableFontFace: true, standardFontDataUrl: resolve(dirname(packagePath), 'standard_fonts') + '/' })
  try {
    const doc = await task.promise
    assert.equal(doc.numPages, 2)
    for (const number of [1, 2]) {
      const page = await doc.getPage(number), viewport = page.getViewport({ scale: .5 })
      assert.equal(viewport.width < viewport.height, number === 1)
      const target = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      await page.render({ canvas: target, viewport }).promise
      const pixels = target.getContext('2d').getImageData(0, 0, target.width, target.height).data
      assert.ok(pixels.some((value, index) => index % 4 !== 3 && value < 100), 'Rendered text has non-white pixels')
      assert.ok((await page.getTextContent()).items.some(item => item.str?.includes(number === 1 ? 'First PDF page' : 'Second PDF page')))
      page.cleanup()
    }
  } finally { await task.destroy() }
})
