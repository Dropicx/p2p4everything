import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET to your environment variables')
  }

  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: 'Error occurred -- no svix headers' },
      { status: 400 }
    )
  }

  // Get the body
  const payload = await request.json()
  const body = JSON.stringify(payload)

  // Create a new Svix instance with your secret
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return NextResponse.json(
      { error: 'Error occurred' },
      { status: 400 }
    )
  }

  // Handle the webhook
  const eventType = evt.type

  if (eventType === 'user.created' || eventType === 'user.updated') {
    const { id, email_addresses, username, phone_numbers, first_name, last_name, image_url } = evt.data

    try {
      const userData = {
        clerkUserId: id,
        email: email_addresses?.[0]?.email_address,
        username: username,
        phone: phone_numbers?.[0]?.phone_number,
        displayName: first_name || last_name ? `${first_name || ''} ${last_name || ''}`.trim() : undefined,
        avatarUrl: image_url,
      }

      if (eventType === 'user.created') {
        await db.user.create({
          data: userData,
        })
      } else {
        await db.user.upsert({
          where: { clerkUserId: id },
          create: userData,
          update: {
            email: userData.email,
            username: userData.username,
            phone: userData.phone,
            displayName: userData.displayName,
            avatarUrl: userData.avatarUrl,
            updatedAt: new Date(),
          },
        })
      }
    } catch (error) {
      console.error('Error syncing user from webhook:', error)
      return NextResponse.json(
        { error: 'Error syncing user' },
        { status: 500 }
      )
    }
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data

    try {
      await db.user.delete({
        where: { clerkUserId: id },
      })
    } catch (error) {
      console.error('Error deleting user from webhook:', error)
      return NextResponse.json(
        { error: 'Error deleting user' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true })
}

