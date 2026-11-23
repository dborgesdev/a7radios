import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, SkipBack, SkipForward, Volume2, X, RadioTower, Square } from 'lucide-react'
import { listenToMetadata, type NowPlaying } from './metadata'
import { FavoriteButton } from './favorites'
import { Link } from 'react-router-dom'
import { radioPath, type Radio } from './domain'

type Playback = 'loading' | 'playing' | 'paused' | 'error'
type PlayerState = { mainVisible: boolean; setMainVisible: (visible: boolean) => void; radio?: Radio; status: Playback; metadata?: NowPlaying; toggle: (radio: Radio, queue?: Radio[]) => void; skip: (offset: number) => void; canSkip: boolean; autoplay: (radio: Radio) => void; stop: () => void; volume: number; changeVolume: (value: number) => void }
const Player = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null)
  const generation = useRef(0)
  const [radio, setRadio] = useState<Radio>()
  const [queue, setQueue] = useState<Radio[]>([])
  const [status, setStatus] = useState<Playback>('paused')
  const [volume, setVolume] = useState(1)
  const [mainVisible, setMainVisible] = useState(false)
  const [metadata, setMetadata] = useState<NowPlaying>()
  const stopMetadata = useRef<() => void>(null)
  function clearMetadata() {
    stopMetadata.current?.()
    stopMetadata.current = null
    setMetadata(undefined)
  }
  useEffect(() => {
    const element = audio.current
    return () => { stopMetadata.current?.(); element?.pause(); element?.removeAttribute('src'); element?.load() }
  }, [])
  function play(next: Radio, automatic = false) {
    const element = audio.current
    if (!element) return
    const ticket = ++generation.current
    clearMetadata()
    if (radio?.id === next.id && !element.paused) { element.pause(); setStatus('paused'); return }
    if (radio?.id !== next.id || status === 'error') {
      element.pause()
      element.src = next.streamUrl
    }
    setRadio(next)
    setStatus('loading')
    void element.play().catch((error: unknown) => {
      if (ticket !== generation.current) return
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'paused' : 'error')
      if (automatic && element.paused) clearMetadata()
    })
  }
  function stop() {
    ++generation.current
    clearMetadata()
    audio.current?.pause()
    audio.current?.removeAttribute('src')
    audio.current?.load()
    setRadio(undefined)
    setQueue([])
    setStatus('paused')
  }
  const queueIndex = queue.findIndex(item => item.id === radio?.id)
  function toggle(next: Radio, nextQueue?: Radio[]) {
    if (nextQueue) setQueue(nextQueue.filter(item => item.streamUrl))
    else if (next.id !== radio?.id) setQueue([])
    play(next)
  }
  function skip(offset: number) {
    if (queueIndex >= 0 && queue.length > 1) play(queue[(queueIndex + offset + queue.length) % queue.length])
  }
  return <Player.Provider value={{ mainVisible, setMainVisible, radio, status, metadata, toggle, skip, canSkip: queueIndex >= 0 && queue.length > 1, autoplay: next => {
    if (radio || !next.streamUrl) return
    play(next, true)
  }, stop, volume, changeVolume: value => { if (audio.current) audio.current.volume = value } }}>
    <audio ref={audio} preload="none"
      onVolumeChange={event => setVolume(event.currentTarget.volume)}
      onPlaying={() => {
        const element = audio.current
        if (!element || element.paused) return
        setStatus('playing')
        stopMetadata.current ??= listenToMetadata(element, setMetadata)
      }}
      onWaiting={() => { if (!audio.current?.paused) setStatus('loading') }}
      onEnded={() => { clearMetadata(); setStatus('paused') }}
      onPause={() => { if (audio.current?.paused) { clearMetadata(); setStatus(old => old === 'error' ? old : 'paused') } }}
      onError={() => { if (audio.current?.getAttribute('src')) { clearMetadata(); setStatus('error') } }} />
    {children}
  </Player.Provider>
}

export function useDirectAutoplay(radio: Radio, direct: boolean) {
  const player = useContext(Player)!
  const attempted = useRef(false)
  const play = useEffectEvent(() => player.autoplay(radio))
  useEffect(() => {
    if (direct && !attempted.current) {
      attempted.current = true
      play()
    }
  }, [direct])
}

