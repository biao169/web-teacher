import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { core } from '../helpers/offline-stage27.mjs'

test('structured long-form source text preserves deliberate leading indentation and final newline', () => {
  const publication = core.normalizeAdminContentValues(core.adminContentModule('publications'), {
    title: 'Source formatting',
    bibtex: '@article{example,\n  title = {Example}\n}\n',
  }, 'create')
  assert.equal(publication.values.bibtex, '@article{example,\n  title = {Example}\n}\n')
})

test('editor keeps mutation failures visible and focuses the first invalid field', async () => {
  const editor = await readFile(resolve(process.cwd(), 'app/components/admin/content/Editor.vue'), 'utf8')
  assert.match(editor, /mutationFailure/u)
  assert.match(editor, /reloadLatest/u)
  assert.match(editor, /data-admin-field/u)
  assert.match(editor, /focusFirstFieldError/u)
})

test('stale batch failures discard obsolete selection and refresh the list', async () => {
  const list = await readFile(resolve(process.cwd(), 'app/components/admin/content/List.vue'), 'utf8')
  assert.match(list, /ADMIN_CONTENT_CONFLICT/u)
  assert.match(list, /selected\.value = \[\]/u)
  assert.match(list, /invalidateQueries/u)
})
