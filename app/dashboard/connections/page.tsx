'use client'

import { useState, useEffect } from 'react'
import { UserSearch } from '@/components/connections/user-search'
import { UserCard } from '@/components/connections/user-card'
import { ConnectionList } from '@/components/connections/connection-list'
import { Card } from '@/components/ui/card'

interface User {
  id: string
  email: string | null
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  hasPublicKey: boolean
}

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

export default function ConnectionsPage() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isSendingRequest, setIsSendingRequest] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'accepted'>('all')

  useEffect(() => {
    loadConnections()
  }, [])

  const loadConnections = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/connections')
      if (response.ok) {
        const data = await response.json()
        setConnections(data.connections || [])
      }
    } catch (error) {
      console.error('Error loading connections:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
  }

  const handleSendRequest = async (userId: string) => {
    setIsSendingRequest(true)
    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: userId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send connection request')
      }

      alert('Connection request sent!')
      setSelectedUser(null)
      loadConnections()
    } catch (error) {
      console.error('Error sending connection request:', error)
      alert(error instanceof Error ? error.message : 'Failed to send connection request')
    } finally {
      setIsSendingRequest(false)
    }
  }

  const handleAccept = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'accepted' }),
      })

      if (!response.ok) {
        throw new Error('Failed to accept connection')
      }

      loadConnections()
    } catch (error) {
      console.error('Error accepting connection:', error)
      alert('Failed to accept connection')
    }
  }

  const handleDecline = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to decline connection')
      }

      loadConnections()
    } catch (error) {
      console.error('Error declining connection:', error)
      alert('Failed to decline connection')
    }
  }

  const handleBlock = async (connectionId: string) => {
    if (!confirm('Are you sure you want to block this user?')) {
      return
    }

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'blocked' }),
      })

      if (!response.ok) {
        throw new Error('Failed to block connection')
      }

      loadConnections()
    } catch (error) {
      console.error('Error blocking connection:', error)
      alert('Failed to block connection')
    }
  }

  const handleRemove = async (connectionId: string) => {
    if (!confirm('Are you sure you want to remove this connection?')) {
      return
    }

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to remove connection')
      }

      loadConnections()
    } catch (error) {
      console.error('Error removing connection:', error)
      alert('Failed to remove connection')
    }
  }

  const filteredConnections = connections.filter((conn) => {
    if (activeTab === 'pending') return conn.status === 'pending'
    if (activeTab === 'accepted') return conn.status === 'accepted'
    return true
  })

  const pendingCount = connections.filter((c) => c.status === 'pending' && !c.isInitiator).length

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Connections
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Find and connect with other users
        </p>
      </div>

      <div className="space-y-6">
        <Card title="Search Users">
          <UserSearch onUserSelect={handleUserSelect} />
        </Card>

        {selectedUser && (
          <Card title="Send Connection Request">
            <UserCard
              user={selectedUser}
              onSendRequest={handleSendRequest}
              isRequestPending={isSendingRequest}
            />
          </Card>
        )}

        <Card title="My Connections">
          <div className="mb-4">
            <div className="flex space-x-1 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'all'
                    ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 text-sm font-medium relative ${
                  activeTab === 'pending'
                    ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Pending
                {pendingCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('accepted')}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'accepted'
                    ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Accepted
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          ) : (
            <ConnectionList
              connections={filteredConnections}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onBlock={handleBlock}
              onRemove={handleRemove}
            />
          )}
        </Card>
      </div>
    </div>
  )
}

