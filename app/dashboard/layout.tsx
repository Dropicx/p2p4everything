'use client'

import { useEffect } from 'react'
import { Navbar } from '@/components/layout/navbar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Run 30-day message cleanup on dashboard load
  useEffect(() => {
    async function runCleanup() {
      try {
        const { cleanupOldMessages } = await import('@/lib/crypto/message-storage')
        await cleanupOldMessages()
      } catch (error) {
        console.error('[Dashboard] Failed to run message cleanup:', error)
      }
    }

    runCleanup()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}

