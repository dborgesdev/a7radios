import { useApi } from '../api'
import type { Terms } from '../domain'

export function Legal({ terms }: { terms?: boolean }) {
  const resource = useApi<Terms>(terms ? '/terms' : '/privacy')
  return <div className="shell page narrow">
    <h1>{terms ? 'Termo de Responsabilidade' : 'Privacidade'}</h1>
    {resource.loading ? <p role="status">Carregando…</p> : resource.data ? <>
      <p className="muted">Versão {resource.data.version}</p>
      <div className="legal-text">{resource.data.content}</div>
    </> : <p>{resource.error ?? 'O documento aguarda publicação.'}</p>}
  </div>
}
