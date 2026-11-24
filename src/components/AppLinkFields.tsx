import { useState } from 'react'
import type { RadioFields } from '../domain'

export function AppLinkFields({ draft, fieldError }: {
  draft?: RadioFields; fieldError: (name: string) => React.ReactNode
}) {
  const [mode, setMode] = useState(draft?.appLinkMode ?? 'single')
  return <div className="grid gap-4">
    <label>Modalidade do aplicativo
      <select name="appLinkMode" value={mode} onChange={event => setMode(event.target.value === 'platforms' ? 'platforms' : 'single')}>
        <option value="single">Link único (automático)</option>
        <option value="platforms">Links separados para Android e iPhone</option>
      </select>
      {fieldError('appLinkMode')}
    </label>
    <div hidden={mode !== 'single'}>
      <label>URL de download do aplicativo
        <input name="appDownloadUrl" type="url" disabled={mode !== 'single'} defaultValue={draft?.appDownloadUrl} maxLength={2000} />
        <small>Cole o link público da loja de aplicativos ou da página oficial de download.</small>
        {fieldError('appDownloadUrl')}
      </label>
    </div>
    <div hidden={mode !== 'platforms'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Link do aplicativo para Android
          <input name="androidAppUrl" type="url" disabled={mode !== 'platforms'} defaultValue={draft?.androidAppUrl} maxLength={2000} />
          {fieldError('androidAppUrl')}
        </label>
        <label>Link do aplicativo para iPhone
          <input name="iphoneAppUrl" type="url" disabled={mode !== 'platforms'} defaultValue={draft?.iphoneAppUrl} maxLength={2000} />
          {fieldError('iphoneAppUrl')}
        </label>
      </div>
    </div>
  </div>
}
