'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { Card } from '@/components/ui/card'

interface Contact {
  id: string
  displayName: string | null
  username: string | null
  email: string
  imageUrl: string | null
  hasUnread?: boolean
  lastMessageTime?: number
}

export function QuickContacts() {
  const { isLoaded, isSignedIn } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Wait for auth to be ready before fetching
    if (!isLoaded || !isSignedIn) {
      return
    }

    async function fetchRecentContacts() {
      try {
        // Fetch connections
        const connectionsResponse = await fetch('/api/connections')
        if (!connectionsResponse.ok) {
          throw new Error('Failed to fetch connections')
        }

        const connectionsData = await connectionsResponse.json()
        const acceptedConnections = connectionsData.connections.filter(
          (c: any) => c.status === 'accepted'
        )

        // Get current user ID
        const userResponse = await fetch('/api/users/me')
        if (!userResponse.ok) {
          throw new Error('Failed to fetch user')
        }
        const currentUser = await userResponse.json()

        // Check for unread messages in IndexedDB
        const { getUnreadCounts } = await import('@/lib/crypto/message-storage')
        const unreadCounts = await getUnreadCounts()

        // Map connections to contacts with unread status
        const contactsWithUnread: Contact[] = acceptedConnections.map((conn: any) => {
          const otherUser = conn.otherUser
          const unreadCount = unreadCounts[otherUser.id] || 0

          return {
            id: otherUser.id,
            displayName: otherUser.displayName,
            username: otherUser.username,
            email: otherUser.email,
            imageUrl: otherUser.imageUrl,
            hasUnread: unreadCount > 0,
            lastMessageTime: conn.updatedAt ? new Date(conn.updatedAt).getTime() : 0,
          }
        })

        // Sort by unread first, then by most recent
        contactsWithUnread.sort((a, b) => {
          if (a.hasUnread && !b.hasUnread) return -1
          if (!a.hasUnread && b.hasUnread) return 1
          return (b.lastMessageTime || 0) - (a.lastMessageTime || 0)
        })

        // Take top 2
        setContacts(contactsWithUnread.slice(0, 2))
      } catch (error) {
        console.error('[QuickContacts] Error fetching contacts:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecentContacts()
  }, [isLoaded, isSignedIn])

  const getInitials = (contact: Contact) => {
    const name = contact.displayName || contact.username || contact.email
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getDisplayName = (contact: Contact) => {
    return contact.displayName || contact.username || contact.email.split('@')[0]
  }

  if (isLoading) {
    return (
      <Card title="Quick Messages">
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24" />
                <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-16 mt-1" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (contacts.length === 0) {
    return (
      <Card title="Quick Messages">
        <div className="text-center py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No connections yet
          </p>
          <Link
            href="/dashboard/connections"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
          >
            Add a connection
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Quick Messages">
      <div className="space-y-2">
        {contacts.map((contact) => (
          <Link
            key={contact.id}
            href={`/dashboard/messages/${contact.id}`}
            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            {contact.imageUrl ? (
              <img
                src={contact.imageUrl}
                alt={getDisplayName(contact)}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium text-sm">
                {getInitials(contact)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {getDisplayName(contact)}
                </p>
                {contact.hasUnread && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {contact.hasUnread ? 'New messages' : 'Tap to chat'}
              </p>
            </div>
            <svg
              className="w-5 h-5 text-gray-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        ))}
        <Link
          href="/dashboard/messages"
          className="block text-center text-sm text-blue-600 dark:text-blue-400 hover:underline pt-2"
        >
          View all messages
        </Link>
      </div>
    </Card>
  )
}
