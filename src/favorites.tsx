import { createContext, useContext, useState, type ReactNode } from 'react'
import { Heart } from 'lucide-react'

const Favorites = createContext<{ slugs: string[]; toggle: (slug: string) => void } | null>(null)
const key = 'a7-favorites-v1'
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
    } catch { return [] }
  })
  function toggle(slug: string) {
    const next = slugs.includes(slug) ? slugs.filter(item => item !== slug) : [...slugs, slug]
    setSlugs(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* keep this session usable */ }
  }
  return <Favorites.Provider value={{ slugs, toggle }}>{children}</Favorites.Provider>
}
export function useFavorites() { return useContext(Favorites)! }
export function FavoriteButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const { slugs, toggle } = useFavorites()
  const saved = slugs.includes(slug)
  const label = saved ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
  return <button type="button" className={compact ? 'icon-button favorite' : 'button favorite'} aria-pressed={saved}
    aria-label={label} onClick={() => toggle(slug)}><Heart size={19} fill={saved ? 'currentColor' : 'none'} />{!compact && label}</button>
}
