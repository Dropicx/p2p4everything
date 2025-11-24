import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateConnectionSchema = z.object({
  status: z.enum(['pending', 'accepted', 'blocked']),
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

    const body = await request.json()
    const validatedData = updateConnectionSchema.parse(body)

    // Find connection
    const connection = await db.connection.findUnique({
      where: { id: params.id },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      )
    }

    // Verify user is part of this connection
    if (connection.userAId !== user.id && connection.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only the recipient (userB) can accept/decline pending requests
    if (
      connection.status === 'pending' &&
      validatedData.status !== 'pending' &&
      connection.userBId !== user.id
    ) {
      return NextResponse.json(
        { error: 'Only the recipient can accept or decline connection requests' },
        { status: 403 }
      )
    }

    // Update connection
    const updatedConnection = await db.connection.update({
      where: { id: params.id },
      data: {
        status: validatedData.status,
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
    })

    return NextResponse.json(updatedConnection)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating connection:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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

    // Find connection
    const connection = await db.connection.findUnique({
      where: { id: params.id },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      )
    }

    // Verify user is part of this connection
    if (connection.userAId !== user.id && connection.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete connection
    await db.connection.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: 'Connection deleted successfully' })
  } catch (error) {
    console.error('Error deleting connection:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

