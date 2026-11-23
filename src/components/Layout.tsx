import { useState, type FormEvent } from 'react'
import { Heart, Menu, Search, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { demo } from '../api'
import { PlayerBar } from '../player'

export function Layout() {
  const { value } = useAuth()
  const [menu, setMenu] = useState(false)
  const navigate = useNavigate()
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = String(new FormData(event.currentTarget).get('search')).trim()
    navigate('/radios/' + (query ? '?' + new URLSearchParams({ search: query }) : ''))
    setMenu(false)
  }
  return <>
    <a className="skip" href="#conteudo">Ir para o conteúdo</a>
    <header className="site-header"><div className="shell header-inner">
      <Link className="brand" to="/" aria-label="A7 Rádios On-Line, início"><img src="/a7-logo.png" alt="A7 Rádios On-Line" /></Link>
      <button type="button" className="icon-button mobile-menu" aria-label="Menu" aria-expanded={menu}
        aria-controls="site-nav" onClick={() => setMenu(!menu)}><Menu /></button>
      <nav id="site-nav" aria-label="Navegação principal" className={menu ? 'navigation open' : 'navigation'} onClick={() => setMenu(false)}>
        <NavLink to="/" end>Início</NavLink><NavLink to="/radios/">Rádios</NavLink><Link to="/#categorias">Categorias</Link>
        <Link to="/favoritos/"><Heart size={17} /> Favoritos</Link>
      </nav>
      <form className="header-search" role="search" onSubmit={search}>
        <Search size={16} /><input type="search" name="search" aria-label="Buscar rádio ou categoria" placeholder="Buscar rádio ou categoria" />
      </form>
      <Link className="account" to={value?.authenticated ? '/painel/' : '/login/'}><UserRound size={17} />
        {value?.authenticated ? 'Painel' : 'Entrar'}</Link>
    </div></header>
    {demo && <div className="demo-notice">DEMO · Catálogo sintético para avaliação local</div>}
    <main id="conteudo" className="main" tabIndex={-1}><Outlet /></main>
    <Footer />
    <PlayerBar />
  </>
}

export function Footer() {
  return <footer className="site-footer"><div className="shell footer-inner">
    <Link to="/"><img src="/a7-logo.png" alt="A7 Rádios On-Line" /></Link>
    <div><Link to="/termos/">Termos</Link><Link to="/privacidade/">Privacidade</Link></div>
    <a href="https://smartlocal.com.br" target="_blank" rel="noopener noreferrer">Desenvolvido por Douglas Borges - Smart Local</a>
  </div></footer>
}
