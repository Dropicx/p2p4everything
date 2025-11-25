import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { db } from '@/lib/db'
import { KeyFingerprint } from '@/components/dashboard/key-fingerprint'
import { ClipboardSyncToggle } from '@/components/dashboard/clipboard-sync-toggle'

export default async function SettingsPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await currentUser()
  const dbUser = await db.user.findUnique({
    where: { clerkUserId: userId },
  })

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your account settings
        </p>
      </div>

      <div className="space-y-6">
        <Card title="Profile Information">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Name
              </label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">
                {dbUser?.displayName || user?.fullName || 'Not set'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">
                {dbUser?.email || user?.emailAddresses[0]?.emailAddress || 'Not set'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Username
              </label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">
                {dbUser?.username || user?.username || 'Not set'}
              </p>
            </div>
          </div>
        </Card>

        <Card title="Security">
          <div className="space-y-4">
            <KeyFingerprint />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your account security is managed by Clerk. Visit your Clerk
                dashboard to manage authentication settings, two-factor
                authentication, and more.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Account">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Account Created
              </label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">
                {dbUser?.createdAt
                  ? new Date(dbUser.createdAt).toLocaleDateString()
                  : 'Not available'}
              </p>
            </div>
          </div>
        </Card>

        <ClipboardSyncToggle />
      </div>
    </div>
  )
}

