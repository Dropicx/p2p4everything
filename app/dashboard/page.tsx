import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { db } from '@/lib/db'
import { DeviceRegistration } from '@/components/dashboard/device-registration'
import { DashboardWidgets } from '@/components/dashboard/dashboard-widgets'

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
    <div className="px-3 py-4 sm:px-4 sm:py-6">
      <DeviceRegistration />
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Your secure peer-to-peer platform
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Devices">
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {dbUser?.devices.length || 0}
          </p>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">
            Active devices
          </p>
        </Card>

        <Card title="Connections">
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {totalConnections}
          </p>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">
            Total connections
          </p>
        </Card>

        <Card title="Status">
          <p className="text-base sm:text-lg font-semibold text-green-600 dark:text-green-400">
            Online
          </p>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">
            All systems operational
          </p>
        </Card>
      </div>

      {/* Quick Access Widgets */}
      <div className="mt-6 sm:mt-8">
        <DashboardWidgets />
      </div>

      {dbUser?.devices && dbUser.devices.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <Card title="Recent Devices">
            <ul className="space-y-2 sm:space-y-3">
              {dbUser.devices.map((device) => (
                <li
                  key={device.id}
                  className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div>
                    <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                      {device.deviceName}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
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

