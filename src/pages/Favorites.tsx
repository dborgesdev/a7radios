import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api'
import { Empty, RadioCards } from '../components/RadioCards'
import { useFavorites } from '../favorites'
import type { Page } from '../domain'

const pageSize = 20

export function Favorites() {
  const { slugs } = useFavorites()
  const [activePage, setActivePage] = useState(1)
  const lastPage = Math.max(1, Math.ceil(slugs.length / pageSize))
  const page = Math.min(activePage, lastPage)
  const visible = slugs.slice((page - 1) * pageSize, page * pageSize)
  const result = useApi<Page>(visible.length
    ? '/radios?' + new URLSearchParams({ slugs: visible.join(','), per_page: String(pageSize) }) : null)
  const bySlug = new Map(result.data?.items.map(radio => [radio.slug, radio]))
  const radios = visible.flatMap(slug => {
    const radio = bySlug.get(slug)
    return radio ? [radio] : []
  })
  return <div className="shell page">
    <h1>Favoritos</h1><p className="muted">Os favoritos ficam neste navegador e podem ser perdidos se você limpar os dados dele.</p>
    {result.loading && <p role="status">Carregando favoritos…</p>}
    {result.error && <Empty>{result.error}</Empty>}
    {radios.length ? <RadioCards radios={radios} /> :
      !result.loading && !result.error && <Empty><p>Nenhuma rádio disponível nesta página de favoritos.</p><Link to="/radios/">Explorar rádios</Link></Empty>}
    {lastPage > 1 && <nav className="pagination" aria-label="Páginas de favoritos">
      {page > 1 && <button className="button secondary" onClick={() => setActivePage(page - 1)}>Anterior</button>}
      <span>Página {page} de {lastPage}</span>
      {page < lastPage && <button className="button secondary" onClick={() => setActivePage(page + 1)}>Próxima</button>}
    </nav>}
  </div>
}
