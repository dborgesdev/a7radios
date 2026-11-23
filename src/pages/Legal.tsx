import { PageHero } from '../components/PageHero'
import { useMemo } from 'react'
import { useApi } from '../api'
import type { Terms } from '../domain'

export function Legal({ terms }: { terms?: boolean }) {
  const resource = useApi<Terms>(terms ? '/terms' : '/privacy')
  const html = resource.data?.html
  const sections = useMemo(() => html
    ? [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('h2[id], h3[id], h4[id]')]
    : [], [html])
  return <>
    <PageHero variant="legal" eyebrow="Documentos da A7" title={terms ? 'Termo de Responsabilidade' : 'Política de Privacidade'} />
    <div className="shell page legal-page"><article>
      {resource.loading ? <p role="status">Carregando…</p> : resource.data ? <>
        <p className="muted">Versão {resource.data.version}</p>
        {!!sections.length && <nav className="legal-index" aria-label="Seções do documento"><ul>
          {sections.map(section => <li key={section.id}><a href={'#' + section.id}>{section.textContent}</a></li>)}
        </ul></nav>}
        {html ? <div className="document-body" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="legal-text">{resource.data.content}</div>}
      </> : <p>{resource.error ?? 'O documento aguarda publicação.'}</p>}
    </article></div>
  </>
}
