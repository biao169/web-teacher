import { describe, expect, it } from 'vitest'
import {
  dataCiteResult,
  europePmcResult,
  openAlexResult,
  pubmedSummaryResult,
} from '../../server/services/complete-admin/metadata-service'

describe('publication metadata provider adapters', () => {
  it('maps explicit OpenAlex corresponding authors without guessing', () => {
    const result = openAlexResult({
      title: 'Reliable Systems', publication_year: 2025, doi: 'https://doi.org/10.1000/OPEN.1',
      authorships: [
        { is_corresponding: false, author: { display_name: 'Alice Doe' } },
        { is_corresponding: true, author: { display_name: 'John Smith' } },
      ],
      primary_location: { source: { display_name: 'Test Journal' }, landing_page_url: 'https://example.test/paper' },
      biblio: { volume: '2', issue: '1', first_page: '10', last_page: '20' },
    }, { mode: 'doi', value: '10.1000/open.1' })
    expect(result.fields.authors).toBe('Alice Doe; John Smith')
    expect(result.fields.corresponding_authors).toBe('John Smith')
  })

  it('maps DataCite creator and ContactPerson metadata', () => {
    const result = dataCiteResult({ data: { id: '10.1000/data.1', attributes: {
      doi: '10.1000/data.1', titles: [{ title: 'Open Dataset Paper' }], publicationYear: 2024,
      creators: [{ givenName: 'Alice', familyName: 'Doe' }],
      contributors: [{ name: 'John Smith', contributorType: 'ContactPerson' }],
      container: { title: 'Data Journal' }, types: { resourceTypeGeneral: 'JournalArticle' },
    } } }, { mode: 'doi', value: '10.1000/data.1' })
    expect(result.fields).toMatchObject({ title: 'Open Dataset Paper', authors: 'Alice Doe', corresponding_authors: 'John Smith', venue: 'Data Journal' })
  })

  it('maps Europe PMC core metadata', () => {
    const result = europePmcResult({ resultList: { result: [{
      title: 'Medical Paper', doi: '10.1000/med.1', pubYear: '2023', journalTitle: 'Medical Journal',
      authorList: { author: [{ fullName: 'Jane Doe' }] }, journalVolume: '8', issue: '2', pageInfo: '12-19',
    }] } }, { mode: 'doi', value: '10.1000/med.1' })
    expect(result.fields).toMatchObject({ title: 'Medical Paper', authors: 'Jane Doe', venue: 'Medical Journal', year: 2023 })
  })

  it('maps PubMed ESummary metadata', () => {
    const result = pubmedSummaryResult({ result: { uids: ['123'], '123': {
      uid: '123', title: 'Clinical Paper.', fulljournalname: 'Clinical Journal', pubdate: '2022 Jan',
      authors: [{ name: 'Doe J' }], articleids: [{ idtype: 'doi', value: '10.1000/clinical.1' }],
      volume: '5', issue: '4', pages: '1-7',
    } } }, { mode: 'doi', value: '10.1000/clinical.1' })
    expect(result.fields).toMatchObject({ title: 'Clinical Paper', authors: 'Doe J', venue: 'Clinical Journal', year: 2022 })
  })
})
