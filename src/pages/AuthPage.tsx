import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api'
import { AuthFrame } from '../components/AuthFrame'
import { PasswordField, passwordError } from '../components/PasswordField'
import { useAuth } from '../auth'

const titles = { login: 'Entrar', register: 'Criar conta', recover: 'Recuperar senha', reset: 'Redefinir senha', resend: 'Reenviar confirmação' }

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'recover' | 'resend' }) {
  const { value, error, send } = useAuth()
  const [params] = useSearchParams()
  const reset = mode === 'recover' && !!params.get('key') && !!params.get('login')
  const action = reset ? 'reset' : mode
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState<{ message: string; field?: string }>()
  const [busy, setBusy] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const inFlight = useRef(false)
  const navigate = useNavigate()
  if (value?.authenticated) return <Navigate to="/painel/" replace />

  async function execute(kind: string, data: FormData) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setFailure(undefined); setNotice('')
    try {
      const message = await send(kind, data)
      if (kind === 'login') navigate('/painel/', { replace: true })
      else if (kind === 'register' || kind === 'resend') {
        if (confirmationEmail) setNotice('Novo link enviado.')
        setConfirmationEmail(String(data.get('email')))
      } else setNotice(message)
    } catch (error) {
      setFailure({ message: (error as Error).message, field: error instanceof ApiError ? error.field : undefined })
    } finally { inFlight.current = false; setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const policyError = mode === 'register' || reset ? passwordError(password) : undefined
    if (policyError) {
      setFailure({ message: policyError, field: 'password' })
      event.currentTarget.querySelector<HTMLInputElement>('[name=password]')?.focus()
      return
    }
    if (reset) {
      data.set('key', params.get('key')!)
      data.set('login', params.get('login')!)
    }
    void execute(action, data)
  }

  function fieldError(field: string) {
    return failure?.field === field ? <p className="error" id={'error-' + field} role="alert">{failure.message}</p> : null
  }

  if (confirmationEmail) return <AuthFrame title="Confirme seu e-mail">
    <p>Enviamos um link de confirmação para o endereço informado. Acesse seu e-mail e clique no link para ativar sua conta.</p>
    <p className="muted auth-email">{confirmationEmail}</p>
    {failure && <p className="error" role="alert">{failure.message}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="actions"><button className="button secondary" disabled={busy} onClick={() => {
      const data = new FormData()
      data.set('email', confirmationEmail)
      void execute('resend', data)
    }}>{busy ? 'Enviando…' : 'Reenviar confirmação'}</button><Link className="button secondary" to="/login/">Entrar</Link></div>
  </AuthFrame>

  return <AuthFrame title={titles[action]}>
    {mode === 'register' && value && !value.registration && <p>O cadastro de contas está indisponível no momento.</p>}
    {error && <p role="alert">{error}</p>}
    {failure && !failure.field && <p className="error" role="alert">{failure.message}</p>}
    {notice && <p role="status">{notice}</p>}
    {!(reset && notice) && <form className="form" onSubmit={submit}>
      {mode === 'register' && <div><label>Nome público<input name="name" autoComplete="nickname" required maxLength={80} aria-describedby={failure?.field === 'name' ? 'error-name' : undefined} /></label>{fieldError('name')}</div>}
      {!reset && <div><label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={100} aria-describedby={failure?.field === 'email' ? 'error-email' : undefined} /></label>{fieldError('email')}</div>}
      {(mode === 'login' || mode === 'register' || reset) && <div>
        <PasswordField label={reset ? 'Nova senha' : 'Senha'} name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required maxLength={mode === 'login' ? 512 : undefined} aria-describedby={failure?.field === 'password' ? 'error-password' : mode !== 'login' ? 'password-rules' : undefined} />
        {mode !== 'login' && <small id="password-rules">Use 8 caracteres ou mais, com maiúscula, minúscula, número e caractere especial.</small>}
        {fieldError('password')}
      </div>}
      <button className="button primary" disabled={busy || !value?.csrf || (mode === 'register' && !value.registration)}>
        {busy ? 'Enviando…' : mode === 'recover' && !reset ? 'Enviar link de recuperação' : titles[action]}
      </button>
    </form>}
    <div className="actions">
      {mode !== 'login' && <Link className="button secondary" to="/login/">Entrar</Link>}
      {mode === 'login' && <><Link className="button secondary" to="/cadastro/">Criar conta</Link><Link className="button secondary" to="/recuperar-senha/">Esqueci minha senha</Link>
        <Link className="button secondary" to="/confirmar-email/">Reenviar confirmação</Link></>}
    </div>
  </AuthFrame>
}
