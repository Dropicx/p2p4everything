import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { db } from '@/lib/db'

export default async function DashboardPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await currentUser()
  const dbUser = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: {
      devices: {
        orderBy: { lastSeen: 'desc' },
        take: 5,
      },
      _count: {
        select: {
          connectionsA: true,
          connectionsB: true,
        },
      },
    },
  })

  const totalConnections =
    (dbUser?._count.connectionsA || 0) + (dbUser?._count.connectionsB || 0)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Your secure peer-to-peer platform
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Devices">
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {dbUser?.devices.length || 0}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Active devices
          </p>
        </Card>

        <Card title="Connections">
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {totalConnections}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Total connections
          </p>
        </Card>

        <Card title="Status">
          <p className="text-lg font-semibold text-green-600 dark:text-green-400">
            Online
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            All systems operational
          </p>
        </Card>
      </div>

      {dbUser?.devices && dbUser.devices.length > 0 && (
        <div className="mt-8">
          <Card title="Recent Devices">
            <ul className="space-y-3">
              {dbUser.devices.map((device) => (
                <li
                  key={device.id}
                  className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {device.deviceName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {device.deviceType} • Last seen:{' '}
                      {new Date(device.lastSeen).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}

