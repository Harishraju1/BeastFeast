"use client";
import Image from "next/image";
import Link from "next/link";
import mark from "@/assets/brand/beast-feast-mark.webp";
import sidebarLogo from "@/assets/brand/beast-feast-sidebar.webp";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  Bot, BookOpen, Boxes, Cpu, LineChart, Warehouse, CircuitBoard, Code2, Crown, Gauge, HelpCircle, LayoutDashboard, LogOut, Map, Menu, Search, Settings, Shield, Swords, Trophy, User, Bell, Cloud, CloudOff, Loader2, Check,
} from "lucide-react";
import { useApp } from "@/lib/store/app";
import { BACKEND_MODE } from "@/lib/data";
import { isStaff } from "@/lib/roles";
import { Toasts } from "./Toasts";
import { CommandSearch } from "./CommandSearch";
import { RankUpCelebration } from "@/components/ranks/RankUpCelebration";
import { Avatar } from "@/components/profile/Avatar";
import { CompleteDetailsPrompt } from "@/components/profile/CompleteDetailsPrompt";

export function workspaceHref(lastProjectId: string | null, tab: "design" | "circuit" | "code" | "arena") {
  return lastProjectId ? `/workspace/${lastProjectId}/${tab}` : `/projects?next=${tab}`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, init, user, lastProjectId, saveState, content, signOut } = useApp();
  const path = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/reset local UI state when its source changes
  useEffect(() => setMobileOpen(false), [path]);
  // mobile drawer: Escape closes it and the page behind it does not scroll while it is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [mobileOpen]);

  const immersive = path.startsWith("/workspace/") || /^\/tracks\/[^/]+/.test(path);
  // grouped navigation: what students do, in the order they usually do it
  type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; match?: string; highlight?: boolean; hint: string };
  const sections: { title: string | null; items: NavItem[] }[] = [
    { title: null, items: [{ href: "/", label: "Command Center", icon: LayoutDashboard, hint: "Your dashboard and next steps" }] },
    {
      title: "Learn",
      items: [
        { href: "/learn", label: "Beast Topics", icon: BookOpen, hint: "84 lessons with mini quizzes" },
        { href: "/challenges", label: "Challenges", icon: Swords, hint: "Competition quizzes and the final exam" },
        { href: "/learn/performance", label: "My Performance", icon: LineChart, hint: "Strong and weak topics from your quiz results" },
      ],
    },
    {
      title: "Build",
      items: [
        { href: "/garage", label: "BEAST Project Garage", icon: Warehouse, highlight: true, hint: "Ready-made robots to load and simulate" },
        { href: "/projects", label: "My Projects", icon: Boxes, hint: "Start or open your own robot" },
        { href: workspaceHref(lastProjectId, "design"), label: "Robot Designer", icon: Bot, match: "/design", hint: "Chassis, motors, wheels, sensors" },
        { href: workspaceHref(lastProjectId, "circuit"), label: "Circuit Studio", icon: CircuitBoard, match: "/circuit", hint: "Wire your components" },
        { href: workspaceHref(lastProjectId, "code"), label: "Code Studio", icon: Code2, match: "/code", hint: "Write the Arduino program" },
        { href: workspaceHref(lastProjectId, "arena"), label: "Simulation Arena", icon: Gauge, match: "/arena", hint: "Run your robot on a track" },
        { href: "/tracks", label: "Track Designer", icon: Map, hint: "Design your own tracks" },
        { href: "/library", label: "Component Library", icon: Cpu, hint: "All 552 parts with pinouts" },
      ],
    },
    {
      title: "Compete",
      items: [
        { href: "/leaderboard", label: "Leaderboard", icon: Trophy, hint: "Rankings above 50 XP" },
        { href: "/profile", label: "My Profile", icon: User, hint: "Rank, XP history and achievements" },
      ],
    },
  ];
  const nav = sections.flatMap((x) => x.items);
  const isActive = (n: NavItem) => {
    if (n.match) return path.startsWith("/workspace/") && path.endsWith(n.match);
    if (n.href === "/") return path === "/";
    const base = n.href.split("?")[0];
    // the most specific nav entry wins (e.g. /learn/performance over /learn)
    if (!path.startsWith(base)) return false;
    return !nav.some((o) => o !== n && !o.match && o.href.length > base.length && path.startsWith(o.href.split("?")[0]));
  };

  const saveIcon = saveState === "saving" ? <Loader2 size={14} className="animate-spin" /> : saveState === "error" ? <CloudOff size={14} className="text-bad" /> : saveState === "saved" ? <Check size={14} className="text-ok" /> : <Cloud size={14} />;
  const saveText = { idle: "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", saved: "Saved", error: "Save failed" }[saveState];

  return (
    <div className="flex min-h-screen">
      {/* tap outside the open mobile drawer to close it */}
      {mobileOpen && <div className="fixed inset-0 z-30 bg-[rgba(20,26,22,.55)] md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}
      {/* sidebar */}
      <aside id="bf-main-nav" className={`fixed inset-y-0 left-0 z-40 bf-on-sage flex flex-col shadow-[1px_0_0_rgba(38,48,42,.25)] transition-all ${immersive ? "w-14" : "w-14 xl:w-56"} ${mobileOpen ? "!w-56 translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        {/* Brand: the full logo when the sidebar is open, the gear-and-panther mark when it is collapsed */}
        <Link href="/" aria-label="BEAST FEAST — Robotics Club KKH, home" className="flex min-h-14 items-center justify-center border-b border-line px-2 py-2 xl:py-3.5">
          <Image src={mark} alt="" unoptimized className={`h-10 w-10 shrink-0 object-contain ${immersive && !mobileOpen ? "" : "xl:hidden"} ${mobileOpen ? "!hidden" : ""}`} sizes="40px" priority />
          <Image src={sidebarLogo} alt="BEAST FEAST — Robotics Club KKH" unoptimized className={`h-auto w-[140px] ${immersive && !mobileOpen ? "hidden" : "hidden xl:block"} ${mobileOpen ? "!block" : ""}`} priority />
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
          {sections.map((sec, si) => (
            <div key={si} className={si ? "pt-3" : ""}>
              {sec.title && (
                <div className={`px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-dim ${immersive && !mobileOpen ? "hidden" : "hidden xl:block"} ${mobileOpen ? "!block" : ""}`}>{sec.title}</div>
              )}
              {sec.title && <div className={`mx-2 mb-1 border-t border-line ${immersive && !mobileOpen ? "" : "xl:hidden"} ${mobileOpen ? "hidden" : ""}`} aria-hidden />}
              <div className="space-y-0.5">
                {sec.items.map((n) => {
                  const Icon = n.icon;
                  const active = isActive(n);
                  return (
                    <Link key={n.label} href={n.href} aria-current={active ? "page" : undefined} title={`${n.label} — ${n.hint}`} className={`group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors duration-150 ${active ? "bg-panel2 font-medium text-text before:absolute before:inset-y-1.5 before:-left-2 before:w-[3px] before:rounded-r before:bg-accent" : "highlight" in n && n.highlight ? "border border-accent/70 text-text hover:bg-panel" : "text-muted hover:bg-panel hover:text-text"}`}>
                <Icon size={18} className={`shrink-0 ${active || ("highlight" in n && n.highlight) ? "text-accent-ink" : ""}`} />
                <span className={`truncate ${immersive && !mobileOpen ? "hidden" : "hidden xl:inline"} ${mobileOpen ? "!inline" : ""}`}>{n.label}</span>
              </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-2">
          <div className={`px-2 py-1 font-mono text-[9px] tracking-widest ${BACKEND_MODE === "local" ? "text-warn" : "text-ok"} ${immersive ? "hidden" : "hidden xl:block"}`}>{BACKEND_MODE === "local" ? "LOCAL MODE · THIS DEVICE" : "CLOUD SYNC · SUPABASE"}</div>
        </div>
      </aside>

      <div className={`flex min-w-0 flex-1 flex-col md:pl-14 ${immersive ? "" : "xl:pl-56"}`}>
        {/* top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-3 backdrop-blur-md md:px-5">
          <button className="text-muted md:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} aria-controls="bf-main-nav">
            <Menu size={20} />
          </button>
          <button onClick={() => setSearchOpen(true)} className="flex min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-line bg-bg2 px-3 py-1.5 text-left text-sm text-dim shadow-[var(--shadow-sm)] transition-colors hover:border-line2">
            <Search size={15} />
            <span className="truncate">Search components, topics, projects…</span>
            <kbd className="ml-auto hidden rounded border border-line px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {path.startsWith("/workspace/") && (
              <span className="mr-2 hidden items-center gap-1.5 text-xs text-muted sm:flex" title="Autosave status">
                {saveIcon}
                {saveText}
              </span>
            )}
            <div className="relative">
              <button className="rounded-md p-2 text-muted hover:bg-panel hover:text-text" aria-label="Notifications" onClick={() => setNotifOpen((v) => !v)}>
                <Bell size={18} />
                {content.announcements.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />}
              </button>
              {notifOpen && (
                <div className="bf-panel bf-raised absolute right-0 top-11 w-[min(20rem,calc(100vw-1.5rem))] p-3 text-sm">
                  <div className="bf-label mb-2">Announcements</div>
                  {content.announcements.length === 0 && <div className="text-muted">No announcements yet.</div>}
                  {content.announcements.slice(-5).reverse().map((a) => (
                    <div key={a.id} className="border-t border-line py-2 first:border-0">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted">{a.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isStaff(user?.role) && (
              <Link href="/admin" className={`rounded-md p-2 hover:bg-panel ${path.startsWith("/admin") ? "text-accent-ink" : "text-muted hover:text-text"}`} aria-label="Admin dashboard" title="Admin dashboard">
                <Shield size={18} />
              </Link>
            )}
            <Link href="/learn" className="hidden rounded-md p-2 text-muted hover:bg-panel hover:text-text sm:inline-flex" aria-label="Help" title="Help & Beast Topics">
              <HelpCircle size={18} />
            </Link>
            <Link href="/profile" className="hidden rounded-md p-2 text-muted hover:bg-panel hover:text-text sm:inline-flex" aria-label="Settings" title="Profile & settings">
              <Settings size={18} />
            </Link>
            {user ? (
              <div className="ml-1 flex items-center gap-2 border-l border-line pl-3">
                <Link href="/profile" className="flex items-center gap-2">
                  <Avatar name={user.name} src={user.avatar} size={32} />
                  <span className="hidden text-right lg:block">
                    <span className="block text-xs font-medium leading-tight">{user.name}</span>
                    <span className="block font-mono text-[10px] text-accent-ink">
                      {user.xp} XP {isStaff(user.role) && <Crown size={9} className="inline" />}
                    </span>
                  </span>
                </Link>
                <button
                  title="Sign out"
                  className="rounded-md p-2 text-muted hover:text-bad"
                  onClick={async () => {
                    await signOut();
                    router.push("/login");
                  }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              ready && (
                <Link href="/login" className="ml-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
                  Sign in
                </Link>
              )
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
        {!immersive && <SiteFooter />}
      </div>
      <Toasts />
      <RankUpCelebration />
      <CompleteDetailsPrompt />
      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useApp();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, router, path]);
  if (!ready || !user)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 font-mono text-xs tracking-widest text-muted">
          <Image src={mark} alt="" unoptimized className="h-10 w-10 animate-pulse object-contain" />
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" /> BOOTING BEAST SYSTEMS…
        </div>
      </div>
    );
  return <>{children}</>;
}

const CONTACT_EMAIL = "roboticsclubniat@gmail.com";

function SiteFooter() {
  const links = [
    { href: "/", label: "Home" },
    { href: "/learn", label: "Learning Academy" },
    { href: "/challenges", label: "Challenges" },
    { href: "/library", label: "Component Library" },
    { href: "/garage", label: "Project Garage" },
    { href: "/leaderboard", label: "Leaderboard" },
  ];
  return (
    <footer className="bf-on-sage border-t border-line px-5 pb-6 pt-8 text-sm">
      <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" aria-label="BEAST FEAST home" className="inline-block">
            <Image src={sidebarLogo} alt="BEAST FEAST" unoptimized className="h-16 w-auto object-contain" />
          </Link>
          <div className="mt-3 font-display text-base font-semibold text-heading">ROBOTICS CLUB KKH</div>
          <div className="mt-0.5 font-mono text-[11px] tracking-[0.18em] text-accent-ink">BUILD. CODE. SIMULATE. DOMINATE.</div>
          <p className="mt-3 max-w-sm text-muted">A robotics engineering platform for learning, designing, coding and simulating robots.</p>
        </div>
        <nav aria-label="Footer">
          <div className="bf-label mb-2">Explore</div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-1">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="text-muted hover:text-text hover:underline">{l.label}</Link></li>)}
          </ul>
        </nav>
        <div>
          <div className="bf-label mb-2">Contact</div>
          <a href={`mailto:${CONTACT_EMAIL}`} className="break-all text-muted hover:text-text hover:underline">{CONTACT_EMAIL}</a>
          <p className="mt-2 text-xs text-dim">Questions about the platform, your account or club events — email the club.</p>
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-7xl border-t border-line pt-4 text-xs text-dim">
        © {new Date().getFullYear()} BEAST FEAST | ROBOTICS CLUB KKH. All rights reserved.
      </div>
    </footer>
  );
}
