import { useState, type FormEvent } from 'react'
import { api } from '../api'

export function CategorySuggestion({ nonce }: { nonce: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/me/category-suggestions', {
        method: 'POST', headers: { 'X-WP-Nonce': nonce }, body: new FormData(event.currentTarget),
      })
      setMessage(result.message)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <details className="category-suggestion">
    <summary>Sugerir nova categoria</summary>
    <form className="form" onSubmit={suggest}>
      <p>Você pode escolher uma categoria existente para cadastrar a Rádio agora. A sugestão será analisada separadamente.</p>
      <label>Nome da categoria<input name="name" maxLength={80} required /></label>
      <button className="button secondary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar sugestão'}</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>
}
