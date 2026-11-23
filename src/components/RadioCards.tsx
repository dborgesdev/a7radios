import { AudioLines, Radio as RadioIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { radioPath, locationLabel, type Radio } from '../domain'
import { FavoriteButton } from '../favorites'
import { PlayButton } from '../player'
import type { CSSProperties } from 'react'

export function Cover({ radio }: { radio: Radio }) {
  return radio.image.url
    ? <img className="cover" src={radio.image.url} alt={radio.image.alt} width={radio.image.width} height={radio.image.height} loading="lazy" />
    : <div className={'cover cover-fallback tone-' + radio.id % 4} aria-hidden="true"><AudioLines size={70} strokeWidth={1.2} /></div>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty"><RadioIcon size={30} strokeWidth={1.5} /><div>{children}</div></div>
}

export function RadioCards({ radios }: { radios: Radio[] }) {
  return <ul className="radio-grid">
    {radios.map((radio, index) => <li className="radio-card" key={radio.id} style={{ '--delay': Math.min(index, 9) * 35 + 'ms' } as CSSProperties}>
      <div className="cover-wrap"><Link tabIndex={-1} aria-hidden="true" to={radioPath(radio.slug)}><Cover radio={radio} /></Link>
        <FavoriteButton slug={radio.slug} compact /></div>
      <div className="card-info"><p className="eyebrow">{radio.category.name}</p>
        <h3><Link to={radioPath(radio.slug)}>{radio.name}</Link></h3>
        <p className="muted location">{locationLabel(radio)}</p>
        {radio.streamUrl ? <PlayButton radio={radio} compact /> : <Link className="play-icon" aria-label={'Ver ' + radio.name} to={radioPath(radio.slug)}><AudioLines size={19} /></Link>}
      </div>
    </li>)}
  </ul>
}
