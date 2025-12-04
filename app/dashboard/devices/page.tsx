import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import DevicesPageClient from './page-client'

export default async function DevicesPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: {
      devices: {
        orderBy: { lastSeen: 'desc' },
      },
    },
  })

  if (!user) {
    return <div>User not found</div>
  }

  // Convert dates to strings for client component
  // Include revokedAt so client can filter active vs revoked devices
  const devices = user.devices.map((device) => ({
    id: device.id,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    createdAt: device.createdAt.toISOString(),
    lastSeen: device.lastSeen.toISOString(),
    revokedAt: device.revokedAt?.toISOString() ?? null,
  }))

  return <DevicesPageClient devices={devices} />
}
