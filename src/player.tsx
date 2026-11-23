import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, Volume2, X } from 'lucide-react'
import { listenToMetadata, type NowPlaying } from './metadata'
import { Link } from 'react-router-dom'
import { radioPath, type Radio } from './domain'

type Playback = 'loading' | 'playing' | 'paused' | 'error'
type PlayerState = { radio?: Radio; status: Playback; metadata?: NowPlaying; toggle: (radio: Radio) => void; stop: () => void; volume: number; changeVolume: (value: number) => void }
const Player = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null)
  const generation = useRef(0)
  const [radio, setRadio] = useState<Radio>()
  const [status, setStatus] = useState<Playback>('paused')
  const [volume, setVolume] = useState(1)
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
  function toggle(next: Radio) {
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
    void element.play().catch(() => { if (ticket === generation.current) setStatus('error') })
  }
  function stop() {
    ++generation.current
    clearMetadata()
    audio.current?.pause()
    audio.current?.removeAttribute('src')
    audio.current?.load()
    setRadio(undefined)
    setStatus('paused')
  }
  return <Player.Provider value={{ radio, status, metadata, toggle, stop, volume, changeVolume: value => { if (audio.current) audio.current.volume = value } }}>
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

export function PlayButton({ radio, compact = false }: { radio: Radio; compact?: boolean }) {
  const player = useContext(Player)!
  const active = player.radio?.id === radio.id && ['loading', 'playing'].includes(player.status)
  return <button className={compact ? 'play-icon' : 'button primary'} type="button"
    onClick={() => player.toggle(radio)} disabled={!radio.streamUrl}
    aria-label={(active ? 'Pausar ' : 'Ouvir ') + radio.name}>
    {active ? <Pause size={20} /> : <Play size={20} />}
    {!compact && (active ? 'Pausar' : 'Ouvir rádio')}
  </button>
}

export function PlayerBar() {
  const { radio, status, metadata, stop, volume, changeVolume } = useContext(Player)!
  if (!radio) return null
  const message = { loading: 'Conectando…', playing: 'Reproduzindo', paused: 'Pausado', error: 'Stream indisponível. Tente novamente.' }[status]
  return <aside className="player-bar" aria-label="Player">
    {radio.image.url && <img src={radio.image.url} width="52" height="52" alt="" />}
    <div className="player-info"><Link to={radioPath(radio.slug)}>{radio.name}</Link>
      <small role="status">{message}{metadata && " · " + [metadata.title, metadata.artist].filter(Boolean).join(" — ")}</small></div>
    <PlayButton radio={radio} compact />
    <label className="volume"><Volume2 size={20} /><input type="range" min="0" max="1" step=".01" value={volume}
      aria-label="Volume" onChange={event => changeVolume(Number(event.target.value))} /></label>
    <button type="button" className="icon-button" aria-label="Fechar player" onClick={stop}><X size={22} /></button>
  </aside>
}
