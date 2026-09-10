import { describe, expect, it } from 'vitest'
import {
  completeEditorFieldDescriptor,
  completeEditorFieldDescriptors,
  contentEditorFieldDescriptor,
  contentEditorFieldDescriptors,
} from '../../app/admin/editor-fields'
import type { CompleteResourceSchema } from '../../app/admin/complete-resource'
import { getAdminSpecialField } from '../../app/shared/admin/special-fields'
import { adminContentModule } from '../../shared/admin/content-modules'
import { RESOURCE_CATALOG } from '../../shared/complete-admin/core.mjs'

function completeResource(key: string): CompleteResourceSchema {
  return RESOURCE_CATALOG[key] as CompleteResourceSchema
}

describe('admin editor field adapters', () => {
  it('turns generic fields and their special capabilities into one UI contract', () => {
    const profiles = adminContentModule('profiles')
    const avatar = profiles.fields.find(field => field.name === 'avatar_key')!
    const descriptor = contentEditorFieldDescriptor(profiles.module, avatar)

    expect(descriptor).toMatchObject({
      source: 'content',
      module: 'profiles',
      key: 'avatar_key',
      baseControl: 'media',
      control: 'media',
      wide: true,
      booleanValueMode: 'boolean',
    })
    expect(descriptor.accept).toEqual(['image/*'])

    const publications = adminContentModule('publications')
    const venue = publications.fields.find(field => field.name === 'venue')!
    expect(contentEditorFieldDescriptor(publications.module, venue)).toMatchObject({
      baseControl: 'text',
      control: 'suggestion',
      enhancement: { suggestionKey: 'publications.venue' },
    })
  })

  it('turns complete-resource fields into the same UI contract and resolves aliases', () => {
    const site = completeResource('site-settings')
    const logo = completeEditorFieldDescriptor(site.key, site.fields.find(field => field.key === 'logo_key')!)
    const homepageProfile = completeEditorFieldDescriptor(site.key, site.fields.find(field => field.key === 'homepage_profile_uid')!)

    expect(logo).toMatchObject({ source: 'complete', control: 'media', booleanValueMode: 'integer' })
    expect(logo.accept).toEqual(['image/*'])
    expect(homepageProfile).toMatchObject({ control: 'relation', relationResource: 'profiles' })
    expect(getAdminSpecialField('site-settings', 'logo_key')?.module).toBe('site_settings')
  })

  it('describes every field without dropping guidance or its schema identity', () => {
    for (const module of ['profiles', 'research_interests', 'publications', 'projects', 'patents', 'students', 'student_category_displays', 'courses', 'messages'] as const) {
      const definition = adminContentModule(module)
      const descriptors = contentEditorFieldDescriptors(definition)
      expect(descriptors).toHaveLength(definition.fields.length)
      expect(new Set(descriptors.map(field => field.key)).size).toBe(descriptors.length)
      for (const field of descriptors) {
        expect(field.placeholder.trim()).not.toBe('')
        expect(field.help.trim()).not.toBe('')
      }
    }

    for (const key of ['site-settings', 'global-settings', 'navigation', 'media', 'translation', 'news']) {
      const resource = completeResource(key)
      const descriptors = completeEditorFieldDescriptors(resource)
      expect(descriptors).toHaveLength(resource.fields.length)
      expect(new Set(descriptors.map(field => field.key)).size).toBe(descriptors.length)
      for (const field of descriptors) {
        expect(field.placeholder.trim()).not.toBe('')
        expect(field.help.trim()).not.toBe('')
      }
    }
  })

  it('marks category-like fields as reusable multi-value suggestions in both schema systems', () => {
    const publications = adminContentModule('publications')
    const keywords = contentEditorFieldDescriptor(publications.module, publications.fields.find(field => field.name === 'keywords')!)
    const students = adminContentModule('students')
    const category = contentEditorFieldDescriptor(students.module, students.fields.find(field => field.name === 'category')!)
    const news = completeResource('news')
    const newsCategory = completeEditorFieldDescriptor(news.key, news.fields.find(field => field.key === 'category')!)

    for (const descriptor of [keywords, category, newsCategory]) {
      expect(descriptor.control).toBe('suggestion')
      expect(descriptor.enhancement?.multiple).toBe(true)
      expect(descriptor.help).toContain('中文或英文分号')
    }
  })
})
