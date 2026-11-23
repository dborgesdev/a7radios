import type { ReactNode } from 'react'
import { AudioLines } from 'lucide-react'

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return <div className="auth-stage">
    <div className="shell auth-composition">
      <header><p className="hero-label"><AudioLines size={18} aria-hidden="true" /> A7 Rádios On-Line</p><h1>{title}</h1></header>
      <section className="auth-card" aria-label={title}>{children}</section>
    </div>
  </div>
}
