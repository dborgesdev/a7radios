export type NowPlaying = { title: string; artist?: string; artwork?: string }

// Some media engines expose in-band cues through TextTrack. Native ICY
// metadata is generally unavailable to HTMLAudioElement.
export function listenToMetadata(audio: HTMLAudioElement, update: (value?: NowPlaying) => void) {
  const listeners = new Map<TextTrack, { previousMode: TextTrackMode; read: () => void }>()
  function attach(track: TextTrack) {
    if (track.kind !== 'metadata' || listeners.has(track)) return
    const read = () => {
      const cue = track.activeCues?.[0] as (TextTrackCue & { text?: unknown; value?: unknown }) | undefined
      const value = cue?.value
      if (typeof value === 'object' && value && 'title' in value && typeof value.title === 'string') {
        const title = value.title.trim().slice(0, 180)
        const artist = 'artist' in value && typeof value.artist === 'string' ? value.artist.trim().slice(0, 180) : undefined
        let artwork: string | undefined
        if ('artwork' in value && typeof value.artwork === 'string') {
          try {
            const url = new URL(value.artwork)
            if (url.protocol === 'https:' && !url.username && !url.password) artwork = url.href
          } catch { /* Keep the station logo. */ }
        }
        if (title) update({ title, artist, artwork })
      } else if (typeof cue?.text === 'string') {
        const title = /^StreamTitle='([^']{1,180})';?$/i.exec(cue.text.trim())?.[1]
        if (title) {
          const separator = title.indexOf(' - ')
          update(separator > 0 ? { artist: title.slice(0, separator), title: title.slice(separator + 3) || title } : { title })
        }
      }
    }
    listeners.set(track, { previousMode: track.mode, read })
    if (track.mode === 'disabled') track.mode = 'hidden'
    track.addEventListener('cuechange', read)
    read()
  }
  function add(event: TrackEvent) {
    const track = event.track
    if (track && 'kind' in track && 'activeCues' in track) attach(track)
  }
  const tracks = audio.textTracks
  if (!tracks) return () => undefined
  for (const track of Array.from(tracks)) attach(track)
  tracks.addEventListener('addtrack', add)
  return () => {
    tracks.removeEventListener('addtrack', add)
    listeners.forEach(({ previousMode, read }, track) => {
      track.removeEventListener('cuechange', read)
      track.mode = previousMode
    })
  }
}
