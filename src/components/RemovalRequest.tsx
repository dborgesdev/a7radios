import { useId, useRef, useState, type FormEvent } from 'react'
import { Flag } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import type { OwnRadio } from '../domain'

export function RemovalRequest({ id, name, owner = false, status }: {
  id: number; name: string; owner?: boolean; status?: OwnRadio['removalStatus']
}) {
  const { value, error } = useAuth()
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const authenticated = !!value?.authenticated
  const current = sent ? 'pending' : status
  const labels = { pending: 'Pedido de remoção em análise', approved: 'Remoção aprovada', rejected: 'Pedido de remoção rejeitado' }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (!value && !error) || (authenticated && !value?.nonce)) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>((owner ? '/me' : '') + '/radios/' + id + '/removal', {
        method: 'POST', body: new FormData(event.currentTarget),
        headers: value?.nonce ? { 'X-WP-Nonce': value.nonce } : undefined,
      })
      setSent(true)
      setMessage(result.message)
    } catch (failure) {
      setMessage((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <button ref={trigger} type="button" className="button secondary" onClick={() => dialog.current?.showModal()}
      aria-haspopup="dialog"><Flag size={18} aria-hidden="true" />{current ? labels[current] : 'Solicitar remoção'}</button>
    <dialog className="document-dialog" aria-labelledby={titleId} ref={dialog} onClose={() => trigger.current?.focus()}>
      <h2 id={titleId}>Solicitar remoção</h2>
      <p className="removal-station">{name}</p>
      <p>O pedido será analisado pela moderação. Consulte a <a href="/privacidade/">Política de Privacidade</a>.</p>
      {current ? <p role="status">{message || labels[current]}</p> : !value && !error ? <p role="status">Verificando sessão…</p> :
        <form className="form" onSubmit={submit}>
          {!authenticated && <>
            <label>Nome<input name="name" autoComplete="name" maxLength={100} required /></label>
            <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          </>}
          <label>Motivo<input name="reason" maxLength={200} required /></label>
          <label>Informações que fundamentam o pedido{authenticated ? ' (opcional)' : ''}
            <textarea name="evidence" maxLength={3000} rows={4} required={!authenticated} /></label>
          {message && <p role="alert">{message}</p>}
          <button className="button primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
        </form>}
      <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Fechar</button>
    </dialog>
  </>
}
