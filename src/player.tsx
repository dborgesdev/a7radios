import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, Volume2, X, RadioTower, Square } from 'lucide-react'
import { listenToMetadata, type NowPlaying } from './metadata'
import { FavoriteButton } from './favorites'
import { Link } from 'react-router-dom'
import { radioPath, type Radio } from './domain'

type PlaybackClock = { elapsed: number; startedAt: number | null }
const idleClock: PlaybackClock = { elapsed: 0, startedAt: null }

type Playback = 'loading' | 'playing' | 'paused' | 'error'
type PlayerState = { mainVisible: boolean; setMainVisible: (visible: boolean) => void; radio?: Radio; status: Playback; metadata?: NowPlaying; toggle: (radio: Radio) => void; clock: PlaybackClock; autoplay: (radio: Radio) => void; stop: () => void; volume: number; changeVolume: (value: number) => void }
const Player = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null)
  const generation = useRef(0)
  const [radio, setRadio] = useState<Radio>()
  const [status, setStatus] = useState<Playback>('paused')
  const [clock, setClock] = useState(idleClock)
  function transition(next: Playback, reset = false) {
    const now = performance.now()
    setStatus(next)
    setClock(previous => {
      if (reset) return idleClock
      if (next === 'playing') return previous.startedAt === null ? { ...previous, startedAt: now } : previous
      return previous.startedAt === null ? previous : { elapsed: previous.elapsed + now - previous.startedAt, startedAt: null }
    })
  }
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
    if (radio?.id === next.id && !element.paused) { element.pause(); transition('paused'); return }
    if (radio?.id !== next.id || status === 'error') {
      element.pause()
      element.src = next.streamUrl
    }
    setRadio(next)
    transition('loading', radio?.id !== next.id)
    void element.play().catch((error: unknown) => {
      if (ticket !== generation.current) return
      transition(error instanceof DOMException && error.name === 'NotAllowedError' ? 'paused' : 'error')
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
    transition('paused', true)
  }
  return <Player.Provider value={{ mainVisible, setMainVisible, radio, status, metadata, toggle: next => play(next), clock, autoplay: next => {
    if (radio || !next.streamUrl) return
    play(next, true)
  }, stop, volume, changeVolume: value => { if (audio.current) audio.current.volume = value } }}>
    <audio ref={audio} preload="none"
      onVolumeChange={event => setVolume(event.currentTarget.volume)}
      onPlaying={() => {
        const element = audio.current
        if (!element || element.paused) return
        transition('playing')
        stopMetadata.current ??= listenToMetadata(element, setMetadata)
      }}
      onWaiting={() => { if (!audio.current?.paused) transition('loading') }}
      onEnded={() => { clearMetadata(); transition('paused', true) }}
      onPause={() => { if (audio.current?.paused) { clearMetadata(); transition(audio.current.error ? 'error' : 'paused') } }}
      onError={() => { if (audio.current?.getAttribute('src')) { clearMetadata(); transition('error') } }} />
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

export function PlayButton({ radio, compact = false }: { radio: Radio; compact?: boolean }) {
  const player = useContext(Player)!
  const active = player.radio?.id === radio.id && ['loading', 'playing'].includes(player.status)
  return <button className={compact ? 'play-icon' : 'button primary'} type="button"
    onClick={() => player.toggle(radio)} disabled={!radio.streamUrl}
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
  const playing = player.status === 'playing'
  return <section ref={panel} className="integrated-player grid grid-cols-[minmax(0,1fr)_auto] min-[1101px]:grid-cols-[minmax(0,1fr)_auto_auto]" aria-label="Player da Rádio">
    <div className="integrated-status">
      <NowPlayingInfo radio={current ? radio : player.radio ?? radio} metadata={player.metadata} />
      {current && player.status !== 'playing' && <small role="status">{playbackMessage[player.status]}</small>}
    </div>
    <div className="integrated-controls col-span-full min-[1101px]:col-span-1">
      <PlayButton radio={radio} />
      <VolumeControl {...player} />
      {player.radio && <button type="button" className="icon-button" aria-label="Parar reprodução" onClick={player.stop}><Square size={17} /></button>}
    </div>
    <div className="integrated-equalizer col-start-2 row-start-1 flex h-14 w-20 items-center justify-center gap-1.5 justify-self-end md:w-28 md:gap-2 min-[1101px]:col-start-3" data-playing={playing} aria-hidden="true">
      {[24, 42, 30, 56, 34, 46, 22].map((height, index) => <i className="w-1.5 md:w-2" key={height} style={{ height, animationDelay: -index * .13 + 's' }} />)}
    </div>
    <div className="integrated-session" data-playing={playing}>
      <SessionTime key={(player.radio?.id ?? radio.id) + ':' + player.clock.elapsed + ':' + player.clock.startedAt} clock={player.clock} />
      <span className="session-activity" aria-hidden="true" />
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

function SessionTime({ clock }: { clock: PlaybackClock }) {
  const [seconds, setSeconds] = useState(() => Math.floor((clock.elapsed + (clock.startedAt === null ? 0 : performance.now() - clock.startedAt)) / 1000))
  useEffect(() => {
    if (clock.startedAt === null) return
    const startedAt = clock.startedAt
    const tick = () => setSeconds(Math.floor((clock.elapsed + performance.now() - startedAt) / 1000))
    const timer = window.setInterval(tick, 200)
    return () => window.clearInterval(timer)
  }, [clock])
  const parts = [Math.floor(seconds / 60) % 60, seconds % 60]
  if (seconds >= 3600) parts.unshift(Math.floor(seconds / 3600))
  return <span className="session-time" aria-label="Tempo de reprodução">{parts.map(part => String(part).padStart(2, '0')).join(':')}</span>
}

export function PlayerBar() {
  const { radio, status, metadata, stop, volume, changeVolume, mainVisible } = useContext(Player)!
  if (!radio || mainVisible || (status !== 'playing' && status !== 'loading')) return null
  const message = playbackMessage[status]
  return <aside className="player-bar" aria-label="Player">
    <div className="player-info"><NowPlayingInfo radio={radio} metadata={metadata} link />
      {status === 'loading' && <small role="status">{message}</small>}</div>
    <div className="player-controls">
      <FavoriteButton slug={radio.slug} compact />
      <PlayButton radio={radio} compact />
    </div>
    <VolumeControl volume={volume} changeVolume={changeVolume} />
    {status === 'playing' && <span className="player-live">Ao vivo</span>}
    <button type="button" className="icon-button" aria-label="Fechar player" onClick={stop}><X size={22} /></button>
  </aside>
}
