import { useEffect } from 'react'
import { AudioLines, Disc3, Globe2, Headphones, Music2, RadioTower } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useApi } from '../api'
import { Empty, RadioCards } from '../components/RadioCards'
import type { Category, Radio } from '../domain'

export function Home() {
  const discovery = useApi<{ latest: Radio[]; suggested: Radio[] }>('/discovery')
  const categories = useApi<Category[]>('/categories')
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#categorias') document.getElementById('categorias')?.scrollIntoView()
  }, [hash])
  const categoryIcons = [Music2, AudioLines, RadioTower, Headphones]

  return <>
    <section className="hero">
      <div className="shell hero-inner">
        <div className="hero-copy">
          <p className="hero-label"><Globe2 size={17} /> A7 Rádios On-Line</p>
          <h1>Do Brasil para<br />o <em>mundo.</em></h1>
          <p>Encontre rádios online e ouça suas emissoras favoritas em um só lugar.</p>
          <Link className="button primary" to="/radios/"><Headphones size={19} /> Explorar rádios</Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
          <div className="signal">{[22, 34, 52, 82, 122, 160, 109, 156, 211, 278, 225, 161, 113, 149, 84, 58, 34].map((height, index) =>
            <i key={index} style={{ height: height + 'px', opacity: .3 + index / 28 }} />)}</div>
          <div className="hero-brand"><img src="/a7-logo.png" alt="" /></div>
          <Disc3 className="art-disc" size={42} strokeWidth={1.2} />
        </div>
      </div>
    </section>
    <div className="shell home-content">
      <section className="content-section">
        <div className="section-heading"><div>
          <h2>Adicionadas recentemente</h2></div><Link className="button secondary" to="/radios/">Ver catálogo</Link></div>
        {discovery.loading && <div className="placeholder" role="status">Carregando rádios…</div>}
        {discovery.error && <Empty>{discovery.error}</Empty>}
        {discovery.data && (discovery.data.latest.length ? <RadioCards radios={discovery.data.latest} /> :
          <Empty><strong>O catálogo está sendo preparado.</strong><p>As rádios aprovadas aparecerão aqui.</p></Empty>)}
      </section>
      <section className="content-section category-section" id="categorias">
        <div className="section-heading"><div>
          <h2>Explore por categoria</h2></div></div>
        {categories.error && <Empty>{categories.error}</Empty>}
        {categories.data?.length ? <div className="category-grid">{categories.data.map((category, index) => {
          const Icon = categoryIcons[index % categoryIcons.length]
          return <Link key={category.id} to={'/radios/?' + new URLSearchParams({ category: category.slug })}><Icon size={25} />{category.name}</Link>
        })}</div> : !categories.loading && !categories.error && <Empty>As categorias aparecem conforme as rádios são publicadas.</Empty>}
      </section>
      {!!discovery.data?.suggested.length && <section className="content-section">
        <div className="section-heading"><h2>Sugestões para você</h2></div><RadioCards radios={discovery.data.suggested} />
      </section>}
    </div>
  </>
}
