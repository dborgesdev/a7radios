import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useApi } from '../api'
import { Empty, RadioCards } from '../components/RadioCards'
import { PageHero } from '../components/PageHero'
import type { Category, Page } from '../domain'

const pageSize = 24

export function Catalog() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const category = params.get('category') ?? ''
  const rawPage = Number(params.get('page'))
  const page = Number.isSafeInteger(rawPage) ? Math.min(100000, Math.max(1, rawPage)) : 1
  const query = new URLSearchParams({ search, category, page: String(page), per_page: String(pageSize) })
  const categories = useOutletContext<ReturnType<typeof useApi<Category[]>>>()
  const result = useApi<Page>('/radios?' + query)

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { preventScrollReset: true })
  }

  function pageLink(number: number) {
    const next = new URLSearchParams(params)
    if (number === 1) next.delete('page')
    else next.set('page', String(number))
    return '/radios/' + (next.size ? '?' + next : '')
  }

  const totalPages = result.data?.totalPages ?? 0
  const numbers = [...new Set([1, Math.max(1, page - 1), page, Math.min(totalPages, page + 1), totalPages])]
    .filter(number => number >= 1 && number <= totalPages).sort((a, b) => a - b)

  return <>
    <PageHero title="Rádios" eyebrow="Catálogo" variant="catalog" description="Encontre sua próxima estação por nome, categoria ou cidade.">
      <form className="catalog-filters filters" role="search" onSubmit={event => {
        event.preventDefault()
        update('search', String(new FormData(event.currentTarget).get('search')).trim())
      }}>
        <label><span><Search size={16} /> Buscar rádio, categoria ou cidade</span><input key={search} type="search" name="search" defaultValue={search} maxLength={100} placeholder="O que você quer ouvir?" /></label>
        <label><span><SlidersHorizontal size={16} /> Categoria</span><select value={category} onChange={event => update('category', event.target.value)}>
          <option value="">Todas</option>{categories.data?.map(item => <option value={item.slug} key={item.id}>{item.name}</option>)}
        </select></label>
        <button className="button primary">Buscar</button>
      </form>
    </PageHero>
    <section className="shell page catalog-results" aria-labelledby="catalog-results">
      <div className="section-heading"><h2 id="catalog-results" tabIndex={-1}>Emissoras</h2>
        {result.data && <span>{result.data.total} {result.data.total === 1 ? 'rádio encontrada' : 'rádios encontradas'}</span>}
      </div>
      {result.loading && <p className="placeholder" role="status">Buscando rádios…</p>}
      {result.error && <Empty>{result.error}</Empty>}
      {result.data && (result.data.items.length ? <RadioCards radios={result.data.items} /> :
        <Empty>Nenhuma rádio encontrada. {page > 1 && <Link to={pageLink(1)}>Voltar à primeira página</Link>}</Empty>)}
      {totalPages > 1 && <nav className="pagination catalog-pagination" aria-label="Páginas do catálogo">
        {page > 1 ? <Link className="button secondary" to={pageLink(page - 1)} onClick={focusResults}>Anterior</Link> :
          <button className="button secondary" disabled>Anterior</button>}
        <div className="page-numbers">{numbers.map((number, index) => <span key={number}>
          {index > 0 && number - numbers[index - 1] > 1 && <span aria-hidden="true">…</span>}
          <Link to={pageLink(number)} aria-label={'Página ' + number} aria-current={number === page ? 'page' : undefined} onClick={focusResults}>{number}</Link>
        </span>)}</div>
        {page < totalPages ? <Link className="button secondary" to={pageLink(page + 1)} onClick={focusResults}>Próxima</Link> :
          <button className="button secondary" disabled>Próxima</button>}
      </nav>}
    </section>
  </>
}

function focusResults() {
  document.getElementById('catalog-results')?.focus()
}
