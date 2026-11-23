import { useState } from 'react'
import { AudioLines, Check, Clock3, Plus, XCircle } from 'lucide-react'
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom'
import { useApi } from '../api'
import { useAuth } from '../auth'
import { OwnerRadioImage } from '../components/OwnerRadioImage'
import { PageHero } from '../components/PageHero'
import { Empty } from '../components/RadioCards'
import { locationLabel, radioPath, statusLabel, type OwnRadio, type Status } from '../domain'

export function OwnerLayout() {
  const { value, error, send } = useAuth()
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <div className="shell page"><Empty>{error}</Empty></div>
  if (!value) return <div className="shell page" role="status">Verificando sessão…</div>
  if (!value.authenticated) return <Navigate to="/login/" replace />
  return <>
    <nav className="shell actions owner-nav" aria-label="Painel">
      <div className="actions"><NavLink to="/painel/" end>Minhas rádios</NavLink><NavLink to="/painel/dados/">Dados cadastrais</NavLink></div>
      <button type="button" className="button secondary" disabled={busy} onClick={async () => {
        setBusy(true); setFailure('')
        try { await send('logout') } catch (error) { setFailure((error as Error).message) } finally { setBusy(false) }
      }}>Sair</button>
    </nav>
    {failure && <p role="alert">{failure}</p>}
    <Outlet />
  </>
}

export function Dashboard() {
  const { value } = useAuth()
  const result = useApi<Record<Status, number>>('/me/dashboard', value?.nonce)
  return <>
    <PageHero variant="account" eyebrow="Minha conta" title={'Olá, ' + (value?.user?.name ?? '')}
      description="Acompanhe publicações, propostas e decisões das suas emissoras."
      action={<Link className="button primary" to="/painel/radios/nova/"><Plus size={18} /> Cadastrar Rádio</Link>}>
      {result.loading && <p role="status">Carregando indicadores…</p>}
      {result.error && <p role="alert">{result.error}</p>}
      {result.data && <div className="account-metrics">
        <div><AudioLines aria-hidden="true" /><strong>{Object.values(result.data).reduce((total, count) => total + count, 0)}</strong><span>Total</span></div>
        <div className="metric-pending"><Clock3 aria-hidden="true" /><strong>{result.data.pending}</strong><span>Pendentes</span></div>
        <div className="metric-approved"><Check aria-hidden="true" /><strong>{result.data.approved}</strong><span>Aprovadas</span></div>
        <div className="metric-rejected"><XCircle aria-hidden="true" /><strong>{result.data.rejected}</strong><span>Rejeitadas</span></div>
      </div>}
    </PageHero>
    <OwnerRadios />
  </>
}

function OwnerRadios() {
  const { value } = useAuth()
  const result = useApi<OwnRadio[]>('/me/radios', value?.nonce)
  return <section className="shell page" aria-labelledby="owner-radios">
    <div className="section-heading"><h2 id="owner-radios">Minhas rádios</h2></div>
    {result.loading && <p role="status">Carregando rádios…</p>}
    {result.error && <p role="alert">{result.error}</p>}
    {result.data?.length ? <ul className="owner-list">{result.data.map(radio => <li key={radio.id}>
      <div className="owner-radio">
        {radio.imagePath && value?.nonce && <OwnerRadioImage key={radio.imagePath} path={radio.imagePath} nonce={value.nonce} />}
        <div><h3>{radio.draft.name}</h3><p>{radio.categoryName} · {locationLabel(radio.draft)} <span className={'status-chip '+radio.status}>{statusLabel[radio.status]}</span>
        {radio.status === 'approved' && radio.revisionStatus === 'pending' && ' · Alteração em análise'}</p>
        {radio.submittedAt && <p className="muted">Enviada em {new Date(radio.submittedAt).toLocaleDateString('pt-BR')}</p>}
        {radio.reason && <p>Motivo: {radio.reason}</p>}</div></div>
      <div className="actions"><Link to={'/painel/radios/' + radio.id + '/editar/'} className="button secondary">{radio.revisionStatus === 'rejected' ? 'Corrigir e reenviar' : 'Ver ou editar'}</Link>
        {radio.status === 'approved' && <>
          <Link className="button secondary" to={radioPath(radio.slug)}>Ver Rádio</Link>
          <Link to={'/painel/radios/' + radio.id + '/editar/#remocao'}>Remoção</Link>
        </>}</div>
    </li>)}</ul> : result.data && <Empty>Você ainda não cadastrou rádios.</Empty>}
  </section>
}
