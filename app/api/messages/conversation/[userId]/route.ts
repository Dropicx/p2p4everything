import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await db.user.findUnique({
      where: { clerkUserId },
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const otherUserId = params.userId

    // Verify the other user exists
    const otherUser = await db.user.findUnique({
      where: { id: otherUserId },
    })

    if (!otherUser) {
      return NextResponse.json(
        { error: 'Other user not found' },
        { status: 404 }
      )
    }

    // Delete all messages in the conversation (both directions)
    const result = await db.messageMetadata.deleteMany({
      where: {
        OR: [
          {
            senderId: currentUser.id,
            receiverId: otherUserId,
          },
          {
            senderId: otherUserId,
            receiverId: currentUser.id,
          },
        ],
      },
    })

    console.log(
      `[Clear Conversation API] Deleted ${result.count} messages between ${currentUser.id} and ${otherUserId}`
    )

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `Deleted ${result.count} messages from server`,
    })
  } catch (error) {
    console.error('[Clear Conversation API] Error deleting messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
