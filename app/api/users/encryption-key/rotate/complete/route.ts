import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const completeSchema = z.object({
  // Number of items that were re-encrypted by the client
  itemsRotated: z.number().int().min(0),
})

/**
 * POST /api/users/encryption-key/rotate/complete
 * Mark key rotation as complete after client has re-encrypted all data
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validationResult = completeSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { itemsRotated } = validationResult.data

    const user = await db.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Find the in-progress rotation log
    const rotationLog = await db.keyRotationLog.findFirst({
      where: {
        userId: user.id,
        status: 'in_progress',
      },
      orderBy: { startedAt: 'desc' },
    })

    if (!rotationLog) {
      return NextResponse.json(
        { error: 'No rotation in progress' },
        { status: 400 }
      )
    }

    // Mark rotation as complete
    await db.$transaction(async (tx) => {
      // Update rotation log
      await tx.keyRotationLog.update({
        where: { id: rotationLog.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          itemsRotated,
        },
      })

      // Delete old (inactive) keys to clean up
      await tx.userEncryptionKey.deleteMany({
        where: {
          userId: user.id,
          isActive: false,
        },
      })
    })

    console.log(`[Key Rotation] Completed rotation for user ${user.id}: ${itemsRotated} items rotated`)

    return NextResponse.json({
      success: true,
      rotationLogId: rotationLog.id,
      itemsRotated,
    })
  } catch (error) {
    console.error('[Key Rotation] Error completing rotation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
