import { describe, expect, it } from 'vitest'
import { splitHighlightedText } from '../../shared/utils/text-highlight'

describe('safe text highlighting', () => {
  it('matches the longest name first and preserves original text', () => {
    const segments = splitHighlightedText('San Zhang and Zhang', ['Zhang', 'San Zhang'])
    expect(segments).toEqual([
      { text: 'San Zhang', highlighted: true },
      { text: ' and ', highlighted: false },
      { text: 'Zhang', highlighted: true },
    ])
    expect(segments.map(item => item.text).join('')).toBe('San Zhang and Zhang')
  })

  it('matches Latin names case-insensitively only at word boundaries', () => {
    const segments = splitHighlightedText('Reliability by LI is high.', ['Li'])
    expect(segments.filter(item => item.highlighted).map(item => item.text)).toEqual(['LI'])
  })

  it('treats markup-shaped source as plain text segments', () => {
    const segments = splitHighlightedText('<img src=x onerror=alert(1)> 张三', ['张三'])
    expect(segments.map(item => item.text).join('')).toBe('<img src=x onerror=alert(1)> 张三')
    expect(segments.at(-1)).toEqual({ text: '张三', highlighted: true })
  })
})

describe('citation name boundaries and exact source preservation', () => {
  it('keeps APA initials and surname together rather than highlighting isolated letters', () => {
    const text = 'Zhang, M., Li, H. Title M. in Journal. Zhang, M.*'
    const segments = splitHighlightedText(text, ['Zhang, M.'])
    expect(segments.filter(item => item.highlighted).map(item => item.text)).toEqual(['Zhang, M.', 'Zhang, M.'])
    expect(segments.map(item => item.text).join('')).toBe(text)
  })
  it('does not match inside hyphenated names, apostrophes, identifiers or longer words', () => {
    const text = "Liang Li-Wei O’Li Li2 x_Li Li. Jean-Luc Picard and Jean-Luc Picardy"
    const segments = splitHighlightedText(text, ['Li', 'Jean-Luc Picard'])
    expect(segments.filter(item => item.highlighted).map(item => item.text)).toEqual(['Li', 'Jean-Luc Picard'])
  })
  it('retains original decomposed accents, spaces and punctuation when matching canonical names', () => {
    const text = '[3]  Jose\u0301 García*, 张三; DOI:10.1/A–B.\nEnd.'
    const segments = splitHighlightedText(text, ['José García', '张三'])
    expect(segments.filter(item => item.highlighted).map(item => item.text)).toEqual(['Jose\u0301 García', '张三'])
    expect(segments.map(item => item.text).join('')).toBe(text)
  })
  it('does not shift offsets after Unicode case transformations and never adds a star', () => {
    const text = 'İstanbul. LI, J.-L. Smith* and Smith.'
    const segments = splitHighlightedText(text, ['Li', 'J.-L. Smith'])
    expect(segments.filter(item => item.highlighted).map(item => item.text)).toEqual(['LI','J.-L. Smith'])
    expect(segments.map(item => item.text).join('')).toBe(text)
  })
})
