import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHero } from '../components/PageHero'
import { useAuth } from '../auth'

const titles = { login: 'Entrar', register: 'Criar conta', recover: 'Recuperar senha', reset: 'Definir nova senha' }
export function AuthPage({ mode }: { mode: 'login' | 'register' | 'recover' }) {
  const { value, error, send } = useAuth()
  const [params] = useSearchParams()
  const reset = mode === 'recover' && !!params.get('key') && !!params.get('login')
  const action = reset ? 'reset' : mode
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  if (value?.authenticated) return <Navigate to="/painel/" replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (reset) {
      data.set('key', params.get('key')!)
      data.set('login', params.get('login')!)
    }
    setBusy(true); setFailure(''); setNotice('')
    try {
      const message = await send(action, data)
      if (mode === 'login') navigate('/painel/', { replace: true })
      else setNotice(message)
    } catch (error) { setFailure((error as Error).message) }
    finally { setBusy(false) }
  }
  return <>
    <PageHero variant="auth" eyebrow="A7 Rádios On-Line" title={titles[action]}
      description={mode === 'login' ? 'Acesse o painel da sua emissora.' : mode === 'register' ? 'Crie uma conta para cadastrar sua emissora.' : undefined} />
    <section className="shell auth-panel form-panel" aria-label={titles[action]}>
    {mode === 'register' && value && !value.registration && <p>O cadastro de contas está indisponível no momento.</p>}
    {error && <p role="alert">{error}</p>}
    {failure && <p className="error" role="alert">{failure}</p>}
    {notice && <p role="status">{notice}</p>}
    <form className="form" onSubmit={submit}>
      {mode === 'register' && <label>Nome público<input name="name" autoComplete="nickname" required maxLength={80} /></label>}
      {!reset && <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
      {(mode !== 'recover' || reset) && <label>{reset ? 'Nova senha' : 'Senha'}
        <input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required minLength={mode === 'login' ? 1 : 12} maxLength={128} />
        {mode !== 'login' && <small>Use pelo menos 12 caracteres.</small>}</label>}
      <button className="button primary" disabled={busy || !value?.csrf || (mode === 'register' && !value.registration)}>
        {busy ? 'Enviando…' : mode === 'recover' && !reset ? 'Enviar link de recuperação' : titles[action]}
      </button>
    </form>
    <div className="actions">
      {mode !== 'login' && <Link to="/login/">Entrar</Link>}
      {mode === 'login' && <><Link to="/cadastro/">Criar conta</Link><Link to="/recuperar-senha/">Esqueci minha senha</Link></>}
    </div>
    </section>
  </>
}
