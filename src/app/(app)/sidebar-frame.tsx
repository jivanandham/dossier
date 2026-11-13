"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { rememberPreference, SIDEBAR_COOKIE } from "@/lib/ui-preferences";

interface SidebarContextType {
  collapsed: boolean;
  expand: () => void;
  mobileOpen: boolean;
  closeMobile: () => void;
  openMobile: () => void;
  toggleMobile: () => void;
}

const CollapsedContext = createContext<SidebarContextType>({
  collapsed: false,
  expand: () => {},
  mobileOpen: false,
  closeMobile: () => {},
  openMobile: () => {},
  toggleMobile: () => {},
});

/** Whether the sidebar is collapsed to its icons, for the parts that need more than CSS. */
export function useSidebarCollapsed(): boolean {
  return use(CollapsedContext).collapsed;
}

/** Opens a collapsed sidebar, for a part that needs its full width (the update notice). */
export function useExpandSidebar(): () => void {
  return use(CollapsedContext).expand;
}

/** Closes the mobile navigation drawer. */
export function useCloseMobileSidebar(): () => void {
  return use(CollapsedContext).closeMobile;
}

/** Access full sidebar context. */
export function useSidebarContext(): SidebarContextType {
  return use(CollapsedContext);
}

/**
 * The sidebar's frame:
 * - On desktop (md:): An in-flow collapsible sidebar (w-[260px] or w-12 icons).
 * - On mobile (< md): An off-canvas slide-out drawer with a backdrop that closes
 *   cleanly on close button tap, backdrop tap, nav link click, or Escape key.
 */
export function SidebarFrame({
  initialCollapsed,
  brand,
  children,
}: {
  initialCollapsed: boolean;
  /** The logo, which the expand button replaces on hover while collapsed. */
  brand: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const change = (next: boolean) => {
    setCollapsed(next);
    rememberPreference(SIDEBAR_COOKIE, next ? "collapsed" : "expanded");
  };
  const toggle = () => change(!collapsed);
  const closeMobile = () => setMobileOpen(false);
  const openMobile = () => setMobileOpen(true);
  const toggleMobile = () => setMobileOpen((prev) => !prev);
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [mobileOpen]);

  return (
    <CollapsedContext.Provider value={{ collapsed, expand: () => change(false), mobileOpen, closeMobile, openMobile, toggleMobile }}>
      {/* Mobile Top Header (always visible on mobile view) */}
      <header className="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center justify-between border-b border-line bg-sidebar px-4 md:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openMobile}
            aria-label="Open menu"
            title="Open menu"
            className="grid size-9 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink active:scale-95 motion-safe:transition"
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <BrandMark className="size-6" />
            <span className="font-serif text-xl font-medium tracking-[-0.01em]">Dossier</span>
          </div>
        </div>
        <Link
          href="/new?fresh=1"
          className="flex h-8 items-center gap-1 rounded-control bg-primary px-3 text-xs font-semibold text-on-primary shadow-cta hover:bg-primary-hover motion-safe:transition-colors"
        >
          <span>+ New</span>
        </Link>
      </header>

      {/* Mobile Backdrop Overlay (tapping closes the drawer) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs motion-safe:transition-opacity md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Mobile slide-out drawer (< md) + Desktop sticky column (md:) */}
      <aside
        data-collapsed={collapsed || undefined}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          // Clicking any navigation link or action inside drawer closes it on mobile
          if (target.closest("a, button[type='submit']")) {
            closeMobile();
          }
        }}
        className={cn(
          "group/sidebar flex flex-col overflow-x-hidden overflow-y-auto border-r border-line bg-sidebar motion-safe:transition-[width,transform] motion-safe:duration-200",
          // Mobile Drawer styling: fixed, off-screen by default, slides in when mobileOpen
          "fixed inset-y-0 left-0 z-50 h-full w-[280px] max-w-[85vw] shadow-dialog md:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop Styling: in-flow sticky column
          "md:sticky md:top-0 md:h-screen md:shrink-0 md:self-start md:translate-x-0",
          collapsed ? "md:w-12" : "md:w-[260px]",
        )}
      >
        <div
          className={cn(
            "group/header relative flex items-center justify-between gap-2 border-b border-line",
            collapsed ? "md:justify-center md:px-1 md:py-3 pt-3 pr-3 pb-4 pl-4" : "pt-3 pr-3 pb-4 pl-4",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2",
              collapsed &&
                "md:flex-none md:group-hover/header:opacity-0 md:group-has-[button:focus-visible]/header:opacity-0 motion-safe:transition-opacity",
            )}
          >
            {brand}
          </div>

          {/* Desktop Collapse / Expand Button */}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden md:grid size-7 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink",
              collapsed &&
                "md:absolute md:inset-0 md:m-auto md:size-8 md:bg-surface md:opacity-0 md:group-hover/header:opacity-100 md:focus-visible:opacity-100 motion-safe:transition-opacity",
            )}
          >
            <Icon size={16} aria-hidden="true" />
          </button>

          {/* Mobile Close Button (Prominent X button on mobile) */}
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Close menu"
            title="Close menu"
            className="grid size-9 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink active:scale-95 md:hidden"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </aside>
    </CollapsedContext.Provider>
  );
}
