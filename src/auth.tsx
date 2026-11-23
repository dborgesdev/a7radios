import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, session } from './api'
import type { Session } from './domain'

type AuthState = { value?: Session; error?: string; send: (action: string, data?: FormData) => Promise<string> }
const Auth = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Session>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    session().then(result => { if (active) setValue(result) })
      .catch((failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])
  async function send(action: string, data = new FormData()) {
    data.set('csrf', value?.csrf ?? '')
    const result = await auth(action, data)
    setValue(await session())
    return result.message
  }
  return <Auth.Provider value={{ value, error, send }}>{children}</Auth.Provider>
}

export function useAuth() { return useContext(Auth)! }
