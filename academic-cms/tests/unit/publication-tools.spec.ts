import { describe, expect, it } from 'vitest'
import {
  generatePublicationCitations,
  normalizePublicationDoi,
  parsePublicationCitation,
  publicationTitleSimilarity,
} from '../../shared/admin/publication-tools'

describe('publication citation tools', () => {
  it('normalizes DOI URLs and terminal punctuation', () => {
    expect(normalizePublicationDoi('https://doi.org/10.1145/ABC.123).')).toBe('10.1145/abc.123')
  })

  it('parses common IEEE fields', () => {
    const result = parsePublicationCitation('[1] J. Smith and A. Doe, "A reliable edge system," IEEE Transactions on Systems, vol. 12, no. 3, pp. 10-20, 2025, doi: 10.1000/XYZ.1.')
    expect(result.format).toBe('ieee')
    expect(result.fields).toMatchObject({
      title: 'A reliable edge system',
      venue: 'IEEE Transactions on Systems',
      year: 2025,
      volume: '12',
      issue: '3',
      pages: '10-20',
      doi: '10.1000/xyz.1',
    })
  })

  it('parses APA author, year, title and journal structure', () => {
    const result = parsePublicationCitation('Smith, J., & Doe, A. (2024). A useful paper. Journal of Tests, 9(2), 44-50. https://doi.org/10.1000/APA.1')
    expect(result.format).toBe('apa')
    expect(result.fields).toMatchObject({
      authors: 'Smith, J., & Doe, A',
      year: 2024,
      title: 'A useful paper',
      venue: 'Journal of Tests',
      volume: '9',
      issue: '2',
      pages: '44-50',
      doi: '10.1000/apa.1',
    })
  })

  it('parses GB/T 7714 fields with Chinese punctuation', () => {
    const result = parsePublicationCitation('张三, 李四. 可信系统研究[J]. 计算机学报, 2023, 46(2): 100-110. DOI:10.1000/GBT.1')
    expect(result.format).toBe('gbt')
    expect(result.fields).toMatchObject({
      authors: '张三, 李四',
      title: '可信系统研究',
      venue: '计算机学报',
      year: 2023,
      volume: '46',
      issue: '2',
      pages: '100-110',
      publication_type: '期刊论文',
    })
  })

  it('parses Elsevier-style journal metadata', () => {
    const result = parsePublicationCitation('J. Smith, A. Doe. Reliable edge systems. Journal of Computing, 18 (2023) 101-112. doi:10.1000/ELS.1')
    expect(result.format).toBe('elsevier')
    expect(result.fields.title).toBe('Reliable edge systems')
    expect(result.fields.venue).toBe('Journal of Computing')
    expect(result.fields.year).toBe(2023)
    expect(result.fields.doi).toBe('10.1000/els.1')
  })

  it('parses BibTeX without changing the stored source text', () => {
    const source = '@article{x, title={Example Paper}, author={Doe, Jane and Smith, John}, journal={Test Journal}, year={2022}, volume={3}, number={1}, pages={1--9}, doi={10.1000/BIB.1}}'
    const result = parsePublicationCitation(source)
    expect(result.format).toBe('bibtex')
    expect(result.fields).toMatchObject({
      title: 'Example Paper',
      authors: 'Doe, Jane; Smith, John',
      venue: 'Test Journal',
      year: 2022,
      volume: '3',
      issue: '1',
      pages: '1-9',
      doi: '10.1000/bib.1',
    })
  })

  it('scores exact and unrelated titles safely', () => {
    expect(publicationTitleSimilarity('A Reliable Edge System', 'A reliable edge system')).toBe(1)
    expect(publicationTitleSimilarity('Quantum optics', 'Medieval history')).toBeLessThan(0.25)
  })

  it('generates four citation styles, BibTeX and homepage-teacher highlights', () => {
    const result = generatePublicationCitations({
      uid: 'publication-edge-2025',
      title: 'A Reliable Edge System',
      authors: 'San Zhang; John Doe',
      venue: 'IEEE Transactions on Systems',
      year: 2025,
      volume: '12',
      issue: '3',
      pages: '10-20',
      doi: 'https://doi.org/10.1000/EDGE.1',
      publication_type: '期刊论文',
    }, ['张三', 'San Zhang'])
    expect(result.fields.citation_gbt).toContain('A Reliable Edge System[J].')
    expect(result.fields.citation_elsevier).toContain('https://doi.org/10.1000/edge.1')
    expect(result.fields.citation_apa).toContain('Zhang, S.')
    expect(result.fields.citation_ieee).toContain('vol. 12, no. 3, pp. 10-20, 2025')
    expect(result.fields.bibtex).toContain('@article{publication-edge-2025,')
    expect(result.fields.highlight_gbt).toBe('San Zhang')
    expect(result.fields.highlight_apa).toBe('Zhang, S.')
    expect(result.matchedProfileNames).toEqual(['San Zhang'])
  })

  it('formats Latin author names independently for IEEE, APA, Elsevier and GB/T 7714-2025', () => {
    const result = generatePublicationCitations({
      title: 'A Reliable Edge System', authors: 'John Michael Smith; Alice B Doe; Carol White; David Black',
      venue: 'Journal of Tests', year: 2025, volume: '12', issue: '3', pages: '10-20', doi: '10.1000/example', publication_type: '期刊论文',
    })
    expect(result.fields.citation_ieee).toBe('J. M. Smith, A. B. Doe, C. White, and D. Black, “A Reliable Edge System,” Journal of Tests, vol. 12, no. 3, pp. 10-20, 2025. doi: 10.1000/example.')
    expect(result.fields.citation_apa).toBe('Smith, J. M., Doe, A. B., White, C., & Black, D. (2025). A Reliable Edge System. Journal of Tests, 12(3), 10-20. https://doi.org/10.1000/example')
    expect(result.fields.citation_elsevier).toBe('Smith, J.M., Doe, A.B., White, C., Black, D. A Reliable Edge System. Journal of Tests, 12 (2025), 10-20. https://doi.org/10.1000/example')
    expect(result.fields.citation_gbt).toBe('John Michael Smith, Alice B Doe, Carol White, et al. A Reliable Edge System[J]. Journal of Tests, 2025, 12(3): 10-20. DOI: 10.1000/example.')
  })

  it('warns when the homepage teacher does not match an author', () => {
    const result = generatePublicationCitations({ title: 'Example', authors: 'Jane Doe', year: 2024 }, ['San Zhang'])
    expect(result.fields.highlight_ieee).toBe('')
    expect(result.warnings).toContain('当前作者列表中未匹配到主页教师的中英文姓名，请核对作者写法。')
  })
})
