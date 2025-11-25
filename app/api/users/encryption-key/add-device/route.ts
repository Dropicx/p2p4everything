import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const addDeviceSchema = z.object({
  deviceId: z.string().min(1),
  encryptedMasterKey: z.string().min(1),
})

/**
 * POST /api/users/encryption-key/add-device
 * Add encryption key for a new device
 * Master key must already be initialized (backup key must exist)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validationResult = addDeviceSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { deviceId, encryptedMasterKey } = validationResult.data

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

    // Verify user has a backup key (master key initialized)
    const backupKey = await db.userEncryptionKey.findFirst({
      where: {
        userId: user.id,
        keyType: 'backup',
      },
    })

    if (!backupKey) {
      return NextResponse.json(
        { error: 'Master key not initialized. Use initialize endpoint first.' },
        { status: 400 }
      )
    }

    // Check if device already has a key
    const existingDeviceKey = await db.userEncryptionKey.findFirst({
      where: {
        userId: user.id,
        deviceId: deviceId,
        keyType: 'device',
      },
    })

    if (existingDeviceKey) {
      // Update existing key
      await db.userEncryptionKey.update({
        where: { id: existingDeviceKey.id },
        data: {
          encryptedMasterKey: encryptedMasterKey,
          updatedAt: new Date(),
        },
      })
      console.log(`[Encryption Key] Updated device key for device ${deviceId}`)
    } else {
      // Create new device key
      await db.userEncryptionKey.create({
        data: {
          userId: user.id,
          deviceId: deviceId,
          encryptedMasterKey: encryptedMasterKey,
          keyType: 'device',
        },
      })
      console.log(`[Encryption Key] Created device key for device ${deviceId}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Encryption Key] Error adding device key:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
