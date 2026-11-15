export const BRAND = {
  name: 'Lay Digital',
  tagline: 'Smart inventory for growing businesses',
  email: 'info@laydigital.com',
  phone: '+251 900 000 000',
  address: 'Addis Ababa, Ethiopia',
} as const;

export interface NavLinkItem {
  to: string;
  label: string;
}

export const PUBLIC_NAV: NavLinkItem[] = [
  { to: '/', label: 'Home' },
  { to: '/contact', label: 'Contact' },
  { to: '/about', label: 'About' },
];