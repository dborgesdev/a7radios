import { useRef, useState, type FormEvent } from 'react'
import { api } from '../api'

export function RemovalRequest({ id }: { id: number }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/radios/' + id + '/removal', {
        method: 'POST', body: new FormData(event.currentTarget),
      })
      setSent(true)
      setMessage(result.message)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <button type="button" className="button secondary" onClick={() => dialog.current?.showModal()}>Solicitar remoção</button>
    <dialog className="document-dialog" aria-labelledby="removal-title" ref={dialog}>
      <h2 id="removal-title">Solicitar remoção</h2>
      <p>A equipe usará seu contato para avaliar o pedido. Consulte a <a href="/privacidade/">Política de Privacidade</a>.</p>
      {!sent && <form className="form" onSubmit={submit}>
        <label>Nome<input name="name" autoComplete="name" maxLength={100} required /></label>
        <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Motivo<input name="reason" maxLength={200} required /></label>
        <label>Informações que fundamentam o pedido<textarea name="evidence" maxLength={3000} rows={4} required /></label>
        <button className="button primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
      </form>}
      {message && <p role={sent ? 'status' : 'alert'}>{message}</p>}
      <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Fechar</button>
    </dialog>
  </>
}
