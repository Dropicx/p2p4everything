// This file exists to satisfy Cursor's worktree system
// The actual dashboard layout is at app/dashboard/layout.tsx
// This is a passthrough layout that doesn't interfere with routing

import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  // This layout group doesn't create a URL segment
  // It's just here to satisfy the worktree reference
  return <>{children}</>
}
