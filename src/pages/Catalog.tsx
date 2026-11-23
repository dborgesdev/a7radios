import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { useApi } from '../api'
import { Empty, RadioCards } from '../components/RadioCards'
import type { Category, Page } from '../domain'

export function Catalog() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const category = params.get('category') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = new URLSearchParams({ search, category, page: String(page) })
  const categories = useOutletContext<ReturnType<typeof useApi<Category[]>>>()
  const result = useApi<Page>('/radios?' + query)
  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }
  function pageLink(number: number) {
    const next = new URLSearchParams(params)
    if (number === 1) next.delete('page')
    else next.set('page', String(number))
    return '/radios/' + (next.size ? '?' + next : '')
  }
  return <div className="shell page">
    <h1>Rádios</h1>
    <form className="filters" onSubmit={event => { event.preventDefault(); update('search', String(new FormData(event.currentTarget).get('search')).trim()) }}>
      <label>Buscar rádio, categoria ou cidade<input key={search} type="search" name="search" defaultValue={search} maxLength={100} /></label>
      <label>Categoria<select value={category} onChange={event => update('category', event.target.value)}>
        <option value="">Todas</option>{categories.data?.map(item => <option value={item.slug} key={item.id}>{item.name}</option>)}
      </select></label>
      <button className="button primary">Buscar</button>
    </form>
    {result.loading && <p className="placeholder" role="status">Buscando rádios…</p>}
    {result.error && <Empty>{result.error}</Empty>}
    {result.data && (result.data.items.length ? <RadioCards radios={result.data.items} /> : <Empty>Nenhuma rádio encontrada.</Empty>)}
    {!!result.data && result.data.totalPages > 1 && <nav className="pagination" aria-label="Páginas do catálogo">
      {page > 1 && <Link className="button secondary" to={pageLink(page - 1)}>Anterior</Link>}
      <span>Página {page} de {result.data.totalPages}</span>
      {page < result.data.totalPages && <Link className="button secondary" to={pageLink(page + 1)}>Próxima</Link>}
    </nav>}
  </div>
}
