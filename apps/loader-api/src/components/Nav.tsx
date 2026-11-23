'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/*
 * The section switcher.
 *
 * Four words, a line icon each, and one of them marked by a rule. The rail is where
 * the section lives now, so the switcher has room to say what it is instead of
 * competing with the page title in a bar.
 *
 * The licence page is deliberately absent: it is reached by its address, as the owner
 * asked. Nothing here is a search, so nothing here needs to list everything.
 */

const LINKS = [
  {
    href: '/admin',
    label: 'Overview',
    icon: (
      <>
        <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
      </>
    )
  },
  {
    href: '/admin/apps',
    label: 'Products',
    icon: (
      <>
        <path d="M8 2.5 13.5 5.5v5L8 13.5 2.5 10.5v-5L8 2.5Z" />
        <path d="M2.5 5.5 8 8.5l5.5-3M8 8.5v5" />
      </>
    )
  },
  {
    href: '/admin/storage',
    label: 'Storage',
    icon: (
      <>
        <ellipse cx="8" cy="4" rx="5.5" ry="2.5" />
        <path d="M2.5 4v8c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V4" />
        <path d="M2.5 8c0 1.4 2.5 2.5 5.5 2.5S13.5 9.4 13.5 8" />
      </>
    )
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: (
      <>
        <path d="M2 4h12M2 8h12M2 12h12" opacity="0.35" />
        <circle cx="6" cy="4" r="1.8" />
        <circle cx="10.5" cy="8" r="1.8" />
        <circle cx="5" cy="12" r="1.8" />
      </>
    )
  }
]

export default function Nav(): React.JSX.Element {
  const path = usePathname()

  return (
    <nav className="nav" aria-label="Sections">
      <div className="nav-group">
        <p className="nav-label">Workspace</p>
        {LINKS.map((link) => {
          const active =
            link.href === '/admin' ? path === '/admin' : path === link.href || path.startsWith(`${link.href}/`)

          return (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              data-active={active}
              aria-current={active ? 'page' : undefined}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {link.icon}
              </svg>
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
