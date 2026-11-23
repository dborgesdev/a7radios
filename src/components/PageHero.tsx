import type { ReactNode } from 'react'
import { AudioLines } from 'lucide-react'

export function PageHero({ title, eyebrow, description, variant, action, children }: {
  title: string; eyebrow: string; description?: string
  variant: 'catalog' | 'favorites' | 'account' | 'editor' | 'auth' | 'legal' | 'error'
  action?: ReactNode; children?: ReactNode
}) {
  return <header className={'page-hero page-hero-' + variant}>
    <div className="shell page-hero-inner">
      <p className="hero-label"><AudioLines size={18} aria-hidden="true" />{eyebrow}</p>
      <div className="page-hero-title"><h1>{title}</h1>{action}</div>
      {description && <p className="page-hero-description">{description}</p>}
      {children}
    </div>
  </header>
}
