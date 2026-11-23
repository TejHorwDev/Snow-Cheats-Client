'use client'

import { useEffect } from 'react'

/*
 * The light switch.
 *
 * The theme lives on the document element, not in React state: the inline script in the
 * root layout sets it before the first paint, and this button only flips it. That is why
 * there is no state here — a state-driven icon would render the wrong one for a frame on
 * a stored light theme, and a flash of the wrong label is worse than no label at all.
 *
 * The effect below is the second lock on the same door: if hydration ever puts the
 * server's default back, the stored choice is re-applied immediately after.
 */
export default function ThemeToggle(): React.JSX.Element {
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('snow-theme')
      if (stored === 'light' || stored === 'dark') {
        document.documentElement.setAttribute('data-theme', stored)
      }
    } catch {
      /* No storage — the page keeps the theme it rendered with. */
    }
  }, [])

  function toggle(): void {
    const next =
      document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    try {
      window.localStorage.setItem('snow-theme', next)
    } catch {
      /* No storage — the choice still lasts for this page. */
    }
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label="Switch theme"
      title="Switch theme"
    >
      <svg
        className="theme-moon"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M13.4 9.8A5.7 5.7 0 0 1 6.2 2.6a5.7 5.7 0 1 0 7.2 7.2Z" />
      </svg>
      <svg
        className="theme-sun"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
      </svg>
      <span className="theme-label" aria-hidden="true" />
    </button>
  )
}
