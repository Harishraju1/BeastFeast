"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  Bot, BookOpen, Boxes, Warehouse, CircuitBoard, Code2, Crown, Gauge, HelpCircle, LayoutDashboard, LogOut, Map, Menu, Search, Settings, Shield, Swords, Trophy, User, Bell, Cloud, CloudOff, Loader2, Check,
} from "lucide-react";
import { useApp } from "@/lib/store/app";
import { BACKEND_MODE } from "@/lib/data";
import { isStaff } from "@/lib/roles";
import { Toasts } from "./Toasts";
import { CommandSearch } from "./CommandSearch";

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

  const immersive = path.startsWith("/workspace/") || /^\/tracks\/[^/]+/.test(path);
  const nav = [
    { href: "/", label: "Command Center", icon: LayoutDashboard },
    { href: "/garage", label: "BEAST Project Garage", icon: Warehouse, highlight: true },
    { href: "/projects", label: "My Projects", icon: Boxes },
    { href: workspaceHref(lastProjectId, "design"), label: "Robot Designer", icon: Bot, match: "/design" },
    { href: workspaceHref(lastProjectId, "circuit"), label: "Circuit Studio", icon: CircuitBoard, match: "/circuit" },
    { href: workspaceHref(lastProjectId, "code"), label: "Code Studio", icon: Code2, match: "/code" },
    { href: workspaceHref(lastProjectId, "arena"), label: "Simulation Arena", icon: Gauge, match: "/arena" },
    { href: "/tracks", label: "Track Designer", icon: Map },
    { href: "/library", label: "Component Library", icon: Boxes },
    { href: "/learn", label: "Beast Topics", icon: BookOpen },
    { href: "/challenges", label: "Challenges", icon: Swords },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { href: "/profile", label: "My Profile", icon: User },
  ];
  const isActive = (n: (typeof nav)[number]) => ("match" in n && n.match ? path.startsWith("/workspace/") && path.endsWith(n.match) : n.href === "/" ? path === "/" : path.startsWith(n.href.split("?")[0]));

  const saveIcon = saveState === "saving" ? <Loader2 size={14} className="animate-spin" /> : saveState === "error" ? <CloudOff size={14} className="text-bad" /> : saveState === "saved" ? <Check size={14} className="text-ok" /> : <Cloud size={14} />;
  const saveText = { idle: "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", saved: "Saved", error: "Save failed" }[saveState];

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 bf-on-sage flex flex-col shadow-[1px_0_0_rgba(38,48,42,.25)] transition-all ${immersive ? "w-14" : "w-14 xl:w-56"} ${mobileOpen ? "!w-56 translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <Link href="/" className="flex h-14 items-center gap-2 border-b border-line px-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent font-display text-sm font-bold tracking-tight text-white">BF</span>
          <span className={`font-display text-sm font-bold leading-tight ${immersive && !mobileOpen ? "hidden" : "hidden xl:block"} ${mobileOpen ? "!block" : ""}`}>
            BEAST FEAST <span className="text-accent-ink">5.0</span>
            <span className="block font-mono text-[9px] font-normal tracking-widest text-dim">ROBOTICS CLUB KKH</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = isActive(n);
            return (
              <Link key={n.label} href={n.href} title={n.label} className={`group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors duration-150 ${active ? "bg-panel2 font-medium text-text before:absolute before:inset-y-1.5 before:-left-2 before:w-[3px] before:rounded-r before:bg-accent" : "highlight" in n && n.highlight ? "border border-accent/70 text-text hover:bg-panel" : "text-muted hover:bg-panel hover:text-text"}`}>
                <Icon size={18} className={`shrink-0 ${active || ("highlight" in n && n.highlight) ? "text-accent-ink" : ""}`} />
                <span className={`truncate ${immersive && !mobileOpen ? "hidden" : "hidden xl:inline"} ${mobileOpen ? "!inline" : ""}`}>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-2">
          <div className={`px-2 py-1 font-mono text-[9px] tracking-widest ${BACKEND_MODE === "local" ? "text-warn" : "text-ok"} ${immersive ? "hidden" : "hidden xl:block"}`}>{BACKEND_MODE === "local" ? "LOCAL MODE · THIS DEVICE" : "CLOUD SYNC · SUPABASE"}</div>
        </div>
      </aside>

      <div className={`flex min-w-0 flex-1 flex-col md:pl-14 ${immersive ? "" : "xl:pl-56"}`}>
        {/* top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-3 backdrop-blur-md md:px-5">
          <button className="text-muted md:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
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
                <div className="bf-panel bf-raised absolute right-0 top-11 w-80 p-3 text-sm">
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
            <Link href="/learn" className="rounded-md p-2 text-muted hover:bg-panel hover:text-text" aria-label="Help" title="Help & Beast Topics">
              <HelpCircle size={18} />
            </Link>
            <Link href="/profile" className="rounded-md p-2 text-muted hover:bg-panel hover:text-text" aria-label="Settings" title="Profile & settings">
              <Settings size={18} />
            </Link>
            {user ? (
              <div className="ml-1 flex items-center gap-2 border-l border-line pl-3">
                <Link href="/profile" className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brand font-display text-sm font-semibold text-on-brand">
                    {user.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : user.name.slice(0, 1).toUpperCase()}
                  </span>
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
      </div>
      <Toasts />
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
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" /> BOOTING BEAST SYSTEMS…
        </div>
      </div>
    );
  return <>{children}</>;
}
