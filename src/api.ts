import { useEffect, useState } from 'react'

export const demo = import.meta.env.DEV && import.meta.env.VITE_A7_DEMO === '1'
const rest = '/app/wp-json/a7-radios/v1'
const ajax = '/app/wp-admin/admin-ajax.php?action='

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly field?: string) { super(message) }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const content = response.headers.get('content-type') ?? ''
  if (!content.includes('application/json')) {
    throw new ApiError('A conexão com o WordPress está indisponível.', response.status)
  }
  const body = await response.json()
  if (!response.ok) throw new ApiError(body.message ?? 'Não foi possível concluir.', response.status, body.data?.field)
  return body as T
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (demo) {
    const { demoRequest } = await import('./demo')
    return demoRequest<T>(path)
  }
  return json<T>(rest + path, init)
}

export async function recordVisit(id: number) {
  const response = await fetch(rest + '/radios/' + id + '/visit', { method: 'POST', credentials: 'same-origin' })
  const count = response.headers.get('X-A7-Visit-Count')
  return response.ok && count !== null ? Number(count) : undefined
}

export function session() {
  return demo
    ? Promise.resolve({ authenticated: false, csrf: '', registration: false })
    : json<import('./domain').Session>(ajax + 'a7r_session', { cache: 'no-store' })
}

export function auth(action: string, data: FormData) {
  return json<{ message: string; emailChange?: boolean }>(ajax + 'a7r_' + action, { method: 'POST', body: data })
}

type Resource<T> = { data?: T; error?: string; loading: boolean }

export function useApi<T>(path: string | null, nonce?: string): Resource<T> {
  const key = JSON.stringify([path, nonce])
  const [state, setState] = useState<Resource<T> & { key: string }>({ key: '', loading: true })
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    api<T>(path, { signal: controller.signal, headers: nonce ? { 'X-WP-Nonce': nonce } : undefined })
      .then(data => { if (!controller.signal.aborted) setState({ key, data, loading: false }) })
      .catch((error: Error) => { if (!controller.signal.aborted) setState({ key, error: error.message, loading: false }) })
    return () => controller.abort()
  }, [path, key, nonce])
  return state.key === key ? state : { loading: !!path }
}
