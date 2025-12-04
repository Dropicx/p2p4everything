import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if caller wants to include revoked devices (for admin/history purposes)
    const { searchParams } = new URL(request.url)
    const includeRevoked = searchParams.get('includeRevoked') === 'true'

    const devices = await db.device.findMany({
      where: {
        userId: user.id,
        // By default, only return active (non-revoked) devices
        // This prevents clipboard sync and other features from targeting revoked devices
        ...(includeRevoked ? {} : { revokedAt: null }),
      },
      orderBy: { lastSeen: 'desc' },
    })

    return NextResponse.json(devices)
  } catch (error) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

