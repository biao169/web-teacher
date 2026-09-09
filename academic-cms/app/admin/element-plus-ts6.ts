import {
  ElConfigProvider as ElementConfigProvider,
  ElOption as ElementOption,
  ElRadioButton as ElementRadioButton,
  ElSelect as ElementSelect,
  ElTabPane as ElementTabPane,
  ElTabs as ElementTabs,
} from 'element-plus'
import type { Component } from 'vue'

// Element Plus 2.14's generated SFC declarations expose some raw EpProp
// definitions when consumed by TypeScript 6. The runtime components are
// correct; keep this compatibility boundary small and remove it once upstream
// declarations expose their public prop types under TypeScript 6.
function componentForTypeScript6(component: unknown): Component {
  return component as Component
}

export const ElConfigProvider = componentForTypeScript6(ElementConfigProvider)
export const ElOption = componentForTypeScript6(ElementOption)
export const ElRadioButton = componentForTypeScript6(ElementRadioButton)
export const ElSelect = componentForTypeScript6(ElementSelect)
export const ElTabPane = componentForTypeScript6(ElementTabPane)
export const ElTabs = componentForTypeScript6(ElementTabs)
