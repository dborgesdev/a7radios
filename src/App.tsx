import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Catalog } from './pages/Catalog'
import { Favorites } from './pages/Favorites'
import { RadioDetail } from './pages/RadioDetail'
import { AuthPage } from './pages/AuthPage'
import { Dashboard, OwnerLayout, OwnerRadios } from './pages/Owner'
import { RadioForm } from './pages/RadioForm'
import { Legal } from './pages/Legal'
import type { Radio } from './domain'

export function App({ initial }: { initial?: Radio }) {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return <Routes><Route element={<Layout />}>
    <Route index element={<Home />} />
    <Route path="/radios/" element={<Catalog />} />
    <Route path="/radio/:slug/" element={<RadioDetail initial={initial} />} />
    <Route path="/favoritos/" element={<Favorites />} />
    <Route path="/login/" element={<AuthPage key="login" mode="login" />} />
    <Route path="/cadastro/" element={<AuthPage key="register" mode="register" />} />
    <Route path="/recuperar-senha/" element={<AuthPage key="recover" mode="recover" />} />
    <Route path="/termos/" element={<Legal terms />} />
    <Route path="/privacidade/" element={<Legal />} />
    <Route path="/painel/" element={<OwnerLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="radios/" element={<OwnerRadios />} />
      <Route path="radios/nova/" element={<RadioForm />} />
      <Route path="radios/:id/editar/" element={<RadioForm />} />
    </Route>
    <Route path="*" element={<div className="shell page"><h1>Página indisponível</h1><Link to="/radios/">Ver catálogo</Link></div>} />
  </Route></Routes>
}
