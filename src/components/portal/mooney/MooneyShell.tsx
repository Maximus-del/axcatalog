import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, LogOut, Menu, MessageCircle, Moon, PanelLeft, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/auth/AuthProvider";
import { usePortalData } from "../PortalDataContext";
import { entityVoice } from "@/lib/portal/entity-voice";
import { brandLines, worldBrand } from "@/lib/portal/world";
import { usePortalProfile } from "@/hooks/usePortalApi";
import { AXTeamDrawer } from "./AXTeamDrawer";
import { activePortalPage, portalLink, worldNavigation } from "./navigation";
import "./mooney.css";

export function MooneyShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const { athlete } = usePortalData();
  const voice = entityVoice(athlete);
  // The wordmark is this client's world, from their portal theme — never another client's name.
  const brand = worldBrand(athlete.portal_theme, athlete.last_name, voice.name);
  const [brandTop, brandBottom] = brandLines(brand);
  const profile = usePortalProfile();
  const { signOut } = useAuth();
  const location = useLocation();
  const world = athlete.portal_theme.world;
  const nav = worldNavigation(world.roomName);
  const active = activePortalPage(location.pathname, nav);
  const [logoFailed, setLogoFailed] = useState(false);
  // The client's own mark when they have one; the moon is Mooney World's.
  const mark = world.logoUrl && !logoFailed ? <img className="mw-logo" src={world.logoUrl} alt="" onError={() => setLogoFailed(true)} /> : <Moon />;
  const markSmall = world.logoUrl && !logoFailed ? <img className="mw-logo mw-logo-sm" src={world.logoUrl} alt="" /> : <Moon className="text-accent" />;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatar = profile.data?.avatarUrl;
  const portrait = avatar && !avatarFailed ? <img className="mw-avatar" src={avatar} alt="" onError={() => setAvatarFailed(true)} /> : <span className="mw-avatar">{voice.initials}</span>;

  function navigation() {
    return <nav className="mw-nav" aria-label="Client portal">{nav.map((item) => <Link key={item.path} to={portalLink(item.path, location.search)} className="mw-nav-link" aria-current={active.path === item.path ? "page" : undefined} title={item.label} onClick={() => setNavOpen(false)}><item.icon /><span>{item.label}</span></Link>)}</nav>;
  }
  function openTeam() { setNavOpen(false); setTeamOpen(true); }
  const teamButton = <Button variant="ghost" className="mw-team-shortcut" title="AX Team" aria-label="Open AX Team messages" onClick={openTeam}><MessageCircle /><span>AX Team<small>We’re here for you.</small></span><ChevronRight className="mw-chevron" /></Button>;

  const shellStyle = (world.heroUrl ? { "--mw-hero": `url("${world.heroUrl}")` } : {}) as CSSProperties;
  return <div className="mw-shell" data-stage={world.stage} style={shellStyle}><div className="mw-frame" data-collapsed={collapsed}>
    <aside className={`mw-sidebar ${collapsed ? "mw-collapsed" : ""}`}>
      <Link className="mw-wordmark" to={portalLink("/portal", location.search)} aria-label={`${brand} ${world.roomName}`}>{mark}<strong>{brandTop}{brandBottom && <span>{brandBottom}</span>}</strong></Link>
      {navigation()}
      <div className="mw-sidebar-footer">{teamButton}<Link className="mw-identity" to={portalLink("/portal/profile", location.search)} title={voice.name}>{portrait}<div><strong>{voice.name}</strong><small>{voice.subtitle}</small></div></Link></div>
    </aside>
    <div className="mw-main">
      <header className="mw-topbar">
        <Button variant="ghost" size="icon" className="mw-icon mw-desktop-toggle" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><PanelLeft /></Button>
        <Button variant="ghost" size="icon" className="mw-icon mw-mobile-menu" title="Open navigation" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu /></Button>
        <h2>{active.label}</h2>
        <div className="mw-topbar-actions"><Button variant="ghost" size="icon" className="mw-icon" aria-label="Open AX Team messages" title="AX Team messages" onClick={openTeam}><MessageCircle /></Button><Button variant="ghost" size="icon" className="mw-icon" title="Your profile" aria-label="Your profile" asChild><Link to={portalLink("/portal/profile", location.search)}><UserRound /></Link></Button><Button variant="ghost" size="icon" className="mw-icon" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut /></Button><span className="mw-topbar-avatar">{portrait}</span></div>
      </header>
      <div className="mw-room-ground">{children}</div>
    </div>
  </div>
  <Sheet open={navOpen} onOpenChange={setNavOpen}><SheetContent side="left" className="mw-drawer w-[min(320px,90vw)] sm:max-w-[320px]"><SheetHeader className="text-left"><SheetTitle className="flex items-center gap-2">{markSmall}{brand}</SheetTitle><SheetDescription>{voice.name}</SheetDescription></SheetHeader>{navigation()}<div className="mt-auto">{teamButton}<Button variant="ghost" asChild className="w-full mt-3 min-h-11"><Link to={portalLink("/portal/profile", location.search)} onClick={() => setNavOpen(false)}><UserRound />Your profile</Link></Button></div></SheetContent></Sheet>
  <AXTeamDrawer open={teamOpen} onOpenChange={setTeamOpen} />
  </div>;
}