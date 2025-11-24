import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(50).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
})

export async function GET(request: Request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const validated = searchSchema.parse({
      query,
      limit,
      offset,
    })

    // Get current user to exclude from results
    const currentUser = await db.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Search by email, username, or phone number
    const searchTerm = validated.query.toLowerCase().trim()

    const users = await db.user.findMany({
      where: {
        AND: [
          {
            id: {
              not: currentUser.id, // Exclude current user
            },
          },
          {
            OR: [
              {
                email: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                username: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                displayName: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
        devices: {
          select: {
            id: true,
            publicKey: true,
          },
          take: 1, // Get one device's public key for fingerprint
        },
      },
      take: validated.limit,
      skip: validated.offset,
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Format response with public key fingerprints
    const formattedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt,
      hasPublicKey: user.devices.length > 0 && !!user.devices[0].publicKey,
    }))

    return NextResponse.json({
      users: formattedUsers,
      total: formattedUsers.length,
      limit: validated.limit,
      offset: validated.offset,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid search parameters', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error searching users:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

