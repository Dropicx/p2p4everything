import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const updateBackupSchema = z.object({
  encryptedMasterKeyBackup: z.string().min(1),
  backupSalt: z.string().min(1),
})

/**
 * PUT /api/users/encryption-key/update-backup
 * Update the backup key (e.g., after session refresh)
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validationResult = updateBackupSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { encryptedMasterKeyBackup, backupSalt } = validationResult.data

    const user = await db.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Find existing backup key
    const existingBackup = await db.userEncryptionKey.findFirst({
      where: {
        userId: user.id,
        keyType: 'backup',
      },
    })

    if (!existingBackup) {
      return NextResponse.json(
        { error: 'No backup key found. Use initialize endpoint first.' },
        { status: 400 }
      )
    }

    // Update backup key
    await db.userEncryptionKey.update({
      where: { id: existingBackup.id },
      data: {
        encryptedMasterKey: encryptedMasterKeyBackup,
        salt: backupSalt,
        updatedAt: new Date(),
      },
    })

    console.log(`[Encryption Key] Updated backup key for user ${user.id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Encryption Key] Error updating backup key:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
