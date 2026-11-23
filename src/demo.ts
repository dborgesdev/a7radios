import type { Category, Radio } from './domain'

const categories: Category[] = ['Música', 'Cultura', 'Notícias', 'Esportes'].map((name, index) => ({
  id: index + 1, name, slug: ['musica', 'cultura', 'noticias', 'esportes'][index], count: 1,
}))
const radios: Radio[] = ['Frequência', 'Horizonte', 'Ponto de Encontro', 'Estação'].map((name, index) => ({
  id: index + 1, name: name + ' DEMO', slug: categories[index].slug + '-demo',
  category: categories[index], country: 'Brasil', region: '',
  description: 'Cadastro sintético para avaliação visual local do catálogo A7.',
  image: { url: '', width: 512, height: 512, alt: '' }, streamUrl: '', websiteUrl: '',
  appDownloadUrl: '', approvedUpdatedAt: '', visitCount: 0,
}))

export function demoRequest<T>(path: string): T {
  const [route, query] = path.split('?')
  const params = new URLSearchParams(query)
  const search = params.get('search')?.toLocaleLowerCase('pt-BR') ?? ''
  const category = params.get('category')
  const selected = params.get('slugs')?.split(',')
  const items = radios.filter(r => (!selected || selected.includes(r.slug)) && (!category || r.category.slug === category) &&
    (r.name + ' ' + r.category.name).toLocaleLowerCase('pt-BR').includes(search))
  const response = route === '/categories' ? categories
    : route === '/discovery' ? { latest: radios, suggested: [...radios].reverse() }
    : route === '/radios' ? { items, page: 1, perPage: 20, total: items.length, totalPages: 1 }
    : route.startsWith('/radios/') ? radios.find(r => r.slug === route.split('/')[2])
    : null
  if (response === undefined) throw new Error('Rádio indisponível.')
  return response as T
}
