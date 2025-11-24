'use client'

import { Button } from '@/components/ui/button'

interface Connection {
  id: string
  status: 'pending' | 'accepted' | 'blocked'
  otherUser: {
    id: string
    displayName: string | null
    username: string | null
    email: string | null
    avatarUrl: string | null
  }
  isInitiator: boolean
  createdAt: string
  updatedAt: string
}

interface ConnectionListProps {
  connections: Connection[]
  onAccept?: (connectionId: string) => void
  onDecline?: (connectionId: string) => void
  onBlock?: (connectionId: string) => void
  onRemove?: (connectionId: string) => void
}

export function ConnectionList({
  connections,
  onAccept,
  onDecline,
  onBlock,
  onRemove,
}: ConnectionListProps) {
  if (connections.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">
          No connections yet. Search for users to connect with them.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {connections.map((connection) => (
        <div
          key={connection.id}
          className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
        >
          <div className="flex items-center gap-4">
            {connection.otherUser.avatarUrl ? (
              <img
                src={connection.otherUser.avatarUrl}
                alt={connection.otherUser.displayName || 'User'}
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                <span className="text-gray-600 dark:text-gray-400">
                  {(connection.otherUser.displayName ||
                    connection.otherUser.username ||
                    connection.otherUser.email ||
                    'U')[0].toUpperCase()}
                </span>
              </div>
            )}

            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-white">
                {connection.otherUser.displayName ||
                  connection.otherUser.username ||
                  connection.otherUser.email ||
                  'Unknown User'}
              </h3>
              {connection.otherUser.username && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  @{connection.otherUser.username}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    connection.status === 'accepted'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : connection.status === 'pending'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  {connection.status.charAt(0).toUpperCase() +
                    connection.status.slice(1)}
                </span>
                {connection.isInitiator && connection.status === 'pending' && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    (Request sent)
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {connection.status === 'pending' && !connection.isInitiator && (
                <>
                  {onAccept && (
                    <Button
                      variant="primary"
                      onClick={() => onAccept(connection.id)}
                    >
                      Accept
                    </Button>
                  )}
                  {onDecline && (
                    <Button
                      variant="secondary"
                      onClick={() => onDecline(connection.id)}
                    >
                      Decline
                    </Button>
                  )}
                </>
              )}
              {connection.status === 'accepted' && onBlock && (
                <Button
                  variant="danger"
                  onClick={() => onBlock(connection.id)}
                >
                  Block
                </Button>
              )}
              {onRemove && (
                <Button
                  variant="secondary"
                  onClick={() => onRemove(connection.id)}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

