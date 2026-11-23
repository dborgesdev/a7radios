import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { RadioCards } from './RadioCards'
import type { Radio } from '../domain'

export function RadioShelf({ id, title, radios, action }: {
  id: string; title: string; radios: Radio[]; action?: ReactNode
}) {
  const track = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  useEffect(() => {
    const list = track.current
    if (!list) return
    const update = () => setEdges({ start: list.scrollLeft <= 1, end: list.scrollLeft + list.clientWidth >= list.scrollWidth - 2 })
    const observer = new ResizeObserver(update)
    observer.observe(list)
    update()
    return () => observer.disconnect()
  }, [radios.length])
  function move(direction: number) {
    const list = track.current
    if (!list) return
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    list.scrollBy({ left: direction * list.clientWidth * .88, behavior })
  }
  return <section className="content-section radio-shelf" aria-labelledby={id}>
    <div className="section-heading"><h2 id={id}>{title}</h2><div className="actions">
      {action}
      <button type="button" className="icon-button shelf-arrow" aria-label={title + ', voltar'} aria-controls={id + '-lista'} disabled={edges.start} onClick={() => move(-1)}><ChevronLeft /></button>
      <button type="button" className="icon-button shelf-arrow" aria-label={title + ', avançar'} aria-controls={id + '-lista'} disabled={edges.end} onClick={() => move(1)}><ChevronRight /></button>
    </div></div>
    <RadioCards radios={radios} compactLocation shelf={{
      id: id + '-lista', label: title, ref: track,
      onScroll: event => {
        const list = event.currentTarget
        setEdges({ start: list.scrollLeft <= 1, end: list.scrollLeft + list.clientWidth >= list.scrollWidth - 2 })
      },
      onKeyDown: event => {
        if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault()
        move(event.key === 'ArrowLeft' ? -1 : 1)
      },
    }} />
  </section>
}
