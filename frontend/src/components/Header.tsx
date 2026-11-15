import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogIn, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import { useAppSelector } from '@/app/hooks';
import { PUBLIC_NAV } from '@/lib/brand';
import { ROLE_HOME } from '@/lib/roles';
import { cn } from '@/lib/utils';

// Sections on the home page (ids match <section id="catalog"> and <section id="branches"> in Home)
const SECTION_LINKS = [
  { hash: '#catalog', label: 'Catalog' },
  { hash: '#branches', label: 'Branches' },
];

const linkClass = (isActive: boolean) =>
  cn(
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'text-orange-600' : 'text-zinc-600 hover:bg-orange-50 hover:text-orange-600'
  );

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname, hash } = useLocation();

  return (
    <>
      {PUBLIC_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          onClick={onNavigate}
          // "Home" is not highlighted while a section (#catalog / #branches) is selected
          className={({ isActive }) => linkClass(isActive && !(item.to === '/' && hash !== ''))}
        >
          {item.label}
        </NavLink>
      ))}

      {SECTION_LINKS.map((s) => (
        <Link
          key={s.hash}
          to={`/${s.hash}`}
          onClick={onNavigate}
          className={linkClass(pathname === '/' && hash === s.hash)}
        >
          {s.label}
        </Link>
      ))}
    </>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const { user, token } = useAppSelector((s) => s.auth);
  const { hash, key } = useLocation();

  const signedIn = !!user && !!token;
  const ctaTo = signedIn ? (ROLE_HOME[user.role] ?? '/') : '/login';
  const ctaLabel = signedIn ? 'Dashboard' : 'Staff Login';
  const CtaIcon = signedIn ? LayoutDashboard : LogIn;

  // React Router does not scroll to #hash by itself, so do it here.
  // `key` changes on every navigation, so clicking "Catalog" again scrolls back to it.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, key]);

  return (
    <header className="sticky top-0 z-40 border-b border-orange-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          <NavItems />
        </nav>

        <div className="hidden md:block">
          <Button asChild className="bg-orange-600 hover:bg-orange-700">
            <Link to={ctaTo}>
              <CtaIcon className="mr-2 h-4 w-4" /> {ctaLabel}
            </Link>
          </Button>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          className="rounded-md p-2 text-zinc-700 hover:bg-orange-50 md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-orange-100 bg-white px-4 pb-4 md:hidden">
          <nav className="flex flex-col py-2">
            <NavItems onNavigate={() => setOpen(false)} />
          </nav>
          <Button asChild className="w-full bg-orange-600 hover:bg-orange-700">
            <Link to={ctaTo} onClick={() => setOpen(false)}>
              <CtaIcon className="mr-2 h-4 w-4" /> {ctaLabel}
            </Link>
          </Button>
        </div>
      )}
    </header>
  );
}