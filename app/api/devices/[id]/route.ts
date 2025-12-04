import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateDeviceSchema = z.object({
  publicKey: z.string().min(1).optional(),
  deviceName: z.string().min(1).max(100).optional(),
  clipboardSyncEnabled: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    const device = await db.device.findUnique({
      where: { id: params.id },
    })

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    if (device.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = updateDeviceSchema.parse(body)

    const updatedDevice = await db.device.update({
      where: { id: params.id },
      data: {
        ...(validatedData.publicKey && { publicKey: validatedData.publicKey }),
        ...(validatedData.deviceName && { deviceName: validatedData.deviceName }),
        ...(validatedData.clipboardSyncEnabled !== undefined && { clipboardSyncEnabled: validatedData.clipboardSyncEnabled }),
        lastSeen: new Date(),
      },
    })

    return NextResponse.json(updatedDevice)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating device:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

const revokeDeviceSchema = z.object({
  reason: z.string().optional(),
})

/**
 * DELETE /api/devices/{id}
 * Revokes a device (soft-delete) and triggers automatic key rotation
 *
 * Security: Device revocation always triggers key rotation to ensure
 * a potentially compromised device can't decrypt future messages.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    const device = await db.device.findUnique({
      where: { id: params.id },
      include: { encryptionKey: true },
    })

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    if (device.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Already revoked
    if (device.revokedAt) {
      return NextResponse.json({ error: 'Device already revoked' }, { status: 400 })
    }

    // Check if this is the user's only active device
    const activeDeviceCount = await db.device.count({
      where: {
        userId: user.id,
        revokedAt: null,
      },
    })

    if (activeDeviceCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot revoke your only active device. You would be locked out of your account.' },
        { status: 400 }
      )
    }

    // Parse optional reason from request body
    let reason: string | undefined
    try {
      const body = await request.json()
      const validated = revokeDeviceSchema.parse(body)
      reason = validated.reason
    } catch {
      // Body parsing failed - reason is optional, continue
    }

    // Get current key version
    const currentBackupKey = await db.userEncryptionKey.findFirst({
      where: {
        userId: user.id,
        keyType: 'backup',
        isActive: true,
      },
      select: { keyVersion: true },
    })

    const currentVersion = currentBackupKey?.keyVersion ?? 1

    // Use transaction to ensure atomicity
    const result = await db.$transaction(async (tx) => {
      // 1. Soft-delete: Set revokedAt timestamp
      await tx.device.update({
        where: { id: params.id },
        data: {
          revokedAt: new Date(),
          revocationReason: reason || 'Device revoked by user',
        },
      })

      // 2. Delete the device's encryption key (they can no longer decrypt)
      if (device.encryptionKey) {
        await tx.userEncryptionKey.delete({
          where: { id: device.encryptionKey.id },
        })
      }

      // 3. Create key rotation log entry (automatic rotation)
      const rotationLog = await tx.keyRotationLog.create({
        data: {
          userId: user.id,
          oldVersion: currentVersion,
          newVersion: currentVersion + 1,
          status: 'pending',
          triggeredBy: 'device_revocation',
        },
      })

      return { rotationLogId: rotationLog.id }
    })

    console.log(`[Device] Revoked device ${params.id}, triggered key rotation ${result.rotationLogId}`)

    return NextResponse.json({
      success: true,
      message: 'Device revoked successfully',
      rotationRequired: true,
      rotationLogId: result.rotationLogId,
    })
  } catch (error) {
    console.error('Error revoking device:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

