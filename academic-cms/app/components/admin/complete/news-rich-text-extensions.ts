import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { Node } from '@tiptap/vue-3'

const ManagedPdf = Node.create({
  name: 'pdf', group: 'block', atom: true, draggable: true,
  addAttributes() {
    return {
      objectKey: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-object-key') },
      title: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-title') ?? '' },
    }
  },
  parseHTML() { return [{ tag: 'figure[data-type="pdf"][data-object-key]' }] },
  renderHTML({ node }) { return ['figure', { 'data-type': 'pdf', 'data-object-key': node.attrs.objectKey, 'data-title': node.attrs.title }, `PDF · ${node.attrs.title || '文档'}`] },
})

/** Read both canonical stored classes and Tiptap's editing-time inline styles. */
const StoredTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        textAlign: {
          default: this.options.defaultAlignment,
          parseHTML: (element: HTMLElement) => {
            const stored = this.options.alignments.find(value => element.classList.contains(`rich-align-${value}`))
            const inline = element.style.textAlign
            return stored ?? (this.options.alignments.includes(inline) ? inline : this.options.defaultAlignment)
          },
          renderHTML: (attributes: Record<string, unknown>) => attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {},
        },
      },
    }]
  },
})

const ManagedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      objectKey: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-object-key'), renderHTML: (attributes: Record<string, unknown>) => attributes.objectKey ? { 'data-object-key': attributes.objectKey } : {} },
      alt: { default: '' },
      float: { default: 'none', parseHTML: (element: HTMLElement) => element.closest('figure')?.className.match(/rich-image-(none|left|right|center|wide)/u)?.[1] || element.getAttribute('data-float') || 'none', renderHTML: (attributes: Record<string, unknown>) => ({ 'data-float': attributes.float || 'none' }) },
    }
  },
})

/** Lazy-loaded by the editor, and shared with the real parser round-trip tests. */
export function newsRichTextExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false, underline: false, trailingNode: false }),
    Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
    Underline,
    StoredTextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    ManagedImage.configure({ allowBase64: false, inline: false }),
    ManagedPdf,
  ]
}
