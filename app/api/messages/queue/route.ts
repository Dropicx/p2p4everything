import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * GET /api/messages/queue
 * Fetch all undelivered (queued) messages for the authenticated user
 * Marks messages as delivered after successful fetch
 */
export async function GET() {
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

    // Fetch all undelivered messages for this user
    const queuedMessages = await db.messageMetadata.findMany({
      where: {
        receiverId: user.id,
        delivered: false,
        encryptedContent: {
          not: null, // Only messages with content
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        timestamp: 'asc', // Deliver in chronological order
      },
    })

    console.log(
      `[Queue API] Found ${queuedMessages.length} queued messages for user ${user.id}`
    )

    // Mark all fetched messages as delivered
    if (queuedMessages.length > 0) {
      const messageIds = queuedMessages.map((m) => m.id)

      await db.messageMetadata.updateMany({
        where: {
          id: {
            in: messageIds,
          },
        },
        data: {
          delivered: true,
        },
      })

      console.log(`[Queue API] Marked ${messageIds.length} messages as delivered`)
    }

    // Return messages with encrypted content
    const messages = queuedMessages.map((msg) => ({
      id: msg.id,
      messageId: msg.id,
      senderId: msg.senderId,
      encryptedContent: msg.encryptedContent,
      timestamp: msg.timestamp.getTime(),
      senderName:
        msg.sender.displayName || msg.sender.username || 'Unknown',
    }))

    return NextResponse.json({ messages }, { status: 200 })
  } catch (error) {
    console.error('[Queue API] Error fetching queued messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
