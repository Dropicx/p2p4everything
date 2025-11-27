'use client'

import { KeyRotation } from './key-rotation'

/**
 * Client-side security settings component
 * Contains encryption key management features
 */
export function SecuritySettings() {
  return (
    <div className="space-y-6">
      <KeyRotation />
    </div>
  )
}
