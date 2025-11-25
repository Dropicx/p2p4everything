import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const initializeSchema = z.object({
  deviceId: z.string().min(1),
  encryptedMasterKeyForDevice: z.string().min(1),
  encryptedMasterKeyBackup: z.string().min(1),
  backupSalt: z.string().min(1),
})

/**
 * POST /api/users/encryption-key/initialize
 * Initialize master key for first device
 * Creates both device-specific and backup encryption keys
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validationResult = initializeSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { deviceId, encryptedMasterKeyForDevice, encryptedMasterKeyBackup, backupSalt } =
      validationResult.data

    const user = await db.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if device exists and belongs to user
    const device = await db.device.findFirst({
      where: {
        id: deviceId,
        userId: user.id,
      },
    })

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    // Check if user already has encryption keys
    const existingKeys = await db.userEncryptionKey.findFirst({
      where: { userId: user.id },
    })

    if (existingKeys) {
      return NextResponse.json(
        { error: 'Encryption keys already initialized' },
        { status: 409 }
      )
    }

    // Create both device key and backup key in a transaction
    await db.$transaction([
      // Device-specific key
      db.userEncryptionKey.create({
        data: {
          userId: user.id,
          deviceId: deviceId,
          encryptedMasterKey: encryptedMasterKeyForDevice,
          keyType: 'device',
        },
      }),
      // Backup key (no deviceId)
      db.userEncryptionKey.create({
        data: {
          userId: user.id,
          deviceId: null,
          encryptedMasterKey: encryptedMasterKeyBackup,
          keyType: 'backup',
          salt: backupSalt,
        },
      }),
    ])

    console.log(`[Encryption Key] Initialized encryption keys for user ${user.id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Encryption Key] Error initializing encryption key:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
