import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
export type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist'

let library: Promise<typeof import('pdfjs-dist')> | undefined
export function loadPdfLibrary() {
  library ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([pdf, worker]) => {
    pdf.GlobalWorkerOptions.workerSrc = worker.default
    return pdf
  }).catch(error => { library = undefined; throw error })
  return library
}
export async function openPdfDocument(src: string): Promise<PDFDocumentLoadingTask> {
  const pdf = await loadPdfLibrary()
  return pdf.getDocument({ url: src, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65_536,
    useWasm: false, disableFontFace: true,
    cMapUrl: '/pdfjs/6.3.289/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/6.3.289/standard_fonts/',
  })
}
