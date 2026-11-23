import { useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import type { OwnRadio } from '../domain'

type Suggestion = NonNullable<OwnRadio['categorySuggestion']>

export function CategorySuggestion({ nonce, selected, onSelect }: {
  nonce: string; selected?: Suggestion; onSelect: (suggestion?: Suggestion) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api<Suggestion>('/me/category-suggestions', {
        method: 'POST', headers: { 'X-WP-Nonce': nonce }, body: new FormData(event.currentTarget),
      })
      onSelect({ id: result.id, name: result.name })
      dialog.current?.close()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="category-action">
    <button className="button secondary" type="button" ref={trigger} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Sugerir categoria</button>
    {selected && <div className="suggested-tag"><span>Sugestão vinculada: {selected.name}</span>
      <button type="button" onClick={() => onSelect(undefined)}>Retirar vínculo</button></div>}
    {createPortal(<dialog className="document-dialog" ref={dialog} aria-labelledby="category-suggestion-title" onClose={() => trigger.current?.focus()}>
      <h2 id="category-suggestion-title">Sugerir categoria</h2>
      <p>A moderação avaliará esta sugestão junto com a Rádio. Se quiser, escolha também uma categoria existente como alternativa.</p>
      <form className="form" onSubmit={suggest}>
        <label>Nome da categoria<input name="name" maxLength={80} required /></label>
        <div className="actions"><button className="button primary" disabled={busy}>{busy ? 'Enviando…' : 'Vincular sugestão'}</button>
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Fechar</button></div>
        {message && <p role="alert">{message}</p>}
      </form>
    </dialog>, document.body)}
  </div>
}
