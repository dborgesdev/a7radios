import { AudioLines, Radio as RadioIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { radioPath, locationLabel, type Radio } from '../domain'
import { FavoriteButton } from '../favorites'
import { PlayButton } from '../player'
import { useState, type CSSProperties, type ComponentPropsWithRef } from 'react'

export function Cover({ radio, eager = false }: { radio: Radio; eager?: boolean }) {
  const [failed, setFailed] = useState('')
  return radio.image.url && failed !== radio.image.url
    ? <img className="cover" src={radio.image.url} alt={radio.image.alt} width={radio.image.width} height={radio.image.height} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(radio.image.url)} />
    : <div className={'cover cover-fallback tone-' + radio.id % 4} aria-hidden="true"><AudioLines size={70} strokeWidth={1.2} /></div>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty"><RadioIcon size={30} strokeWidth={1.5} /><div>{children}</div></div>
}

export function RadioCards({ radios, compactLocation = false, shelf }: { radios: Radio[]; compactLocation?: boolean; shelf?: ComponentPropsWithRef<'ul'> & { label: string } }) {
  const { label, ...track } = shelf ?? {}
  return <ul {...track} className={shelf ? 'radio-grid radio-track' : 'radio-grid'} tabIndex={shelf ? 0 : undefined} aria-label={label}>
    {radios.map((radio, index) => <li className="radio-card" key={radio.id} style={{ '--delay': Math.min(index, 9) * 35 + 'ms' } as CSSProperties}>
      <div className="cover-wrap"><Link tabIndex={-1} aria-hidden="true" to={radioPath(radio.slug)}><Cover radio={radio} /></Link>
        <FavoriteButton slug={radio.slug} compact /></div>
      <div className="card-info"><p className="eyebrow">{radio.category.name}</p>
        <h3><Link to={radioPath(radio.slug)}>{radio.name}</Link></h3>
        <p className="muted location">{compactLocation ? [radio.region, radio.country].filter(Boolean).join(', ') : locationLabel(radio)}</p>
        {radio.streamUrl ? <PlayButton radio={radio} queue={radios} compact /> : <Link className="play-icon" aria-label={'Ver ' + radio.name} to={radioPath(radio.slug)}><AudioLines size={19} /></Link>}
      </div>
    </li>)}
  </ul>
}
