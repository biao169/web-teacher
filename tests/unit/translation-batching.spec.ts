import { describe, expect, it } from 'vitest'
import { buildTranslationEnvelope, parseTranslationEnvelope, planTranslationBatches } from '../../server/services/complete-admin/translation-service'

const row = (table: string, text: string) => ({ source_text: text, metadata: { table } })

describe('translation request batching', () => {
  it('keeps different source tables in separate requests and observes item limits', () => {
    const batches = planTranslationBatches([
      row('news', '动态一'), row('publications', '论文一'), row('news', '动态二'), row('news', '动态三'),
    ], 2, 100)
    expect(batches.map(batch => batch.map(item => item.metadata.table))).toEqual([
      ['news', 'news'], ['news'], ['publications'],
    ])
  })

  it('splits requests before their combined character budget is exceeded', () => {
    const batches = planTranslationBatches([row('news', '1234'), row('news', '5678'), row('news', '90')], 10, 6)
    expect(batches.map(batch => batch.map(item => item.source_text))).toEqual([['1234'], ['5678', '90']])
  })

  it('round-trips a delimiter envelope without confusing content line breaks', () => {
    const envelope = buildTranslationEnvelope(['First\nparagraph', 'Second paragraph'], 'abc12345')
    const translated = envelope.text.replace('First\nparagraph', 'First translated\nparagraph').replace('Second paragraph', 'Second translated')
    expect(parseTranslationEnvelope(translated, envelope.markers)).toEqual(['First translated\nparagraph', 'Second translated'])
  })

  it('rejects a provider response that loses a delimiter', () => {
    const envelope = buildTranslationEnvelope(['one', 'two'], 'abc12345')
    expect(() => parseTranslationEnvelope(envelope.text.replace(envelope.markers[1]!, ''), envelope.markers)).toThrow('TRANSLATION_ENVELOPE_MISMATCH')
  })
})
