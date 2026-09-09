/** Small valid, two-page PDF with deterministic cross references and mixed page sizes. */
export function pdfFixture() {
  const contents = ['BT /F1 18 Tf 40 760 Td (First PDF page) Tj ET', 'BT /F1 18 Tf 40 500 Td (Second PDF page) Tj ET']
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...contents.map(content => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`),
  ]
  let output = '%PDF-1.7\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n` }
  // Padding forces the range transport path while leaving the page streams tiny.
  output += ('%' + 'padding '.repeat(100) + '\n').repeat(170)
  const xref = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(output)
}
