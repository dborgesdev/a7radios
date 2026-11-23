import { useEffect, useState } from 'react'

export function OwnerRadioImage({ path, nonce }: { path: string; nonce: string }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let local = ''
    fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'X-WP-Nonce': nonce } })
      .then(response => response.ok && response.headers.get('Content-Type')?.startsWith('image/') ? response.blob() : null)
      .then(blob => {
        if (!blob || controller.signal.aborted) return
        local = URL.createObjectURL(blob)
        setSource(local)
      }).catch(() => undefined)
    return () => { controller.abort(); if (local) URL.revokeObjectURL(local) }
  }, [path, nonce])
  return source ? <img src={source} width="72" height="72" alt="" /> : <span className="owner-image-placeholder" aria-hidden="true" />
}
