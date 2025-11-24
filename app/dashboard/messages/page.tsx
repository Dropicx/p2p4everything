'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'

interface Conversation {
  userId: string
  userName: string
  userAvatar: string | null
  lastMessage: string | null
  lastMessageTime: Date | null
  unreadCount: number
}

export default function MessagesPage() {
  const { userId: clerkUserId } = useAuth()
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!clerkUserId) return

    async function loadConversations() {
      try {
        // Get all accepted connections
        const connectionsResponse = await fetch('/api/connections')
        if (!connectionsResponse.ok) return

        const connectionsData = await connectionsResponse.json()
        const acceptedConnections = connectionsData.connections.filter(
          (c: any) => c.status === 'accepted'
        )

        // Get messages for each connection
        const conversationsData = await Promise.all(
          acceptedConnections.map(async (conn: any) => {
            const messagesResponse = await fetch(
              `/api/messages?with=${conn.otherUser.id}&limit=1`
            )
            const messagesData = messagesResponse.ok
              ? await messagesResponse.json()
              : { messages: [] }

            const lastMessage = messagesData.messages[0] || null

            return {
              userId: conn.otherUser.id,
              userName:
                conn.otherUser.displayName ||
                conn.otherUser.username ||
                conn.otherUser.email ||
                'Unknown User',
              userAvatar: conn.otherUser.avatarUrl,
              lastMessage: lastMessage
                ? `Message (${lastMessage.messageType})`
                : null,
              lastMessageTime: lastMessage
                ? new Date(lastMessage.timestamp)
                : null,
              unreadCount: 0, // TODO: Implement unread count
            }
          })
        )

        // Sort by last message time
        conversationsData.sort((a, b) => {
          if (!a.lastMessageTime) return 1
          if (!b.lastMessageTime) return -1
          return b.lastMessageTime.getTime() - a.lastMessageTime.getTime()
        })

        setConversations(conversationsData)
      } catch (error) {
        console.error('Error loading conversations:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConversations()
  }, [clerkUserId])

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Messages
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 sm:mb-6 lg:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
          Messages
        </h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Your conversations
        </p>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <div className="text-center py-8 sm:py-12">
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              No conversations yet. Connect with users to start messaging!
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.userId}
                onClick={() =>
                  router.push(`/dashboard/messages/${conversation.userId}`)
                }
                className="p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  {conversation.userAvatar ? (
                    <img
                      src={conversation.userAvatar}
                      alt={conversation.userName}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                        {conversation.userName[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                      {conversation.userName}
                    </h3>
                    {conversation.lastMessage && (
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                        {conversation.lastMessage}
                      </p>
                    )}
                    {conversation.lastMessageTime && (
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {conversation.lastMessageTime.toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {conversation.unreadCount > 0 && (
                    <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
                      {conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

