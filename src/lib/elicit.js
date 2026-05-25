let _backend = null;

export function setElicitBackend(fn) {
  _backend = fn;
}

/**
 * Request a string value from the user.
 *
 * Returns { value: string | null, available: boolean }.
 *   available: false  — no elicitation mechanism exists; caller should use its fallback logic.
 *   available: true, value: null  — user explicitly cancelled or dismissed.
 *   available: true, value: string  — user provided a value.
 */
export async function elicit(message) {
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    return { value: window.prompt(message), available: true };
  }
  if (_backend) {
    return { value: await _backend(message), available: true };
  }
  return { value: null, available: false };
}
