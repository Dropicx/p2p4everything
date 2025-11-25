'use client'

import { useState, useEffect } from 'react'
import { UserSearch } from '@/components/connections/user-search'
import { UserCard } from '@/components/connections/user-card'
import { ConnectionList } from '@/components/connections/connection-list'
import { Card } from '@/components/ui/card'
import { useWebRTC } from '@/hooks/useWebRTC'

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
  const { client, isReady } = useWebRTC()

  useEffect(() => {
    loadConnections()
  }, [])

  // Listen for real-time connection updates via WebSocket
  useEffect(() => {
    if (!isReady || !client) return

    console.log('[Connections] Setting up real-time connection listeners')

    const unsubscribeRequest = client.signaling?.onMessage('connection-request', (message) => {
      if (message.type === 'connection-request') {
        console.log('[Connections] Received connection request notification')
        loadConnections() // Reload to show new request
      }
    })

    const unsubscribeAccepted = client.signaling?.onMessage('connection-accepted', (message) => {
      if (message.type === 'connection-accepted') {
        console.log('[Connections] Connection accepted notification')
        loadConnections() // Reload to update status
      }
    })

    const unsubscribeRejected = client.signaling?.onMessage('connection-rejected', (message) => {
      if (message.type === 'connection-rejected') {
        console.log('[Connections] Connection rejected notification')
        loadConnections() // Reload to remove/update
      }
    })

    const unsubscribeRemoved = client.signaling?.onMessage('connection-removed', (message) => {
      if (message.type === 'connection-removed') {
        console.log('[Connections] Connection removed notification')
        loadConnections() // Reload to remove connection
      }
    })

    return () => {
      console.log('[Connections] Cleaning up real-time connection listeners')
      unsubscribeRequest?.()
      unsubscribeAccepted?.()
      unsubscribeRejected?.()
      unsubscribeRemoved?.()
    }
  }, [isReady, client])

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

      const newConnection = await response.json()

      // Format the connection to match the expected structure
      const formattedConnection = {
        id: newConnection.id,
        status: newConnection.status,
        otherUser: newConnection.userB, // We're always userA (initiator), so other user is userB
        isInitiator: true,
        createdAt: newConnection.createdAt,
        updatedAt: newConnection.updatedAt,
      }

      // Optimistic update: add to list immediately
      setConnections(prev => [formattedConnection, ...prev])
      setSelectedUser(null)

      console.log('[Connections] Connection request sent successfully')
    } catch (error) {
      console.error('Error sending connection request:', error)
      alert(error instanceof Error ? error.message : 'Failed to send connection request')
    } finally {
      setIsSendingRequest(false)
    }
  }

  const handleAccept = async (connectionId: string) => {
    // Optimistic update
    setConnections(prev =>
      prev.map(conn =>
        conn.id === connectionId
          ? { ...conn, status: 'accepted' as const }
          : conn
      )
    )

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

      console.log('[Connections] Connection accepted successfully')
    } catch (error) {
      console.error('Error accepting connection:', error)
      alert('Failed to accept connection')
      // Revert on error
      loadConnections()
    }
  }

  const handleDecline = async (connectionId: string) => {
    // Optimistic update: remove immediately
    setConnections(prev => prev.filter(conn => conn.id !== connectionId))

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to decline connection')
      }

      console.log('[Connections] Connection declined successfully')
    } catch (error) {
      console.error('Error declining connection:', error)
      alert('Failed to decline connection')
      // Revert on error
      loadConnections()
    }
  }

  const handleBlock = async (connectionId: string) => {
    if (!confirm('Are you sure you want to block this user?')) {
      return
    }

    // Optimistic update
    setConnections(prev =>
      prev.map(conn =>
        conn.id === connectionId
          ? { ...conn, status: 'blocked' as const }
          : conn
      )
    )

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

      console.log('[Connections] Connection blocked successfully')
    } catch (error) {
      console.error('Error blocking connection:', error)
      alert('Failed to block connection')
      // Revert on error
      loadConnections()
    }
  }

  const handleRemove = async (connectionId: string) => {
    if (!confirm('Are you sure you want to remove this connection?')) {
      return
    }

    // Optimistic update: remove immediately
    setConnections(prev => prev.filter(conn => conn.id !== connectionId))

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to remove connection')
      }

      console.log('[Connections] Connection removed successfully')
    } catch (error) {
      console.error('Error removing connection:', error)
      alert('Failed to remove connection')
      // Revert on error
      loadConnections()
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

