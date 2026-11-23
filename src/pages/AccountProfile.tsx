import { useState, type FormEvent } from 'react'
import { api, ApiError, useApi } from '../api'
import { useAuth } from '../auth'
import { PageHero } from '../components/PageHero'

type Profile = { name: string; email: string; pendingEmail?: string | null }

export function AccountProfile() {
  const { value, refresh } = useAuth()
  const resource = useApi<Profile>(value?.nonce ? '/me/profile' : null, value?.nonce)
  const [saved, setSaved] = useState<Profile>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState<{ message: string; field?: string }>()
  const profile = saved ?? resource.data
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !value?.nonce) return
    const body = new FormData(event.currentTarget)
    setBusy(true); setFailure(undefined); setNotice('')
    try {
      const result = await api<Profile>('/me/profile', { method: 'POST', headers: { 'X-WP-Nonce': value.nonce }, body })
      setSaved(result)
      setNotice(result.pendingEmail ? 'Confirme o novo endereço pelo link enviado. Seu e-mail atual continua válido.' : 'Dados atualizados.')
      void refresh().catch(() => undefined)
    } catch (error) { setFailure({ message: (error as Error).message, field: error instanceof ApiError ? error.field : undefined }) }
    finally { setBusy(false) }
  }
  return <>
    <PageHero variant="account" eyebrow="Minha conta" title="Dados cadastrais" />
    <section className="shell page">
      {resource.loading && <p role="status">Carregando dados…</p>}
      {resource.error && <p role="alert">{resource.error}</p>}
      {profile && <form className="form form-panel profile-form" onSubmit={submit}>
        <label>Nome público<input name="name" defaultValue={profile.name} required maxLength={80} /></label>
        {failure?.field === 'name' && <p role="alert" className="error">{failure.message}</p>}
        <label>E-mail<input name="email" autoComplete="email" type="email" defaultValue={profile.pendingEmail ?? profile.email} required maxLength={100} /></label>
        {profile.pendingEmail && <p className="muted">E-mail atual: {profile.email}. Aguardando confirmação de {profile.pendingEmail}.</p>}
        {failure && failure.field !== 'name' && <p role="alert" className="error">{failure.message}</p>}
        {notice && <p role="status">{notice}</p>}
        <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados'}</button>
      </form>}
    </section>
  </>
}
