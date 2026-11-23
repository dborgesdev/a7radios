import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { RemovalRequest } from '../components/RemovalRequest'
import { Share2 } from 'lucide-react'
import { demo, recordVisit, useApi } from '../api'
import { Cover, Empty, RadioCards } from '../components/RadioCards'
import { locationLabel, radioPath, type Radio, type Page } from '../domain'
import { FavoriteButton } from '../favorites'
import { PlayButton, useDirectAutoplay } from '../player'

export function RadioDetail({ initial }: { initial?: Radio }) {
  const { slug } = useParams()
  const { key } = useLocation()
  const result = useApi<Radio>(slug ? '/radios/' + encodeURIComponent(slug) : null)
  const radio = result.data ?? (result.loading && initial?.slug === slug ? initial : undefined)
  const title = radio?.name ?? (result.loading ? undefined : 'Rádio indisponível')
  useEffect(() => {
    if (title) document.title = title + ' | A7 Rádios'
  }, [title])
  return result.loading && !radio ? <div className="shell page" role="status">Carregando rádio…</div> :
    radio ? <RadioProfile key={radio.id} radio={radio} direct={!demo && key === 'default' && initial?.slug === slug} /> :
      <div className="shell page"><h1>Rádio indisponível</h1><Empty>{result.error ?? 'Esta rádio não está disponível.'}</Empty><Link to="/radios/">Ver catálogo</Link></div>
}

function RadioProfile({ radio, direct }: { radio: Radio; direct: boolean }) {
  useDirectAutoplay(radio, direct)
  const [visits, setVisits] = useState<number>()
  const [sharing, setSharing] = useState('')
  const related = useApi<Page>('/radios?' + new URLSearchParams({ category: radio.category.slug, per_page: '5' }))
  const sameCategory = related.data?.items.filter(item => item.id !== radio.id) ?? []
  const fallback = useApi<Page>(related.data && sameCategory.length < 4 ? '/radios?per_page=8' : null)
  const others = [...sameCategory, ...fallback.data?.items.filter(item => item.id !== radio.id && !sameCategory.some(match => match.id === item.id)) ?? []].slice(0, 4)
  const count = visits ?? radio.visitCount
  useEffect(() => {
    if (demo) return
    let current = true
    void recordVisit(radio.id).then(count => { if (current) setVisits(count) }).catch(() => undefined)
    return () => { current = false }
  }, [radio.id])
  async function share() {
    const url = new URL(radioPath(radio.slug), location.origin).href
    try {
      if (navigator.share) await navigator.share({ title: radio.name, url })
      else { await navigator.clipboard.writeText(url); setSharing('Link copiado.') }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setSharing(url)
    }
  }
  return <div className="shell page">
    <nav className="breadcrumb" aria-label="Você está em"><Link to="/">Início</Link> / <Link to="/radios/">Rádios</Link></nav>
    <div className="radio-detail"><Cover radio={radio} eager /><div>
      <p className="eyebrow"><Link to={'/radios/?' + new URLSearchParams({ category: radio.category.slug })}>{radio.category.name}</Link></p>
      <h1>{radio.name}</h1><p className="muted">{locationLabel(radio)}</p>
      <div className="actions"><PlayButton radio={radio} /><FavoriteButton slug={radio.slug} />
        <button onClick={share} className="button secondary"><Share2 size={18} /> Compartilhar</button></div>
      {sharing && <p role="status" className="break-all">{sharing}</p>}
    </div></div>
    <section className="about"><h2>Sobre a rádio</h2><p>{radio.description}</p>
      <div className="actions">
        {radio.websiteUrl && <a className="button secondary" href={radio.websiteUrl} target="_blank" rel="noopener noreferrer">Visitar site da Rádio</a>}
        {radio.appDownloadUrl && <a className="button secondary" href={radio.appDownloadUrl} target="_blank" rel="noopener noreferrer">Baixar App</a>}
        {!demo && <RemovalRequest id={radio.id} />}
      </div>
      {count !== undefined && <p className="muted">{count} {count === 1 ? 'visita à página' : 'visitas à página'}</p>}
    </section>
    {!!others.length && <section className="content-section"><h2>Você também pode gostar</h2><RadioCards radios={others} /></section>}
  </div>
}
