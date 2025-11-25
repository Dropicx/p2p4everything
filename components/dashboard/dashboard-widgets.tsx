'use client'

import { QuickContacts } from './quick-contacts'
import { QuickClipboard } from './quick-clipboard'

export function DashboardWidgets() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      <QuickContacts />
      <QuickClipboard />
    </div>
  )
}
