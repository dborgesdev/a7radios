import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProvider } from './auth'
import { FavoritesProvider } from './favorites'
import { PlayerProvider } from './player'
import type { Radio } from './domain'
import './style.css'
import './broadcast.css'

const root = document.getElementById('root')
const payload = document.getElementById('a7-initial')?.textContent
const initial: Radio | undefined = payload ? JSON.parse(payload) : undefined
if (root) createRoot(root).render(<BrowserRouter><AuthProvider><FavoritesProvider>
  <PlayerProvider><App initial={initial} /></PlayerProvider>
</FavoritesProvider></AuthProvider></BrowserRouter>)
