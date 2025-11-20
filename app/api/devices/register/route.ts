import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const registerDeviceSchema = z.object({
  deviceName: z.string().min(1).max(100),
  deviceType: z.enum(['web', 'mobile', 'desktop']),
  publicKey: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = registerDeviceSchema.parse(body)

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const device = await db.device.create({
      data: {
        userId: user.id,
        deviceName: validatedData.deviceName,
        deviceType: validatedData.deviceType,
        publicKey: validatedData.publicKey,
      },
    })

    return NextResponse.json(device, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error registering device:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

