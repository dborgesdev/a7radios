import { useEffect } from 'react'
import { AudioLines, Grid2X2, Headphones, Music2, RadioTower, Search } from 'lucide-react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useApi } from '../api'
import { Empty, RadioCards } from '../components/RadioCards'
import { RadioShelf } from '../components/RadioShelf'
import type { Category, Radio } from '../domain'

export function Home() {
  const discovery = useApi<{ latest: Radio[]; suggested: Radio[] }>('/discovery')
  const categories = useOutletContext<ReturnType<typeof useApi<Category[]>>>()
  const navigate = useNavigate()
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#categorias') document.getElementById('categorias')?.scrollIntoView()
  }, [hash])
  const categoryIcons = [Music2, AudioLines, RadioTower, Headphones]

  return <>
    <section className="hero">
      <div className="broadcast-wave" aria-hidden="true">{[22, 36, 55, 83, 124, 91, 177, 115, 60, 90, 39].map((height, index) =>
        <i key={height} style={{ height, animationDelay: index * -0.12 + 's' }} />)}</div>
      <div className="shell hero-inner">
        <div className="hero-copy">
          <p className="hero-label"><RadioTower size={17} /> A7 Rádios On-Line</p>
          <h1>Rádios do Brasil<br />em um só <em>lugar</em></h1>
          <p>Encontre emissoras por categoria, região e estilo. Do Brasil para o mundo.</p>
        </div>
        <form className="hero-search" role="search" onSubmit={event => {
          event.preventDefault()
          const search = String(new FormData(event.currentTarget).get('search') ?? '').trim()
          navigate('/radios/' + (search ? '?' + new URLSearchParams({ search }) : ''))
        }}>
          <label><Search size={24} /><input type="search" name="search" aria-label="Buscar rádio, categoria ou cidade" placeholder="Rádio, categoria ou cidade" /></label>
          <button className="button primary">Buscar</button>
        </form>
        <div className="hero-categories"><strong>Explore por categoria</strong>
          {categories.data?.slice(0, 4).map((category, index) => {
            const Icon = categoryIcons[index]
            return <Link key={category.id} to={'/radios/?' + new URLSearchParams({ category: category.slug })}><Icon size={18} />{category.name}</Link>
          })}
          <Link to="/#categorias"><Grid2X2 size={18} /> Todas as categorias</Link>
        </div>
      </div>
    </section>
    <div className="home-content">
      <div className="shell home-news">
      {!!discovery.data?.latest.length && <RadioShelf id="novidades" title="Novidades" radios={discovery.data.latest}
        action={<Link className="button secondary" to="/radios/">Ver todas as rádios</Link>} />}
      {!discovery.data?.latest.length && <section className="content-section">
        <div className="section-heading"><h2>Novidades</h2><Link className="button secondary" to="/radios/">Ver todas as rádios</Link></div>
        {discovery.loading ? <div className="placeholder" role="status">Carregando rádios…</div> :
          <Empty>{discovery.error ?? 'As rádios aprovadas aparecerão aqui.'}</Empty>}
      </section>}
      </div>
      <div className="home-category-band"><section className="shell content-section category-section" id="categorias">
        <div className="section-heading"><div>
          <h2>Explore por categoria</h2></div></div>
        {categories.error && <Empty>{categories.error}</Empty>}
        {categories.data?.length ? <div className="category-grid">{categories.data.map((category, index) => {
          const Icon = categoryIcons[index % categoryIcons.length]
          return <Link key={category.id} to={'/radios/?' + new URLSearchParams({ category: category.slug })}><Icon size={25} />{category.name}</Link>
        })}</div> : !categories.loading && !categories.error && <Empty>As categorias aparecem conforme as rádios são publicadas.</Empty>}
      </section></div>
      {!!discovery.data?.suggested.length && <section className="shell content-section home-suggestions" aria-labelledby="sugestoes">
        <div className="section-heading"><h2 id="sugestoes">Sugestões para você</h2></div>
        <RadioCards radios={discovery.data.suggested} compactLocation />
        <div className="suggestions-action"><Link className="button primary" to="/radios/">Ver todas as rádios</Link></div>
      </section>}
    </div>
  </>
}
