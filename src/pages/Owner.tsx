import { useState } from 'react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { useApi } from '../api'
import { useAuth } from '../auth'
import { Empty } from '../components/RadioCards'
import { locationLabel, radioPath, statusLabel, type OwnRadio, type Status } from '../domain'

export function OwnerLayout() {
  const { value, error, send } = useAuth()
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <div className="shell page"><Empty>{error}</Empty></div>
  if (!value) return <div className="shell page" role="status">Verificando sessão…</div>
  if (!value.authenticated) return <Navigate to="/login/" replace />
  return <div className="shell page">
    <nav className="actions owner-nav" aria-label="Painel">
      <Link to="/painel/">Painel</Link><Link to="/painel/radios/">Minhas rádios</Link>
      <button type="button" className="button secondary" disabled={busy} onClick={async () => {
        setBusy(true); setFailure('')
        try { await send('logout') } catch (error) { setFailure((error as Error).message) } finally { setBusy(false) }
      }}>Sair</button>
    </nav>
    {failure && <p role="alert">{failure}</p>}
    <Outlet />
  </div>
}

export function Dashboard() {
  const { value } = useAuth()
  const result = useApi<Record<Status, number>>('/me/dashboard', value?.nonce)
  return <>
    <h1>Olá, {value?.user?.name}</h1>
    <div className="actions"><Link className="button primary" to="/painel/radios/nova/">Cadastrar rádio</Link>
      <Link className="button secondary" to="/painel/radios/">Minhas rádios</Link></div>
    {result.loading && <p role="status">Carregando painel…</p>}
    {result.error && <p role="alert">{result.error}</p>}
    {result.data && <div className="stats">{(['pending', 'approved', 'rejected'] as const).map(status =>
      <div key={status}><span>{statusLabel[status]}s</span><strong>{result.data![status]}</strong></div>)}</div>}
  </>
}

export function OwnerRadios() {
  const { value } = useAuth()
  const result = useApi<OwnRadio[]>('/me/radios', value?.nonce)
  return <>
    <div className="section-heading"><h1>Minhas rádios</h1><Link className="button primary" to="/painel/radios/nova/">Cadastrar rádio</Link></div>
    {result.loading && <p role="status">Carregando rádios…</p>}
    {result.error && <p role="alert">{result.error}</p>}
    {result.data?.length ? <ul className="owner-list">{result.data.map(radio => <li key={radio.id}>
      <div><h2>{radio.draft.name}</h2><p>{radio.categoryName} · {locationLabel(radio.draft)} · {statusLabel[radio.status]}
        {radio.status === 'approved' && radio.revisionStatus === 'pending' && ' · Alteração em análise'}</p>
        {radio.submittedAt && <p className="muted">Enviada em {new Date(radio.submittedAt).toLocaleDateString('pt-BR')}</p>}
        {radio.reason && <p>Motivo: {radio.reason}</p>}</div>
      <div className="actions"><Link to={'/painel/radios/' + radio.id + '/editar/'}>Ver ou editar</Link>
        {radio.status === 'approved' && <Link to={radioPath(radio.slug)}>Ver página pública</Link>}</div>
    </li>)}</ul> : result.data && <Empty>Você ainda não cadastrou rádios.</Empty>}
  </>
}
