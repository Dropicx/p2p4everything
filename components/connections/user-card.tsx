'use client'

import { Button } from '@/components/ui/button'

interface User {
  id: string
  email: string | null
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  hasPublicKey: boolean
}

interface UserCardProps {
  user: User
  onSendRequest: (userId: string) => void
  isRequestPending?: boolean
}

export function UserCard({ user, onSendRequest, isRequestPending }: UserCardProps) {
  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-start gap-4">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName || 'User'}
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-2xl text-gray-600 dark:text-gray-400">
              {(user.displayName || user.username || user.email || 'U')[0].toUpperCase()}
            </span>
          </div>
        )}
        
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {user.displayName || user.username || user.email || 'Unknown User'}
          </h3>
          
          {user.username && user.username !== user.displayName && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              @{user.username}
            </p>
          )}
          
          {user.email && (
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {user.email}
            </p>
          )}
          
          {user.bio && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {user.bio}
            </p>
          )}
          
          <div className="mt-3 flex items-center gap-2">
            {user.hasPublicKey && (
              <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                End-to-End Encrypted
              </span>
            )}
          </div>
        </div>
        
        <Button
          variant="primary"
          onClick={() => onSendRequest(user.id)}
          disabled={isRequestPending}
        >
          {isRequestPending ? 'Sending...' : 'Send Connection Request'}
        </Button>
      </div>
    </div>
  )
}

