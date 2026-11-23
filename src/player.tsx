import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { listenToMetadata, type NowPlaying } from './metadata'
import { FavoriteButton } from './favorites'
import { Link } from 'react-router-dom'
import { radioPath, type Radio } from './domain'

type Playback = 'loading' | 'playing' | 'paused' | 'error'
type PlayerState = { radio?: Radio; status: Playback; metadata?: NowPlaying; toggle: (radio: Radio, queue?: Radio[]) => void; skip: (offset: number) => void; canSkip: boolean; autoplay: (radio: Radio) => void; stop: () => void; volume: number; changeVolume: (value: number) => void }
const Player = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null)
  const generation = useRef(0)
  const [radio, setRadio] = useState<Radio>()
  const [queue, setQueue] = useState<Radio[]>([])
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
  const attemptedAutoplay = useRef(false)
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
  return <Player.Provider value={{ radio, status, metadata, toggle, skip, canSkip: queueIndex >= 0 && queue.length > 1, autoplay: next => {
    if (attemptedAutoplay.current || radio || !next.streamUrl) return
    attemptedAutoplay.current = true
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
  const play = useEffectEvent(() => player.autoplay(radio))
  useEffect(() => {
    if (direct) play()
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

export function PlayerBar() {
  const { radio, status, metadata, stop, volume, changeVolume, canSkip, skip } = useContext(Player)!
  if (!radio) return null
  const message = { loading: 'Conectando…', playing: 'Reproduzindo', paused: 'Pausado', error: 'Stream indisponível. Tente novamente.' }[status]
  return <aside className="player-bar" aria-label="Player">
    {radio.image.url && <img src={radio.image.url} width="52" height="52" alt="" />}
    <div className="player-info"><Link to={radioPath(radio.slug)}>{radio.name}</Link>
      <small role="status">{message}{metadata && " · " + [metadata.title, metadata.artist].filter(Boolean).join(" — ")}</small></div>
    <div className="player-controls">
      <FavoriteButton slug={radio.slug} compact />
      {canSkip && <button className="icon-button player-skip" type="button" onClick={() => skip(-1)} aria-label="Rádio anterior"><SkipBack size={19} /></button>}
      <PlayButton radio={radio} compact />
      {canSkip && <button className="icon-button player-skip" type="button" onClick={() => skip(1)} aria-label="Próxima Rádio"><SkipForward size={19} /></button>}
    </div>
    <label className="volume"><Volume2 size={20} /><input type="range" min="0" max="1" step=".01" value={volume}
      aria-label="Volume" onChange={event => changeVolume(Number(event.target.value))} /></label>
    {status === 'playing' && <span className="player-live">Ao vivo</span>}
    <button type="button" className="icon-button" aria-label="Fechar player" onClick={stop}><X size={22} /></button>
  </aside>
}
