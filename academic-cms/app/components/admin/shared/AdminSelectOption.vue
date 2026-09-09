<script lang="ts">
import { ElOption } from 'element-plus'
import { defineComponent, h, type Component, type PropType } from 'vue'
import type { AdminOptionTone } from '~/admin/unified-list'

type SelectOptionValue = string | number | boolean

export default defineComponent({
  name: 'AdminSelectOption',
  props: {
    label: { type: String, required: true },
    value: { type: [String, Number, Boolean] as PropType<SelectOptionValue>, required: true },
    tone: { type: String as PropType<AdminOptionTone>, default: undefined },
  },
  setup(props) {
    return () => h(ElOption as unknown as Component, { label: props.label, value: props.value }, {
      default: () => h('span', { class: 'admin-option-label' }, [
        ...(props.tone ? [h('i', { class: 'admin-option-label__dot', 'data-tone': props.tone, 'aria-hidden': 'true' })] : []),
        h('span', props.label),
      ]),
    })
  },
})
</script>
