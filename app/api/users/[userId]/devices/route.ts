import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId: currentUserId } = await auth()

    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await db.user.findUnique({
      where: { clerkUserId: currentUserId },
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get target user
    const targetUser = await db.user.findUnique({
      where: { id: params.userId },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      )
    }

    // Verify connection exists and is accepted
    const connection = await db.connection.findFirst({
      where: {
        OR: [
          {
            userAId: currentUser.id,
            userBId: targetUser.id,
          },
          {
            userAId: targetUser.id,
            userBId: currentUser.id,
          },
        ],
        status: 'accepted',
      },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'No accepted connection with this user' },
        { status: 403 }
      )
    }

    // Get target user's devices (only public keys of active devices)
    // CRITICAL: Do not return revoked devices - prevents sending data to revoked devices
    const devices = await db.device.findMany({
      where: {
        userId: targetUser.id,
        revokedAt: null, // Only active devices
      },
      select: {
        id: true,
        publicKey: true,
        deviceName: true,
        deviceType: true,
        lastSeen: true,
      },
      orderBy: { lastSeen: 'desc' },
    })

    // Log for debugging
    console.log(`[Devices API] Found ${devices.length} devices for user ${targetUser.id}`)
    devices.forEach((device, index) => {
      console.log(
        `[Devices API] Device ${index + 1}: ${device.deviceName} (${device.deviceType}), hasPublicKey: ${!!device.publicKey}, publicKeyLength: ${device.publicKey?.length || 0}`
      )
    })

    return NextResponse.json(devices)
  } catch (error) {
    console.error('Error fetching user devices:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

