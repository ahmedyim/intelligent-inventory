import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Search, type LucideIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Logo from '@/components/Logo';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { baseApi } from '@/app/baseApi';
import { logout } from '@/features/auth/authSlice';
import { useLogoutMutation } from '@/features/auth/authApi';
import { ROLE_LABEL } from '@/lib/roles';
import { cn } from '@/lib/utils';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const initialsOf = (name?: string) =>
  (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

// Phone-only bottom bar: the first three pages, plus "More" which opens the full menu
function MobileTabBar({ items, active }: { items: NavItem[]; active?: string }) {
  const { setOpenMobile } = useSidebar();
  const tabs = items.slice(0, 3);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-white md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const isActive = active === item.to;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-xs',
                  isActive ? 'font-medium text-orange-600' : 'text-zinc-500'
                )}
              >
                {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-orange-600" />}
                <item.icon className="h-5 w-5" />
                <span className="max-w-full truncate px-1">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-xs text-zinc-500"
          >
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default function DashboardLayout({ groups }: { groups: NavGroup[] }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [logoutRequest] = useLogoutMutation();

  const flatItems = groups.flatMap((g) => g.items);

  // The longest matching path wins, so "/super-admin" is not highlighted on sub-pages
  const active = flatItems
    .filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;

  const handleLogout = async () => {
    await logoutRequest().unwrap().catch(() => {}); // lets the backend clear the refresh cookie
    dispatch(logout());
    dispatch(baseApi.util.resetApiState()); // clear cached data for the next user
    navigate('/login', { replace: true });
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="h-16 justify-center border-b px-4">
          <Logo  />
        </SidebarHeader>

        <SidebarContent className="gap-0 px-2 py-3">
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active === item.to}
                        className="h-10 gap-3 rounded-lg text-zinc-600 hover:bg-orange-50 hover:text-orange-700 data-[active=true]:bg-orange-50 data-[active=true]:font-medium data-[active=true]:text-orange-700"
                      >
                        <NavLink to={item.to} end>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="bg-zinc-50">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur md:h-16">
          {/* Desktop: menu toggle. Phone: the logo instead (the menu is under "More") */}
          <SidebarTrigger className="hidden text-zinc-600 md:inline-flex" />
          <Logo className="md:hidden" />

          <div className="relative hidden w-full max-w-sm md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              aria-label="Search"
              placeholder="Search products, branches, users..."
              className="h-10 border-zinc-200 bg-zinc-50 pl-9 focus-visible:ring-orange-400"
            />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications" className="relative text-zinc-600">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-semibold text-white">
                    {initialsOf(user?.full_name)}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-medium text-zinc-900">{user?.full_name}</span>
                    <span className="block text-xs text-zinc-500">{user ? ROLE_LABEL[user.role] : ''}</span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-zinc-500 sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{user?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user ? ROLE_LABEL[user.role] : ''}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* pb-24 keeps the last content clear of the phone tab bar */}
        <main className="p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </SidebarInset>

      <MobileTabBar items={flatItems} active={active} />
    </SidebarProvider>
  );
}