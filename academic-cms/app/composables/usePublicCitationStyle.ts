import { computed } from 'vue'
import { isPublicCitationStyle, type PublicCitationStyle } from '~~/shared/contracts/public-citation'

/** Shared by the publication list, featured list, detail and selected preview. SSR starts with GB/T. */
export function usePublicCitationStyle() {
  const state = useState<PublicCitationStyle>('public-citation-style:v1', () => 'gbt')
  return computed<PublicCitationStyle>({
    get: () => isPublicCitationStyle(state.value) ? state.value : 'gbt',
    set: value => { if (isPublicCitationStyle(value)) state.value = value },
  })
}
