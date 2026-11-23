import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHero } from '../components/PageHero'
import { RemovalRequest } from '../components/RemovalRequest'
import { Eye, MapPin, Share2 } from 'lucide-react'
import { demo, recordVisit, useApi } from '../api'
import { Cover, RadioCards } from '../components/RadioCards'
import { locationLabel, radioPath, type Radio, type Page } from '../domain'
import { FavoriteButton } from '../favorites'
import { IntegratedPlayer, useDirectAutoplay } from '../player'

export function RadioDetail({ initial }: { initial?: Radio }) {
  const { slug } = useParams()
  const result = useApi<Radio>(slug ? '/radios/' + encodeURIComponent(slug) : null)
  const radio = result.data ?? (result.loading && initial?.slug === slug ? initial : undefined)
  const title = radio?.name ?? (result.loading ? undefined : 'Rádio indisponível')
  useEffect(() => {
    if (title) document.title = title + ' | A7 Rádios'
  }, [title])
  return result.loading && !radio ? <div className="shell page" role="status">Carregando rádio…</div> :
    radio ? <RadioProfile key={radio.id} radio={radio} direct={!demo} /> :
      <PageHero variant="error" eyebrow="A7 Rádios On-Line" title="Rádio indisponível" description={result.error ?? 'Esta rádio não está disponível.'} action={<Link className="button primary" to="/radios/">Ver catálogo</Link>} />
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
  return <>
    <header className="station-hero">
      <div className="shell station-shell">
        <nav className="breadcrumb" aria-label="Você está em"><Link to="/">Início</Link><span aria-hidden="true">/</span><Link to="/radios/">Rádios</Link></nav>
        <div className="station-identity">
          <div className="station-art"><Cover radio={radio} eager /></div>
          <div className="station-copy">
            <p className="station-category"><Link to={'/radios/?' + new URLSearchParams({ category: radio.category.slug })}>{radio.category.name}</Link></p>
            <h1>{radio.name}</h1>
            <p className="station-location"><MapPin size={17} aria-hidden="true" />{locationLabel(radio)}</p>
            <IntegratedPlayer radio={radio} />
            <div className="station-actions">
              <FavoriteButton slug={radio.slug} />
              <button onClick={share} className="button secondary"><Share2 size={18} /> Compartilhar</button>
              {count !== undefined && <span className="station-visits"><Eye size={18} aria-hidden="true" />{count} {count === 1 ? 'visita à página' : 'visitas à página'}</span>}
            </div>
            {sharing && <p role="status" className="break-all">{sharing}</p>}
          </div>
        </div>
      </div>
    </header>
    <div className="shell page station-body">
      <section className="station-editorial content-section"><div><h2>Sobre a rádio</h2><p>{radio.description}</p></div>
        {(radio.websiteUrl || radio.appDownloadUrl || !demo) && <div className="station-links">
          {radio.websiteUrl && <a className="button secondary" href={radio.websiteUrl} target="_blank" rel="noopener noreferrer">Visitar site da Rádio</a>}
          {radio.appDownloadUrl && <a className="button secondary" href={radio.appDownloadUrl} target="_blank" rel="noopener noreferrer">Baixar App</a>}
          {!demo && <RemovalRequest id={radio.id} name={radio.name} />}
        </div>}
      </section>
      {!!others.length && <section className="content-section"><div className="section-heading"><h2>Você também pode gostar</h2></div><RadioCards radios={others} /></section>}
    </div>
  </>
}
