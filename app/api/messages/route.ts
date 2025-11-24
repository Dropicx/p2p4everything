import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const createMessageSchema = z.object({
  receiverId: z.string().uuid(),
  messageType: z.enum(['text', 'file', 'call']),
  encryptedContentHash: z.string().optional(),
})

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const withUserId = searchParams.get('with')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let whereClause: any = {
      OR: [
        { senderId: user.id },
        { receiverId: user.id },
      ],
    }

    // Filter by specific user if provided
    if (withUserId) {
      whereClause = {
        AND: [
          {
            OR: [
              { senderId: user.id, receiverId: withUserId },
              { senderId: withUserId, receiverId: user.id },
            ],
          },
        ],
      }
    }

    const messages = await db.messageMetadata.findMany({
      where: whereClause,
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
    })

    return NextResponse.json({
      messages: messages.reverse(), // Reverse to show oldest first
      total: messages.length,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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

    const body = await request.json()
    const validatedData = createMessageSchema.parse(body)

    // Verify receiver exists
    const receiver = await db.user.findUnique({
      where: { id: validatedData.receiverId },
    })

    if (!receiver) {
      return NextResponse.json(
        { error: 'Receiver not found' },
        { status: 404 }
      )
    }

    // Verify connection exists and is accepted
    const connection = await db.connection.findFirst({
      where: {
        OR: [
          {
            userAId: user.id,
            userBId: receiver.id,
          },
          {
            userAId: receiver.id,
            userBId: user.id,
          },
        ],
        status: 'accepted',
      },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'No accepted connection with this user' },
        { status: 403 }
      )
    }

    // Create message metadata
    const message = await db.messageMetadata.create({
      data: {
        senderId: user.id,
        receiverId: receiver.id,
        messageType: validatedData.messageType,
        encryptedContentHash: validatedData.encryptedContentHash,
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
        receiver: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