export function PlayButton({ radio, compact = false, queue }: { radio: Radio; compact?: boolean; queue?: Radio[] }) {
  const player = useContext(Player)!
  const active = player.radio?.id === radio.id && ['loading', 'playing'].includes(player.status)
  return <button className={compact ? 'play-icon' : 'button primary'} type="button"
    onClick={() => player.toggle(radio, queue)} disabled={!radio.streamUrl}
    aria-label={(active ? 'Pausar ' : 'Ouvir ') + radio.name}>
    {active ? <Pause size={20} /> : <Play size={20} />}
    {!compact && (active ? 'Pausar' : 'Ouvir Rádio')}
  </button>
}

const playbackMessage: Record<Playback, string> = {
  loading: 'Conectando…', playing: 'Reproduzindo ao vivo', paused: 'Pausado', error: 'Stream indisponível. Tente novamente.',
}

function VolumeControl({ volume, changeVolume }: Pick<PlayerState, 'volume' | 'changeVolume'>) {
  return <label className="volume"><Volume2 size={20} aria-hidden="true" /><input type="range" min="0" max="1" step=".01"
    value={volume} aria-label="Volume" onChange={event => changeVolume(Number(event.target.value))} /></label>
}

export function IntegratedPlayer({ radio }: { radio: Radio }) {
  const player = useContext(Player)!
  const panel = useRef<HTMLElement>(null)
  const { setMainVisible } = player
  useEffect(() => {
    const element = panel.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setMainVisible(entry.isIntersecting), {
      rootMargin: '-' + Math.ceil(document.querySelector('.site-header')?.getBoundingClientRect().height ?? 80) + 'px 0px 0px 0px',
    })
    observer.observe(element)
    return () => { observer.disconnect(); setMainVisible(false) }
  }, [setMainVisible])
  const current = player.radio?.id === radio.id
  return <section ref={panel} className="integrated-player" aria-label="Player da Rádio">
    <div className="integrated-status">
      <NowPlayingInfo radio={current ? radio : player.radio ?? radio} metadata={player.metadata} />
      {current && player.status !== 'playing' && <small role="status">{playbackMessage[player.status]}</small>}
    </div>
    <div className="integrated-controls">
      <PlayButton radio={radio} />
      <VolumeControl {...player} />
      {player.radio && <button type="button" className="icon-button" aria-label="Parar reprodução" onClick={player.stop}><Square size={17} /></button>}
    </div>
  </section>
}

function NowPlayingInfo({ radio, metadata, link = false }: { radio: Radio; metadata?: NowPlaying; link?: boolean }) {
  const [failed, setFailed] = useState('')
  const artwork = metadata?.artwork !== failed ? metadata?.artwork : undefined
  const source = artwork ?? radio.image.url
  const title = metadata?.title ?? radio.name
  return <div className="playing-info">
    {source && source !== failed ? <img src={source} width="52" height="52" alt="" referrerPolicy="no-referrer" onError={() => setFailed(source)} />
      : <span className="on-air-icon"><RadioTower size={22} aria-hidden="true" /></span>}
    <div>{link ? <Link to={radioPath(radio.slug)}>{title}</Link> : <strong>{title}</strong>}
      {metadata?.artist && <small>{metadata.artist}</small>}
    </div>
  </div>
}

export function PlayerBar() {
  const { radio, status, metadata, stop, volume, changeVolume, canSkip, skip, mainVisible } = useContext(Player)!
  if (!radio || mainVisible || (status !== 'playing' && status !== 'loading')) return null
  const message = playbackMessage[status]
  return <aside className="player-bar" aria-label="Player">
    <div className="player-info"><NowPlayingInfo radio={radio} metadata={metadata} link />
      {status === 'loading' && <small role="status">{message}</small>}</div>
    <div className="player-controls">
      <FavoriteButton slug={radio.slug} compact />
      {canSkip && <button className="icon-button player-skip" type="button" onClick={() => skip(-1)} aria-label="Rádio anterior"><SkipBack size={19} /></button>}
      <PlayButton radio={radio} compact />
      {canSkip && <button className="icon-button player-skip" type="button" onClick={() => skip(1)} aria-label="Próxima Rádio"><SkipForward size={19} /></button>}
    </div>
    <VolumeControl volume={volume} changeVolume={changeVolume} />
    {status === 'playing' && <span className="player-live">Ao vivo</span>}
    <button type="button" className="icon-button" aria-label="Fechar player" onClick={stop}><X size={22} /></button>
  </aside>
}
