import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, useApi } from '../api'
import { useAuth } from '../auth'
import { CategorySuggestion } from '../components/CategorySuggestion'
import { AppLinkFields } from '../components/AppLinkFields'
import { RemovalRequest } from '../components/RemovalRequest'
import { PageHero } from '../components/PageHero'
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
    <PageHero variant="editor" eyebrow="Minha conta" title={id ? 'Editar Rádio' : 'Cadastrar Rádio'}
      description="Prepare as informações da emissora para análise da moderação." />
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
  const [suggestion, setSuggestion] = useState(existing?.categorySuggestion ?? undefined)
  const [imageError, setImageError] = useState('')
  const [submissionKey] = useState(() => crypto.randomUUID())
  const [country, setCountry] = useState(draft?.country ?? 'Brasil')
  const [preview, setPreview] = useState('')
  const termsDialog = useRef<HTMLDialogElement>(null)
  const termsTrigger = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ message: string; field?: string }>()
  const locked = existing?.revisionStatus === 'pending' || existing?.status === 'archived'
  useEffect(() => {
    if (window.location.hash === '#remocao') document.getElementById('remocao')?.scrollIntoView()
  }, [])
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview)
  }, [preview])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || locked || !terms) return
    const data = new FormData(event.currentTarget)
    data.set('submissionKey', submissionKey)
    data.set('termsVersion', terms.version)
    if (suggestion) data.set('categorySuggestion', suggestion.id)
    if (existing) {
      data.set('version', String(existing.version))
      data.set('revisionId', String(existing.revisionId))
    }
    setFailure(undefined); setBusy(true)
    try {
      await api(existing ? '/me/radios/' + existing.id + '/revisions' : '/me/radios', {
        method: 'POST', headers: { 'X-WP-Nonce': nonce }, body: data,
      })
      navigate('/painel/')
    } catch (error) {
      setFailure({ message: (error as Error).message, field: error instanceof ApiError ? error.field : undefined })
    } finally { setBusy(false) }
  }
  const fieldError = (name: string) => failure?.field === name ? <small className="error" role="alert">{failure.message}</small> : null
  return <div className="shell form-workspace">
    <div className="editor">
    {locked && <p>{existing?.status === 'archived' ? 'Esta rádio está arquivada.' : 'Sua proposta está em análise.'}</p>}
    {!terms && <p>O envio será liberado quando o Termo de Responsabilidade aprovado estiver disponível.</p>}
    {!categories.length && <p>Nenhuma categoria disponível para cadastro.</p>}
    {failure && !failure.field && <p className="error" role="alert">{failure.message}</p>}
    <form className="form" onSubmit={submit}>
      <fieldset className="editor-fields" disabled={busy || !!locked}>
        <section className="form-panel" id="identidade"><h2>Identidade da rádio</h2>
        <label>Nome da rádio<input name="name" defaultValue={draft?.name} required maxLength={100} />
          <small>Nome público da emissora. Ex.: Rádio A7 Sertanejo FM</small>{fieldError('name')}</label>
        <label>Categoria/gênero<select name="categoryId" defaultValue={draft?.categoryId || ''} required={!suggestion}>
          <option value="">{suggestion ? 'Sem categoria alternativa' : 'Selecione uma categoria'}</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>{fieldError('categoryId')}</label>
        {!locked && <CategorySuggestion nonce={nonce} selected={suggestion} onSelect={setSuggestion} />}
        {locked && suggestion && <p>Sugestão vinculada: {suggestion.name}</p>}
        <div className="field-grid location-fields">
          <label>País<select name={country === 'Outro' ? undefined : 'country'} value={country} onChange={event => setCountry(event.target.value)} required>
            {[...new Set([...countries.map(code => display.of(code) ?? code), 'Outro', country])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
              .map(name => <option key={name}>{name}</option>)}
          </select>{country === 'Outro' && <input aria-label="Informe o país" name="country" required maxLength={80} />}
            {fieldError('country')}</label>
          <label>Estado/região{country === 'Brasil' ? <select key="br" name="region" defaultValue={draft?.region ?? ''} required>
            <option value="">Selecione</option>{states.map(state => <option key={state}>{state}</option>)}</select> :
            <input key="other" name="region" defaultValue={draft?.region} placeholder="Informe a região ou localidade" maxLength={80} required={country === 'Outro'} />}
            {fieldError('region')}</label>
          <label>Cidade<input name="city" defaultValue={draft?.city} maxLength={100} autoComplete="address-level2" />{fieldError('city')}</label>
        </div>
        </section>
        <section className="form-panel" id="transmissao"><h2>Transmissão e links</h2>
        <label>URL do streaming<input name="streamUrl" type="url" defaultValue={draft?.streamUrl} required maxLength={2000} />
          <small>Cole o endereço direto de áudio, com https://, porta e caminho quando houver. Ex.: https://s04.svrdedicado.org:7228/stream. Não cole a página do player.</small>{fieldError('streamUrl')}</label>
        <label>Website oficial<input name="websiteUrl" type="url" defaultValue={draft?.websiteUrl} maxLength={2000} />
          <small>Endereço do site da rádio, começando por https://</small>{fieldError('websiteUrl')}</label>
        <AppLinkFields draft={draft} fieldError={fieldError} />
        </section>
        <section className="form-panel" id="apresentacao"><h2>Apresentação</h2>
        <label>Descrição<textarea name="description" defaultValue={draft?.description} required rows={5} maxLength={2000} />
          <small>Apresente sua rádio, programação e estilo musical. Não inclua informações falsas.</small>{fieldError('description')}</label>
        <label className="upload-area"><span className="button primary">Escolher imagem</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
          const file = event.target.files?.[0]
          const invalid = file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
          if (invalid) event.target.value = ''
          setImageError(invalid ? 'Escolha um PNG, JPG ou WebP de até 5 MB.' : '')
          setPreview(file && !invalid ? URL.createObjectURL(file) : '')
        }} />
          <small>Imagem quadrada (1:1). Recomendado: 512 × 512 pixels. PNG, JPG ou WebP. Limite de 5 MB.</small>{fieldError('image')}{imageError && <small className="error" role="alert">{imageError}</small>}</label>
        {draft && !preview && <p className="muted">A imagem do último envio será mantida se você deixar os campos de imagem vazios.</p>}
        {preview && <img className="image-preview" src={preview} width="128" height="128" alt="Prévia do recorte quadrado" />}
        {remoteImages && <label>URL da imagem<input name="imageUrl" type="url" disabled={!!preview} maxLength={2000} />
          <small>Link direto HTTPS para uma imagem; use este campo apenas se não enviar arquivo.</small>{fieldError('imageUrl')}</label>}
        </section>
        {terms && <section className="terms-acceptance form-panel" id="revisao"><h2>Termo e revisão</h2>
          <div className="actions"><button type="button" className="button secondary" ref={termsTrigger} onClick={() => termsDialog.current?.showModal()}>Ler Termo de Responsabilidade</button>
          <Link to="/privacidade/" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link></div>
          <dialog className="document-dialog" ref={termsDialog} onClose={() => termsTrigger.current?.focus()} aria-labelledby="terms-heading">
            <h2 id="terms-heading">Termo de Responsabilidade</h2><p className="muted">Versão {terms.version}</p>
            {terms.html ? <div className="document-body" dangerouslySetInnerHTML={{ __html: terms.html }} /> : <div className="legal-text">{terms.content}</div>}
            <div className="actions">
              <button type="button" className="button primary" onClick={() => termsDialog.current?.close()}>Concluir leitura</button>
              <button type="button" className="button secondary" onClick={() => termsDialog.current?.close()}>Fechar</button>
            </div>
          </dialog>
          <label className="check"><input type="checkbox" name="accepted" value="1" required />
          Li e concordo com o Termo de Responsabilidade</label></section>}
      </fieldset>
      <button className="button primary" disabled={busy || !!locked || !terms || !!imageError || (!categories.length && !suggestion)}>{busy ? 'Enviando…' : 'Enviar para análise'}</button>
    </form>
    {!!existing?.history.length && <section><h2>Histórico</h2><ul>
      {existing.history.map(item => <li key={item.id + '-' + item.status + '-' + item.decidedAt}>{item.decidedAt && new Date(item.decidedAt).toLocaleDateString('pt-BR')} ·
        {' ' + statusLabel[item.status]}{item.reason && ' · ' + item.reason}</li>)}</ul></section>}
    </div>
    <aside className="editor-sidebar" aria-label="Seções do formulário">
      <nav className="form-panel"><h2>Neste formulário</h2>
        <a href="#identidade">Identidade da rádio</a><a href="#transmissao">Transmissão e links</a>
        <a href="#apresentacao">Apresentação</a>{terms && <a href="#revisao">Termo e revisão</a>}
      </nav>
      {existing && (existing.status === 'approved' || existing.removalStatus) && <section className="form-panel removal-panel" id="remocao">
        <h2>Remoção de rádio</h2><p>O pedido passa pela moderação.</p>
        <RemovalRequest id={existing.id} name={existing.draft.name} owner status={existing.removalStatus} />
      </section>}
    </aside>
  </div>
}
