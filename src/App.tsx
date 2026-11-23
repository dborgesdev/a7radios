import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { PageHero } from './components/PageHero'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Catalog } from './pages/Catalog'
import { Favorites } from './pages/Favorites'
import { RadioDetail } from './pages/RadioDetail'
import { AuthPage } from './pages/AuthPage'
import { ConfirmEmail } from './pages/ConfirmEmail'
import { AccountProfile } from './pages/AccountProfile'
import { Dashboard, OwnerLayout } from './pages/Owner'
import { RadioForm } from './pages/RadioForm'
import { Legal } from './pages/Legal'
import type { Radio } from './domain'

const routeTitles: Record<string, string> = {
  '/radios': 'Rádios', '/favoritos': 'Favoritos', '/login': 'Entrar', '/cadastro': 'Criar conta',
  '/recuperar-senha': 'Recuperar senha', '/painel': 'Minha conta', '/painel/radios/nova': 'Cadastrar Rádio',
  '/confirmar-email': 'Confirmar e-mail', '/painel/dados': 'Dados cadastrais',
  '/termos': 'Termo de Responsabilidade', '/privacidade': 'Política de Privacidade',
}

export function App({ initial }: { initial?: Radio }) {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  useEffect(() => {
    if (/^\/radio\/[^/]+\/?$/.test(pathname)) return
    const path = pathname.replace(/\/$/, '')
    document.title = path
      ? (routeTitles[path] ?? (/^\/painel\/radios\/\d+\/editar$/.test(path) ? 'Editar Rádio' : 'Página indisponível')) + ' | A7 Rádios'
      : 'A7 Rádios On-Line | Do Brasil para o mundo'
  }, [pathname])
  return <Routes><Route element={<Layout />}>
    <Route index element={<Home />} />
    <Route path="/radios/" element={<Catalog />} />
    <Route path="/radio/:slug/" element={<RadioDetail initial={initial} />} />
    <Route path="/favoritos/" element={<Favorites />} />
    <Route path="/login/" element={<AuthPage key="login" mode="login" />} />
    <Route path="/confirmar-email/" element={<ConfirmEmail />} />
    <Route path="/cadastro/" element={<AuthPage key="register" mode="register" />} />
    <Route path="/recuperar-senha/" element={<AuthPage key="recover" mode="recover" />} />
    <Route path="/termos/" element={<Legal terms />} />
    <Route path="/privacidade/" element={<Legal />} />
    <Route path="/painel/" element={<OwnerLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="dados/" element={<AccountProfile />} />
      <Route path="radios/" element={<Navigate to="/painel/" replace />} />
      <Route path="radios/nova/" element={<RadioForm />} />
      <Route path="radios/:id/editar/" element={<RadioForm />} />
    </Route>
    <Route path="*" element={<PageHero variant="error" eyebrow="A7 Rádios On-Line" title="Página indisponível" action={<Link className="button primary" to="/radios/">Ver catálogo</Link>} />} />
  </Route></Routes>
}
