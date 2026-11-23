import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, useApi } from '../api'
import { useAuth } from '../auth'
import { statusLabel, type Category, type OwnRadio, type Terms } from '../domain'

const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const countries = 'BR AR BO CL CO CR CU DO EC ES US FR IT JP MX PY PE PT GB UY VE AO CV MZ DE AU CA CN IN'.split(' ')
const display = new Intl.DisplayNames(['pt-BR'], { type: 'region' })

export function RadioForm() {
  const { id } = useParams()
  const { value } = useAuth()
  const existing = useApi<OwnRadio>(id ? '/me/radios/' + id : null, value?.nonce)
  const categories = useApi<Category[]>('/me/categories', value?.nonce)
  const settings = useApi<{ terms: Terms; remoteImages: boolean }>('/me/submission-settings', value?.nonce)
  return <>
    <h1>{id ? 'Editar rádio' : 'Cadastrar rádio'}</h1>
    {(existing.loading || categories.loading || settings.loading) ? <p role="status">Carregando formulário…</p> :
      (existing.error || categories.error || settings.error) ? <p role="alert">{existing.error || categories.error || settings.error}</p> :
      <Editor key={id ?? 'new'} existing={existing.data} categories={categories.data ?? []} terms={settings.data?.terms ?? null}
        remoteImages={settings.data?.remoteImages ?? false} nonce={value?.nonce ?? ''} />}
  </>
}

function Editor({ existing, categories, terms, remoteImages, nonce }: {
  existing?: OwnRadio; categories: Category[]; terms: Terms; remoteImages: boolean; nonce: string
}) {
  const navigate = useNavigate()
  const draft = existing?.draft
  const [submissionKey] = useState(() => crypto.randomUUID())
  const [country, setCountry] = useState(draft?.country ?? 'Brasil')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ message: string; field?: string }>()
  const locked = existing?.revisionStatus === 'pending' || existing?.status === 'archived'
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview)
  }, [preview])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || locked || !terms) return
    const data = new FormData(event.currentTarget)
    data.set('submissionKey', submissionKey)
    data.set('termsVersion', terms.version)
    if (existing) {
      data.set('version', String(existing.version))
      data.set('revisionId', String(existing.revisionId))
    }
    setFailure(undefined); setBusy(true)
    try {
      await api(existing ? '/me/radios/' + existing.id + '/revisions' : '/me/radios', {
        method: 'POST', headers: { 'X-WP-Nonce': nonce }, body: data,
      })
      navigate('/painel/radios/')
    } catch (error) {
      setFailure({ message: (error as Error).message, field: error instanceof ApiError ? error.field : undefined })
    } finally { setBusy(false) }
  }
  const fieldError = (name: string) => failure?.field === name ? <small className="error" role="alert">{failure.message}</small> : null
  return <div className="editor">
    {locked && <p>{existing?.status === 'archived' ? 'Esta rádio está arquivada.' : 'Sua proposta está em análise.'}</p>}
    {!terms && <p>O envio será liberado quando o Termo de Responsabilidade aprovado estiver disponível.</p>}
    {!categories.length && <p>Nenhuma categoria disponível para cadastro.</p>}
    {failure && !failure.field && <p className="error" role="alert">{failure.message}</p>}
    <form className="form" onSubmit={submit}>
      <fieldset disabled={busy || !!locked}>
        <label>Nome da rádio<input name="name" defaultValue={draft?.name} required maxLength={100} />
          <small>Nome público da emissora. Ex.: Rádio A7 Sertanejo FM</small>{fieldError('name')}</label>
        <label>Categoria/gênero<select name="categoryId" defaultValue={draft?.categoryId ?? ''} required>
          <option value="" disabled>Selecione uma categoria</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>{fieldError('categoryId')}</label>
        <div className="field-grid">
          <label>País<select name={country === 'Outro' ? undefined : 'country'} value={country} onChange={event => setCountry(event.target.value)} required>
            {[...new Set([...countries.map(code => display.of(code) ?? code), 'Outro', country])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
              .map(name => <option key={name}>{name}</option>)}
          </select>{country === 'Outro' && <input aria-label="Informe o país" name="country" required maxLength={80} />}
            {fieldError('country')}</label>
          <label>Estado/região{country === 'Brasil' ? <select key="br" name="region" defaultValue={draft?.region ?? ''} required>
            <option value="">Selecione</option>{states.map(state => <option key={state}>{state}</option>)}</select> :
            <input key="other" name="region" defaultValue={draft?.region} placeholder="Informe a região ou localidade" maxLength={80} required={country === 'Outro'} />}
            {fieldError('region')}</label>
        </div>
        <label>URL do streaming<input name="streamUrl" type="url" defaultValue={draft?.streamUrl} required maxLength={2000} />
          <small>Cole o endereço direto de áudio, com https://, porta e caminho quando houver. Ex.: https://s04.svrdedicado.org:7228/stream. Não cole a página do player.</small>{fieldError('streamUrl')}</label>
        <label>Website oficial<input name="websiteUrl" type="url" defaultValue={draft?.websiteUrl} maxLength={2000} />
          <small>Endereço do site da rádio, começando por https://</small>{fieldError('websiteUrl')}</label>
        <label>URL de download do aplicativo<input name="appDownloadUrl" type="url" defaultValue={draft?.appDownloadUrl} maxLength={2000} />
          <small>Cole o link público da loja de aplicativos ou da página oficial de download; não envie arquivos de aplicativo.</small>{fieldError('appDownloadUrl')}</label>
        <label>Descrição<textarea name="description" defaultValue={draft?.description} required rows={5} maxLength={2000} />
          <small>Apresente sua rádio, programação e estilo musical. Não inclua informações falsas.</small>{fieldError('description')}</label>
        <label>Imagem<input name="image" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setPreview(event.target.files?.[0] ? URL.createObjectURL(event.target.files[0]) : '')} />
          <small>Imagem quadrada (1:1). Recomendado: 512 × 512 pixels. PNG, JPG ou WebP. Limite de 5 MB.</small>{fieldError('image')}</label>
        {draft && !preview && <p className="muted">A imagem do último envio será mantida se você deixar os campos de imagem vazios.</p>}
        {preview && <img className="image-preview" src={preview} width="128" height="128" alt="Prévia do recorte quadrado" />}
        {remoteImages && <label>URL da imagem<input name="imageUrl" type="url" disabled={!!preview} maxLength={2000} />
          <small>Link direto HTTPS para uma imagem; use este campo apenas se não enviar arquivo.</small>{fieldError('imageUrl')}</label>}
        {terms && <div><label className="check"><input type="checkbox" name="accepted" value="1" required />
          Li e concordo com o Termo de Responsabilidade</label>
          <Link to="/termos/" target="_blank" rel="noopener noreferrer">Ler Termo de Responsabilidade</Link></div>}
      </fieldset>
      <button className="button primary" disabled={busy || !!locked || !terms || !categories.length}>{busy ? 'Enviando…' : 'Enviar para análise'}</button>
    </form>
    {!!existing?.history.length && <section><h2>Histórico</h2><ul>
      {existing.history.map(item => <li key={item.id}>{item.decidedAt && new Date(item.decidedAt).toLocaleDateString('pt-BR')} ·
        {' ' + statusLabel[item.status]}{item.reason && ' · ' + item.reason}</li>)}</ul></section>}
  </div>
}
