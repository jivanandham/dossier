"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { isCurrent, NAV } from "@/lib/nav";

import { useCloseMobileSidebar, useSidebarCollapsed } from "./sidebar-frame";

/** The sidebar's navigation, with the current section highlighted. */
export function NavLinks({ counts }: { counts?: Record<string, number> } = {}) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const closeMobile = useCloseMobileSidebar();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
      {NAV.map(({ label, items }, index) => (
        <div
          key={label ?? index}
          className={cn(
            "flex flex-col gap-0.5",
            index === NAV.length - 1 && cn("mt-auto border-t border-line pt-2", collapsed ? "-mx-1 px-1" : "-mx-2 px-2"),
          )}
        >
          {label &&
            (collapsed ? (
              // Holds the label's place, so the groups stay apart with the labels hidden.
              <div aria-hidden="true" className="mx-2 my-[15px] h-px bg-line-card" />
            ) : (
              <div className="mt-1.5 mb-1 px-3 py-1 text-xs font-medium text-muted">{label}</div>
            ))}
          {items.map((item) => {
            const { href, label, icon: Icon } = item;
            const active = isCurrent(item, pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={closeMobile}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium hover:bg-hover hover:text-ink motion-safe:transition-colors",
                  collapsed && "md:relative md:justify-center md:px-1.5 md:py-2",
                  // One or the other: cn() doesn't merge, so both would leave the CSS order to pick.
                  active ? "bg-hover text-ink" : "text-muted",
                )}
              >
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <span className={cn(collapsed && "md:sr-only")}>{label}</span>
                {counts?.[href] ? (
                  <span
                    className={cn(
                      "ml-auto rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-on-primary",
                      collapsed && "md:absolute md:ml-0 md:translate-x-2.5 md:-translate-y-2",
                    )}
                  >
                    {counts[href]}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
