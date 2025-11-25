'use client'

import { useEffect, useRef } from 'react'
import { MessageBubble } from './message-bubble'

interface Message {
  id: string
  message: string
  senderId: string
  receiverId: string
  timestamp: Date
  senderName?: string
}

interface MessageListProps {
  messages: Message[]
  currentUserId: string
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Also scroll to bottom on initial load
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [])

  if (messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">
          No messages yet. Start the conversation!
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto p-4"
    >
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message.message}
          isOwn={message.senderId === currentUserId}
          timestamp={message.timestamp}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}

