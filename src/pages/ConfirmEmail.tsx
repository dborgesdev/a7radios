import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { AuthPage } from './AuthPage'

export function ConfirmEmail() {
  const [token] = useState(() => window.location.hash.slice(1))
  const [state, setState] = useState<{ detail: string; ok: boolean; emailChange?: boolean }>()
  useEffect(() => {
    if (!token) return
    let active = true
    const data = new FormData()
    data.set('token', token)
    void auth('confirm', data).then(result => {
      if (!active) return
      setState({ detail: result.message, ok: true, emailChange: result.emailChange })
      history.replaceState(history.state, '', location.pathname)
    }).catch((error: Error) => {
      if (active) setState({ detail: error.message, ok: false })
    })
    return () => { active = false }
  }, [token])
  if (!token) return <AuthPage mode="resend" />
  return <AuthFrame title={state?.ok ? 'E-mail confirmado' : 'Confirmar e-mail'}>
    {!state ? <p role="status">Confirmando seu endereço…</p> :
      <p role={state.ok ? 'status' : 'alert'}>{state.ok ? state.emailChange ? 'O novo endereço já está ativo.' : 'Sua conta já está ativa.' : state.detail}</p>}
    <div className="actions">
      {state?.ok ? <Link className="button primary" to="/login/">Entrar na minha conta</Link> :
        state && <a className="button secondary" href={token.startsWith('e.') ? '/painel/dados/' : '/confirmar-email/'}>Solicitar novo link</a>}
    </div>
  </AuthFrame>
}
