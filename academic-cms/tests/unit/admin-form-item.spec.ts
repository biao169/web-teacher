// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, reactive, ref, type App } from 'vue'
import { ElForm, ElInput, type FormInstance } from 'element-plus'
import AdminFormItem from '../../app/components/admin/shared/AdminFormItem.vue'

let app: App | undefined
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })

describe('shared admin form item', () => {
  it('keeps label association, required validation and custom actions when wrapping Element Plus', async () => {
    const model = reactive({ name: '' })
    const form = ref<FormInstance>()
    const host = document.createElement('div')
    document.body.append(host)
    app = createApp({ render: () => h(ElForm, { ref: form, model, labelPosition: 'top' }, {
      default: () => h(AdminFormItem, { label: '学生姓名', required: true, prop: 'name', for: 'student-name' }, {
        default: () => h(ElInput, { id: 'student-name', modelValue: model.name, 'onUpdate:modelValue': (value: string) => { model.name = value } }),
        'label-actions': () => h('button', { type: 'button' }, '数据库查重'),
      }),
    }) })
    app.mount(host)
    await nextTick()
    expect(host.querySelector('label')?.htmlFor).toBe('student-name')
    expect(host.querySelector('.admin-form-item')?.classList.contains('is-no-asterisk')).toBe(true)
    expect(host.querySelector('.admin-field-label__title')?.textContent).toBe('*学生姓名')
    expect(host.querySelectorAll('.admin-field-label__required')).toHaveLength(1)
    expect(host.querySelector('.admin-field-label__actions button')?.textContent).toBe('数据库查重')
    expect(await form.value!.validate().catch(() => false)).toBe(false)
    expect(host.querySelector('.admin-form-item')?.classList.contains('is-error')).toBe(true)
    model.name = '测试姓名'
    await nextTick()
    expect(await form.value!.validate()).toBe(true)
  })

  it('preserves rule-based required state, explicit overrides and a separate corresponding-author mark', async () => {
    const required = ref<boolean | undefined>(undefined)
    const host = document.createElement('div')
    document.body.append(host)
    app = createApp({ render: () => h(ElForm, { model: { authors: '' }, rules: { authors: [{ required: true }] } }, {
      default: () => h(AdminFormItem, { label: '通讯作者', labelMark: '*', required: required.value, prop: 'authors' }, { default: () => h(ElInput) }),
    }) })
    app.mount(host)
    await nextTick()
    expect(host.querySelector('.admin-form-item')?.classList.contains('is-required')).toBe(true)
    expect(host.querySelector('.admin-field-label__mark')?.textContent).toBe('*')
    required.value = false
    await nextTick()
    expect(host.querySelector('.admin-form-item')?.classList.contains('is-required')).toBe(false)
    required.value = true
    await nextTick()
    expect(host.querySelector('.admin-form-item')?.classList.contains('is-required')).toBe(true)
  })
})
