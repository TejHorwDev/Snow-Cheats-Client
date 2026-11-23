import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/auth'
import SignOut from '@/components/SignOut'
import Nav from '@/components/Nav'
import Topbar from '@/components/Topbar'
import Footer from '@/components/Footer'
import MobileNav from '@/components/MobileNav'

export const dynamic = 'force-dynamic'

/*
 * The panel's frame, and its only lock.
 *
 * Every page under here is server-rendered behind this check, so a page that
 * forgets to guard itself is still guarded. The API routes check again on their
 * own — a layout is not a boundary for anything that is not a page.
 *
 * The frame is two frames. On a desk it is a rail and a room: the rail holds the four
 * sections and the way out, and the room holds the work. Under 900 pixels the rail goes
 * away and the phone takes over — a brand bar, the same four sections as a tab bar under
 * the thumb, and the rest of the panel in a sheet behind the fifth tab. Same pages, same
 * data, a different instrument.
 */
export default async function PanelLayout({
  children
}: {
  children: React.ReactNode
}): Promise<React.JSX.Element> {
  if (!(await currentSession())) redirect('/admin/login')

  return (
    <div className="shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <aside className="rail">
        <div className="rail-brand">
          <Link href="/admin" className="brand" aria-label="SNOW LOADER admin — overview">
            <span className="brand-mark" aria-hidden="true" />
            <span className="wordmark">
              SNOW LOADER
              <em>Control panel</em>
            </span>
          </Link>
        </div>

        <Nav />

        <div className="rail-foot">
          <div className="rail-status">
            <span className="dot" data-tone="on" />
            Panel live
          </div>
          <SignOut />
        </div>
      </aside>

      <div className="workspace">
        <Topbar />
        <div className="content" id="content">
          {children}
          <Footer />
        </div>
      </div>

      <MobileNav />
    </div>
  )
}
