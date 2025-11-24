'use client'

import { useState } from 'react'
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

interface UserSearchProps {
  onUserSelect: (user: User) => void
}

export function UserSearch({ onUserSelect }: UserSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!query.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
      
      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email, username, or phone..."
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={isSearching || !query.trim()}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
      </form>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Found {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {results.map((user) => (
              <div
                key={user.id}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                onClick={() => onUserSelect(user)}
              >
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName || 'User'}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-gray-600 dark:text-gray-400">
                        {(user.displayName || user.username || user.email || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {user.displayName || user.username || user.email || 'Unknown User'}
                    </p>
                    {user.username && user.username !== user.displayName && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        @{user.username}
                      </p>
                    )}
                    {user.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {user.email}
                      </p>
                    )}
                  </div>
                  {user.hasPublicKey && (
                    <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                      Encrypted
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {query && results.length === 0 && !isSearching && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No users found
        </p>
      )}
    </div>
  )
}

