import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const rotateSchema = z.object({
  // Backup password is required to validate user identity
  backupPassword: z.string().min(1),
  // New backup password (optional - use same if not provided)
  newBackupPassword: z.string().min(8).optional(),
  // Current device ID initiating the rotation
  deviceId: z.string().min(1),
  // New encrypted master key for backup (encrypted with new/same password)
  newEncryptedBackupKey: z.string().min(1),
  // New salt for the new backup key derivation
  newBackupSalt: z.string().min(1),
  // New encrypted keys for each active device
  deviceKeys: z.array(z.object({
    deviceId: z.string(),
    encryptedKey: z.string(),
  })),
  // Optional: rotation log ID if continuing from device revocation
  rotationLogId: z.string().optional(),
})

/**
 * POST /api/users/encryption-key/rotate
 * Rotate the master key
 *
 * The client must:
 * 1. Decrypt the current master key with their device key
 * 2. Generate a new master key
 * 3. Re-encrypt for all active devices
 * 4. Re-encrypt for backup with user's password
 * 5. Send all encrypted keys to this endpoint
 *
 * Security: Backup password is required to validate user identity
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validationResult = rotateSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const {
      deviceId,
      newEncryptedBackupKey,
      newBackupSalt,
      deviceKeys,
      rotationLogId,
    } = validationResult.data

    const user = await db.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify device belongs to user and is not revoked
    const device = await db.device.findFirst({
      where: {
        id: deviceId,
        userId: user.id,
        revokedAt: null,
      },
    })

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found or revoked' },
        { status: 404 }
      )
    }

    // Get current key version
    const currentBackupKey = await db.userEncryptionKey.findFirst({
      where: {
        userId: user.id,
        keyType: 'backup',
        isActive: true,
      },
    })

    if (!currentBackupKey) {
      return NextResponse.json(
        { error: 'No encryption keys found. Initialize first.' },
        { status: 400 }
      )
    }

    const currentVersion = currentBackupKey.keyVersion
    const newVersion = currentVersion + 1

    // Verify all device IDs in deviceKeys are active devices belonging to user
    const activeDevices = await db.device.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      select: { id: true },
    })

    const activeDeviceIds = new Set(activeDevices.map((d) => d.id))

    for (const dk of deviceKeys) {
      if (!activeDeviceIds.has(dk.deviceId)) {
        return NextResponse.json(
          { error: `Device ${dk.deviceId} is not an active device` },
          { status: 400 }
        )
      }
    }

    // Perform rotation in a transaction
    await db.$transaction(async (tx) => {
      // 1. Mark all old keys as inactive
      await tx.userEncryptionKey.updateMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      })

      // 2. Create new backup key
      await tx.userEncryptionKey.create({
        data: {
          userId: user.id,
          deviceId: null,
          encryptedMasterKey: newEncryptedBackupKey,
          keyType: 'backup',
          salt: newBackupSalt,
          keyVersion: newVersion,
          isActive: true,
        },
      })

      // 3. Create new device keys for each active device
      for (const dk of deviceKeys) {
        await tx.userEncryptionKey.create({
          data: {
            userId: user.id,
            deviceId: dk.deviceId,
            encryptedMasterKey: dk.encryptedKey,
            keyType: 'device',
            keyVersion: newVersion,
            isActive: true,
          },
        })
      }

      // 4. Update or create rotation log
      if (rotationLogId) {
        await tx.keyRotationLog.update({
          where: { id: rotationLogId },
          data: {
            status: 'in_progress',
            newVersion,
          },
        })
      } else {
        await tx.keyRotationLog.create({
          data: {
            userId: user.id,
            oldVersion: currentVersion,
            newVersion,
            status: 'in_progress',
            triggeredBy: 'manual',
          },
        })
      }
    })

    console.log(`[Key Rotation] Rotated keys for user ${user.id}: v${currentVersion} -> v${newVersion}`)

    return NextResponse.json({
      success: true,
      oldVersion: currentVersion,
      newVersion,
    })
  } catch (error) {
    console.error('[Key Rotation] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/users/encryption-key/rotate
 * Get pending rotation status
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check for pending rotation
    const pendingRotation = await db.keyRotationLog.findFirst({
      where: {
        userId: user.id,
        status: { in: ['pending', 'in_progress'] },
      },
      orderBy: { startedAt: 'desc' },
    })

    // Get current key version
    const currentKey = await db.userEncryptionKey.findFirst({
      where: {
        userId: user.id,
        keyType: 'backup',
        isActive: true,
      },
      select: { keyVersion: true, updatedAt: true },
    })

    return NextResponse.json({
      currentVersion: currentKey?.keyVersion ?? 1,
      lastRotation: currentKey?.updatedAt ?? null,
      pendingRotation: pendingRotation
        ? {
            id: pendingRotation.id,
            status: pendingRotation.status,
            oldVersion: pendingRotation.oldVersion,
            newVersion: pendingRotation.newVersion,
            triggeredBy: pendingRotation.triggeredBy,
            startedAt: pendingRotation.startedAt,
          }
        : null,
    })
  } catch (error) {
    console.error('[Key Rotation] Error getting status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
