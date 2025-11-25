import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/users/encryption-key
 * Fetch encrypted master key for current device
 * Falls back to backup key if device-specific key not found
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get device ID from query params
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    const user = await db.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Try to find device-specific key first
    if (deviceId) {
      const deviceKey = await db.userEncryptionKey.findFirst({
        where: {
          userId: user.id,
          deviceId: deviceId,
          keyType: 'device',
        },
      })

      if (deviceKey) {
        return NextResponse.json({
          encryptedMasterKey: deviceKey.encryptedMasterKey,
          keyType: 'device',
        })
      }
    }

    // Fall back to backup key
    const backupKey = await db.userEncryptionKey.findFirst({
      where: {
        userId: user.id,
        keyType: 'backup',
      },
    })

    if (backupKey) {
      return NextResponse.json({
        encryptedMasterKey: backupKey.encryptedMasterKey,
        keyType: 'backup',
        salt: backupKey.salt,
      })
    }

    // No encryption keys found
    return NextResponse.json({
      encryptedMasterKey: null,
      keyType: null,
    })
  } catch (error) {
    console.error('[Encryption Key] Error fetching encryption key:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
