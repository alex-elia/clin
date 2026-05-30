"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type NavLink = { href: string; label: string };

type NavMenu = {
  id: string;
  label: string;
  hub: NavLink;
  items: NavLink[];
};

const menus: NavMenu[] = [
  {
    id: "data",
    label: "Data & cleaning",
    hub: { href: "/data", label: "Overview" },
    items: [
      { href: "/contacts", label: "Contacts" },
      { href: "/captures", label: "Captures" },
      { href: "/queue", label: "Queue" },
      { href: "/autopilot", label: "Cleaning" },
    ],
  },
  {
    id: "outreach",
    label: "Outreach",
    hub: { href: "/outreach", label: "Overview" },
    items: [
      { href: "/campaigns", label: "Campaigns" },
      { href: "/decisions", label: "Decisions" },
      { href: "/inbox", label: "Inbox" },
    ],
  },
  {
    id: "branding",
    label: "Personal branding",
    hub: { href: "/branding", label: "Overview" },
    items: [
      { href: "/branding/setup", label: "Voice setup" },
      { href: "/branding/calendar", label: "Content plan" },
      { href: "/branding/studio", label: "Planning chat" },
      { href: "/me", label: "Voice summary" },
      { href: "/analytics", label: "Analytics" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function menuIsActive(pathname: string, menu: NavMenu): boolean {
  return (
    isActive(pathname, menu.hub.href) ||
    menu.items.some((item) => isActive(pathname, item.href))
  );
}

function NavDropdown({
  menu,
  pathname,
  openId,
  onOpen,
  onClose,
}: {
  menu: NavMenu;
  pathname: string;
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const listId = useId();
  const open = openId === menu.id;
  const active = menuIsActive(pathname, menu);

  const allLinks = [menu.hub, ...menu.items];

  return (
    <li className="relative">
      <button
        type="button"
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
          active
            ? "text-[var(--clin-accent)]"
            : "text-[var(--clin-muted)] hover:bg-[var(--clin-surface-muted)] hover:text-[var(--clin-text)]"
        }`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={listId}
        onClick={() => (open ? onClose() : onOpen(menu.id))}
      >
        {menu.label}
        <span
          className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-[var(--clin-border)] bg-[var(--clin-surface)] py-1 shadow-lg"
        >
          {allLinks.map((link, index) => {
            const linkActive = isActive(pathname, link.href);
            return (
              <li key={link.href} role="none">
                {index === 1 ? (
                  <div
                    className="my-1 border-t border-[var(--clin-border)]"
                    role="separator"
                  />
                ) : null}
                <Link
                  href={link.href}
                  role="menuitem"
                  className={`block px-3 py-2 text-sm ${
                    linkActive
                      ? "bg-[var(--clin-primary-soft)] font-medium text-[var(--clin-accent)]"
                      : "text-[var(--clin-text)] hover:bg-[var(--clin-surface-muted)]"
                  }`}
                  aria-current={linkActive ? "page" : undefined}
                  onClick={onClose}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!navRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const topLinkClass = (href: string) =>
    isActive(pathname, href)
      ? "font-medium text-[var(--clin-accent)]"
      : "text-[var(--clin-muted)] hover:bg-[var(--clin-surface-muted)] hover:text-[var(--clin-text)]";

  return (
    <header className="border-b border-[var(--clin-border)] bg-[var(--clin-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 text-[var(--clin-text)]"
          >
            <Image
              src="/brand/Clin_Logo_Small.png"
              alt="Clin"
              width={350}
              height={232}
              priority
              className="h-9 w-auto"
            />
          </Link>

          <nav
            ref={navRef}
            className="flex flex-wrap items-center gap-1 text-sm"
            aria-label="Main"
          >
            <ul className="flex flex-wrap items-center gap-0.5">
              <li>
                <Link
                  href="/"
                  className={`rounded-md px-2.5 py-1.5 ${topLinkClass("/")}`}
                  aria-current={pathname === "/" ? "page" : undefined}
                >
                  Home
                </Link>
              </li>

              {menus.map((menu) => (
                <NavDropdown
                  key={menu.id}
                  menu={menu}
                  pathname={pathname}
                  openId={openId}
                  onOpen={setOpenId}
                  onClose={close}
                />
              ))}

              <li>
                <Link
                  href="/settings"
                  className={`rounded-md px-2.5 py-1.5 ${topLinkClass("/settings")}`}
                  aria-current={
                    isActive(pathname, "/settings") ? "page" : undefined
                  }
                >
                  Settings
                </Link>
              </li>

              <li className="ml-1 border-l border-[var(--clin-border)] pl-2">
                <Link
                  href="/about"
                  className={`rounded-md px-2.5 py-1.5 text-xs ${topLinkClass("/about")}`}
                >
                  About
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
