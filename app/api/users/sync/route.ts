import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const { userId } = await auth()
    const clerkUser = await currentUser()

    if (!userId || !clerkUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (existingUser) {
      // Update existing user
      const updatedUser = await db.user.update({
        where: { clerkUserId: userId },
        data: {
          email: clerkUser.emailAddresses[0]?.emailAddress,
          username: clerkUser.username,
          phone: clerkUser.phoneNumbers[0]?.phoneNumber,
          displayName: clerkUser.fullName || clerkUser.firstName || undefined,
          avatarUrl: clerkUser.imageUrl,
          updatedAt: new Date(),
        },
      })

      return NextResponse.json(updatedUser)
    }

    // Create new user
    const newUser = await db.user.create({
      data: {
        clerkUserId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress,
        username: clerkUser.username,
        phone: clerkUser.phoneNumbers[0]?.phoneNumber,
        displayName: clerkUser.fullName || clerkUser.firstName || undefined,
        avatarUrl: clerkUser.imageUrl,
      },
    })

    return NextResponse.json(newUser, { status: 201 })
  } catch (error) {
    console.error('Error syncing user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

