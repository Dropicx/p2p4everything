import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendWebSocketNotification } from '@/lib/notifications'

const createConnectionSchema = z.object({
  targetUserId: z.string().uuid(),
})

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

    // Get all connections where user is either userA or userB
    const connections = await db.connection.findMany({
      where: {
        OR: [
          { userAId: user.id },
          { userBId: user.id },
        ],
      },
      include: {
        userA: {
          select: {
            id: true,
            displayName: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
        userB: {
          select: {
            id: true,
            displayName: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    // Format connections to always show the other user
    const formattedConnections = connections.map((conn) => {
      const otherUser = conn.userAId === user.id ? conn.userB : conn.userA
      const isInitiator = conn.userAId === user.id

      return {
        id: conn.id,
        status: conn.status,
        otherUser,
        isInitiator,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      }
    })

    return NextResponse.json({
      connections: formattedConnections,
      total: formattedConnections.length,
    })
  } catch (error) {
    console.error('Error fetching connections:', error)
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

    const body = await request.json()
    const validatedData = createConnectionSchema.parse(body)

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if target user exists
    const targetUser = await db.user.findUnique({
      where: { id: validatedData.targetUserId },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      )
    }

    if (targetUser.id === user.id) {
      return NextResponse.json(
        { error: 'Cannot connect to yourself' },
        { status: 400 }
      )
    }

    // Check if connection already exists
    const existingConnection = await db.connection.findFirst({
      where: {
        OR: [
          {
            userAId: user.id,
            userBId: targetUser.id,
          },
          {
            userAId: targetUser.id,
            userBId: user.id,
          },
        ],
      },
    })

    if (existingConnection) {
      return NextResponse.json(
        { error: 'Connection already exists', connection: existingConnection },
        { status: 409 }
      )
    }

    // Create connection request (userA is always the initiator)
    const connection = await db.connection.create({
      data: {
        userAId: user.id,
        userBId: targetUser.id,
        status: 'pending',
      },
      include: {
        userB: {
          select: {
            id: true,
            displayName: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    })

    // Send real-time notification to target user
    await sendWebSocketNotification(
      targetUser.id,
      'connection-request',
      {
        fromUserId: user.id,
        connectionId: connection.id,
        timestamp: Date.now(),
      }
    )

    return NextResponse.json(connection, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating connection:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

