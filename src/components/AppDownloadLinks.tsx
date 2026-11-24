import { Download } from 'lucide-react'
import type { RadioFields } from '../domain'

type AppLinks = Pick<RadioFields, 'appDownloadUrl' | 'appLinkMode' | 'androidAppUrl' | 'iphoneAppUrl'>

export function appLinks(radio: AppLinks) {
  return radio.appLinkMode === 'platforms'
    ? [{ label: 'Android', url: radio.androidAppUrl }, { label: 'iPhone', url: radio.iphoneAppUrl }].filter(link => link.url)
    : radio.appDownloadUrl ? [{ label: 'Baixar App', url: radio.appDownloadUrl }] : []
}

export function AppDownloadLinks({ radio }: { radio: AppLinks }) {
  return appLinks(radio).map(({ label, url }) => <a key={label} className="button secondary" href={url}
    target="_blank" rel="noopener noreferrer">
    {label === 'Baixar App' ? <Download size={18} aria-hidden="true" /> :
      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        {label === 'Android' ? <>
          <path d="M4 17a8 8 0 0 1 16 0H4Z" />
          <path d="m6 6 2 4m10-4-2 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M8 14h.01m7.99 0h.01" stroke="#8f1431" strokeWidth="1.8" strokeLinecap="round" />
        </> : <path d="M16.5 4.5c.9-1 1.1-2.1 1-3.2-1.1.1-2.5.8-3.2 1.7-.8.9-1.2 2-1 3.1 1.2 0 2.4-.6 3.2-1.6ZM20.7 17.5c-.6 1.3-.8 1.9-1.6 3-.9 1.3-2 2.5-3.3 2.5-1.1 0-1.5-.7-3.1-.7s-2 .7-3.1.7c-1.2 0-2.2-1.1-3.1-2.4-2.4-3.4-2.7-7.2-1.4-9.3 1-1.6 2.6-2.5 4-2.5 1.2 0 2 .7 3.2.7 1.2 0 1.9-.7 3.2-.7 1.3 0 2.6.7 3.6 1.9-3.1 1.7-2.6 5.8 1.6 6.8Z" />}
      </svg>}
    {label}
  </a>)
}
