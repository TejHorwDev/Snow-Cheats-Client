import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'SNOW LOADER — control panel',
  robots: { index: false, follow: false }
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a'
}

/*
 * The theme is read before the first paint, from the same key the switch writes.
 *
 * Without this the server-rendered dark page would be replaced by a light one after
 * hydration — a white flash on every navigation for anybody who chose light. The script
 * is inline and blocking on purpose: it is four lines, and it runs before the body.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('snow-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`

/*
 * The frame everything hangs in.
 *
 * The two fonts are self-hosted from the `geist` package, so the panel has one voice on
 * every machine instead of whatever Segoe UI happens to be installed — and it renders
 * without a network request, which matters when the whole point of this page is to tell
 * you something is wrong.
 *
 * The serif is the panel's own: it is set only where the page states a fact — the title,
 * a figure, a login welcome — and the sans does the work. That division is the design.
 */
export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
