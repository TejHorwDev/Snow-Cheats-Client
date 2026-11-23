'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import SignOut from '@/components/SignOut'
import ThemeToggle from '@/components/ThemeToggle'

/*
 * The phone's way around.
 *
 * A rail is a desktop idea: it takes a quarter of the width and it is always there. On a
 * phone the width is the whole budget, so the four sections move to a bar under the thumb,
 * and everything that is not one of them — accounts, licence keys, signing out — moves
 * into a sheet the last tab opens. Nothing is lost; it is just filed where a thumb can
 * reach it.
 *
 * The sheet closes on navigation by itself, so a link in it never leaves the panel
 * sitting behind a scrim.
 */

const TABS = [
  {
    href: '/admin',
    label: 'Home',
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

export default function MobileNav(): React.JSX.Element {
  const path = usePathname()
  const [more, setMore] = useState(false)

  useEffect(() => {
    setMore(false)
  }, [path])

  useEffect(() => {
    if (!more) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = before
    }
  }, [more])

  useEffect(() => {
    if (!more) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setMore(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [more])

  const active = (href: string): boolean =>
    href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`)

  return (
    <>
      <nav className="mobile-tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="mobile-tab"
            data-active={active(tab.href)}
            aria-current={active(tab.href) ? 'page' : undefined}
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
              {tab.icon}
            </svg>
            {tab.label}
          </Link>
        ))}

        <button
          type="button"
          className="mobile-tab"
          data-active={active('/admin/accounts') || active('/admin/licenses')}
          aria-expanded={more}
          aria-controls="mobile-more"
          onClick={() => setMore((was) => !was)}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
          </svg>
          More
        </button>
      </nav>

      {more ? (
        <div
          className="mobile-sheet-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="More sections"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMore(false)
          }}
        >
          <div className="mobile-sheet" id="mobile-more">
            <div className="mobile-sheet-head">
              <span>More</span>
              <button type="button" onClick={() => setMore(false)}>
                Close
              </button>
            </div>

            <Link href="/admin/accounts" className="mobile-sheet-link">
              Accounts <span>›</span>
            </Link>
            <Link href="/admin/licenses" className="mobile-sheet-link">
              Licence keys <span>›</span>
            </Link>

            <ThemeToggle />

            <SignOut />
          </div>
        </div>
      ) : null}
    </>
  )
}
