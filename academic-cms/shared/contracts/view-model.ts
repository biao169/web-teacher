export type PublicJsonPrimitive = null | boolean | number | string
export type PublicJsonValue = PublicJsonPrimitive | PublicJsonValue[] | { [key: string]: PublicJsonValue }
export type PublicViewModel<T extends PublicJsonValue = PublicJsonValue> = T

// Compatibility names used by lower-level cache contracts.
export type ViewModelPrimitive = PublicJsonPrimitive
export type ViewModelValue = PublicJsonValue
export type ViewModelObject = { [key: string]: PublicJsonValue }
