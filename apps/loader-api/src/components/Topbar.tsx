'use client'

import { usePathname } from 'next/navigation'
import CommandPalette from '@/components/CommandPalette'

/*
 * The strip above the work.
 *
 * It answers one question — where am I — and holds one control. The section name is
 * read from the address rather than passed down, so a page cannot disagree with the
 * rail about where it is.
 */

const SECTIONS: Array<{ prefix: string; label: string }> = [
  { prefix: '/admin/apps', label: 'Products' },
  { prefix: '/admin/storage', label: 'Storage' },
  { prefix: '/admin/settings', label: 'Settings' },
  { prefix: '/admin/accounts', label: 'Accounts' },
  { prefix: '/admin/licenses', label: 'Licence keys' },
  { prefix: '/admin', label: 'Overview' }
]

export default function Topbar(): React.JSX.Element {
  const path = usePathname()
  const section =
    SECTIONS.find((entry) => path === entry.prefix || path.startsWith(`${entry.prefix}/`))?.label ??
    'Overview'

  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className="topbar-root">SNOW LOADER</span>
        <span className="topbar-sep">/</span>
        <span className="topbar-section">{section}</span>
      </div>

      <div className="topbar-actions">
        <CommandPalette />
      </div>
    </header>
  )
}
