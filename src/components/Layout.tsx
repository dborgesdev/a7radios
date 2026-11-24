import { useState, type FormEvent } from "react";
import { Heart, Menu, Search, UserRound } from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { demo, useApi } from "../api";
import type { Category } from "../domain";
import { PlayerBar } from "../player";

export function Layout() {
  const { value } = useAuth();
  const categories = useApi<Category[]>("/categories");
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  function closeNavigation(event: React.MouseEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest("a"))
      setMenu(false);
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("search"),
    ).trim();
    navigate(
      "/radios/" + (query ? "?" + new URLSearchParams({ search: query }) : ""),
    );
    setMenu(false);
  }
  return (
    <>
      <a className="skip" href="#conteudo">
        Ir para o conteúdo
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <Link className="brand" to="/" aria-label="A7 Rádios On-Line, início">
            <img
              src="/a7-logo.webp"
              width="726"
              height="153"
              alt="A7 Rádios On-Line"
            />
          </Link>
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label="Menu"
            aria-expanded={menu}
            aria-controls="site-nav"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <nav
            id="site-nav"
            aria-label="Navegação principal"
            className={menu ? "navigation open" : "navigation"}
            onClick={closeNavigation}
          >
            <NavLink to="/" end>
              Início
            </NavLink>
            <NavLink to="/radios/">Rádios</NavLink>
            <details
              className="category-menu"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary>Categorias</summary>
              <div className="category-dropdown">
                {categories.data?.length ? (
                  categories.data.map((category) => (
                    <Link
                      key={category.id}
                      to={
                        "/radios/?" +
                        new URLSearchParams({ category: category.slug })
                      }
                      onClick={(event) => {
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                        setMenu(false);
                      }}
                    >
                      {category.name}
                    </Link>
                  ))
                ) : (
                  <p>
                    {categories.loading
                      ? "Carregando…"
                      : (categories.error ?? "Nenhuma categoria disponível.")}
                  </p>
                )}
              </div>
            </details>
            <Link to="/favoritos/">
              <Heart size={17} /> Favoritos
            </Link>
          </nav>
          <form className="header-search" role="search" onSubmit={search}>
            <Search size={16} />
            <input
              type="search"
              name="search"
              aria-label="Buscar rádio, categoria ou cidade"
              placeholder="Buscar no catálogo"
            />
          </form>
          <Link
            className="account"
            to={value?.authenticated ? "/painel/" : "/login/"}
          >
            <UserRound size={17} />
            {value?.authenticated ? "Painel" : "Entrar"}
          </Link>
        </div>
      </header>
      {demo && (
        <div className="demo-notice">
          DEMO · Catálogo sintético para avaliação local
        </div>
      )}
      <main id="conteudo" className="main" tabIndex={-1}>
        <Outlet context={categories} />
      </main>
      <Footer />
      <PlayerBar />
    </>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <Link to="/">
          <img
            src="/a7-logo.webp"
            width="726"
            height="153"
            alt="A7 Rádios On-Line"
          />
        </Link>
        <div>
          <Link to="/termos/">Termo de Responsabilidade</Link>
          <Link to="/privacidade/">Política de Privacidade</Link>
        </div>
        <small>© {new Date().getFullYear()} A7 Rádios On-Line</small>
        <a
          href="https://smartlocal.com.br"
          target="_blank"
          rel="noopener noreferrer"
        >
          Desenvolvido por Douglas Borges - Smart Local
        </a>
      </div>
    </footer>
  );
}
