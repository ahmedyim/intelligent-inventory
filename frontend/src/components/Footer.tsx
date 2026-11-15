import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import Logo from '@/components/Logo';
import { BRAND, PUBLIC_NAV } from '@/lib/brand';

export default function Footer() {
  return (
    <footer id="contact" className="mt-16 bg-zinc-950 text-zinc-400">
      <div className="h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600" />

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
        <div className="space-y-3">
          <Logo light />
          <p className="max-w-xs text-sm">{BRAND.tagline}</p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Quick links</h3>
          <ul className="space-y-2 text-sm">
            {PUBLIC_NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="transition-colors hover:text-orange-400">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/login" className="transition-colors hover:text-orange-400">
                Staff Login
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">Contact</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-orange-400" /> {BRAND.email}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-orange-400" /> {BRAND.phone}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-400" /> {BRAND.address}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-800 py-4 text-center text-xs">
        © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
      </div>
    </footer>
  );
}