import { useState, type FormEvent } from "react"
import type { FieldErrors } from "./authValidation"

export function useAuthForm<T extends object>(
  initialValues: T,
  validate: (values: T) => FieldErrors<T>,
) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<FieldErrors<T>>({})

  function setField<K extends keyof T>(name: K, value: T[K]) {
    const nextValues = { ...values, [name]: value }
    setValues(nextValues)
    // Keep already-visible errors current without showing errors on untouched fields.
    setErrors((current) => {
      const nextErrors = validate(nextValues)
      return Object.fromEntries(
        Object.keys(current).flatMap((key) => {
          const error = nextErrors[key as keyof T]
          return error ? [[key, error]] : []
        }),
      ) as FieldErrors<T>
    })
  }

  function blurField(name: keyof T) {
    setErrors((current) => ({ ...current, [name]: validate(values)[name] }))
  }

  function submit(onValid: (values: T) => void) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const nextErrors = validate(values)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length) {
        const form = event.currentTarget
        requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
        return
      }
      onValid(values)
    }
  }

  return { values, errors, setField, blurField, submit }
}
