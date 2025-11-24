'use client'

import { Button } from '@/components/ui/button'

interface ConnectionRequestProps {
  connectionId: string
  otherUser: {
    id: string
    displayName: string | null
    username: string | null
    email: string | null
    avatarUrl: string | null
  }
  isInitiator: boolean
  onAccept: (connectionId: string) => void
  onDecline: (connectionId: string) => void
}

export function ConnectionRequest({
  connectionId,
  otherUser,
  isInitiator,
  onAccept,
  onDecline,
}: ConnectionRequestProps) {
  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center gap-4">
        {otherUser.avatarUrl ? (
          <img
            src={otherUser.avatarUrl}
            alt={otherUser.displayName || 'User'}
            className="w-12 h-12 rounded-full"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-gray-600 dark:text-gray-400">
              {(otherUser.displayName ||
                otherUser.username ||
                otherUser.email ||
                'U')[0].toUpperCase()}
            </span>
          </div>
        )}

        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white">
            {otherUser.displayName ||
              otherUser.username ||
              otherUser.email ||
              'Unknown User'}
          </h3>
          {otherUser.username && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              @{otherUser.username}
            </p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            {isInitiator
              ? 'You sent a connection request'
              : 'wants to connect with you'}
          </p>
        </div>

        {!isInitiator && (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => onAccept(connectionId)}>
              Accept
            </Button>
            <Button variant="secondary" onClick={() => onDecline(connectionId)}>
              Decline
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

