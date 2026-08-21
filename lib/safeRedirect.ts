// A fixed, non-routable origin used only to resolve candidate paths. If a
// candidate resolves to any other origin it is not an internal path.
const TRUSTED_ORIGIN = 'https://hub.internal.invalid'

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    // WHATWG URL parsing strips C0 controls and DEL, which can turn an apparently
    // internal path such as "/\t/evil.example" into "//evil.example".
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function safeInternalPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  if (hasControlCharacters(value)) return fallback

  let resolved: URL
  try {
    resolved = new URL(value, TRUSTED_ORIGIN)
  } catch {
    return fallback
  }
  if (resolved.origin !== TRUSTED_ORIGIN) return fallback
  return value
}
