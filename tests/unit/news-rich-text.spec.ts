// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/vue-3'
import { newsRichTextExtensions } from '../../app/components/admin/complete/news-rich-text-extensions'
import { newsEditorInitialContent, newsEditorReturnPath, newsListReturnPath } from '../../app/admin/news-rich-text'
import { renderRichTextDocument, validateRichTextDocument } from '../../shared/complete-admin/core.mjs'

const editors: Editor[] = []
function open(content: ReturnType<typeof newsEditorInitialContent>) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, extensions: newsRichTextExtensions(), content })
  editors.push(editor)
  return editor
}
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); document.body.replaceChildren() })

describe('news editor source and return state', () => {
  it('imports plain text literally, retaining line breaks, blank lines and angle brackets', () => {
    const source = '第一行 <b>不是 HTML</b> & text\n\n第三行'
    const editor = open(newsEditorInitialContent(source, 'plain'))
    expect(editor.getJSON().content).toHaveLength(3)
    expect(editor.getText({ blockSeparator: '\n' })).toBe(source)
    expect(renderRichTextDocument(editor.getJSON())).toContain('&lt;b&gt;不是 HTML&lt;/b&gt; &amp; text')
  })
  it('keeps Markdown source text intact instead of interpreting embedded HTML', () => {
    const source = '## 标题\n**正文** <tag>\n- 条目'
    expect(open(newsEditorInitialContent(source, 'markdown')).getText({ blockSeparator: '\n' })).toBe(source)
  })
  it('preserves the selected record and filters; deletion returns to the list', () => {
    const path = '/admin/news?page=3&q=%E6%B5%8B%E8%AF%95&f_visibility=hidden&edit=news%3Ademo'
    expect(newsEditorReturnPath(path)).toBe(path)
    expect(newsListReturnPath(path)).toBe('/admin/news?page=3&q=%E6%B5%8B%E8%AF%95&f_visibility=hidden')
  })
  it.each(['https://evil.example', '//evil.example', '/admin/news/../auth', '/admin/newsletter', '/admin/news\\evil', null])('rejects an unrelated return destination: %s', value => {
    expect(newsEditorReturnPath(value)).toBe('/admin/news')
  })
})

describe('real Tiptap → server renderer → Tiptap round trip', () => {
  it.each(['center', 'right', 'justify'])('retains %s paragraphs and headings across repeated saves', alignment => {
    const source = `<h2 class="rich-align-${alignment}">标题</h2><p class="rich-align-${alignment}">正文</p>`
    const first = open(source)
    const expected = validateRichTextDocument(first.getJSON())
    for (const node of first.getJSON().content ?? []) expect(node.attrs?.textAlign).toBe(alignment)
    let html = renderRichTextDocument(first.getJSON())
    for (let repeat = 0; repeat < 3; repeat++) {
      const reopened = open(html)
      expect(validateRichTextDocument(reopened.getJSON())).toEqual(expected)
      html = renderRichTextDocument(reopened.getJSON())
    }
  })
  it('retains headings, nested lists, marks, links, code and image layouts', () => {
    const source = '<h3>标题</h3><ul><li><p>条目</p><ol><li><p>子项</p></li></ol></li></ul>'
      + '<p><strong>粗体</strong><em>斜体</em><u>下划线</u><s>删除线</s><a href="https://example.com/paper">论文</a></p>'
      + '<blockquote><p>引用</p></blockquote><pre><code>a &lt; b\n  c</code></pre><hr>'
      + ['none', 'left', 'right', 'center', 'wide'].map(layout => `<figure class="rich-image-${layout}"><img src="/media/uploads/demo.png" data-object-key="uploads/demo.png" alt="说明"></figure>`).join('')
    const first = open(source)
    const saved = renderRichTextDocument(first.getJSON())
    const reopened = open(saved)
    expect(validateRichTextDocument(reopened.getJSON())).toEqual(validateRichTextDocument(first.getJSON()))
    expect(renderRichTextDocument(reopened.getJSON())).toBe(saved)
    expect(saved).toContain('<ul>')
    expect(saved).toContain('<ol>')
    for (const layout of ['none', 'left', 'right', 'center', 'wide']) expect(saved).toContain(`rich-image-${layout}`)
  })
  it('does not register duplicate extensions, and preserves undo after serialization', () => {
    const editor = open('<p>原文</p>')
    const names = editor.extensionManager.extensions.map(extension => extension.name)
    expect(new Set(names).size).toBe(names.length)
    editor.commands.setTextSelection(3)
    editor.commands.insertContent('修改')
    expect(renderRichTextDocument(editor.getJSON())).toContain('修改')
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('原文')
  })
})

it('preserves managed PDF nodes alongside rich text across repeated saves', () => {
  let html = '<h2>附件正文</h2><figure data-type="pdf" data-object-key="uploads/report.pdf" data-title="研究报告"></figure><p>后续说明</p>'
  for (let pass = 0; pass < 3; pass++) {
    const editor = open(html)
    const node = editor.getJSON().content?.find(item => item.type === 'pdf')
    expect(node?.attrs).toMatchObject({ objectKey: 'uploads/report.pdf', title: '研究报告' })
    html = renderRichTextDocument(editor.getJSON())
    expect(html).toContain('data-object-key="uploads/report.pdf"')
    expect(html).not.toContain('<iframe')
    expect(html).toContain('<p>后续说明</p>')
  }
})
