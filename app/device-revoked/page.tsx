'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react'

export default function DeviceRevokedPage() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { signOut } = useClerk()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // If user is not signed in, redirect to sign-in page
  useEffect(() => {
    if (isSignedIn === false) {
      router.push('/sign-in')
    }
  }, [isSignedIn, router])

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    try {
      await signOut()
      router.push('/sign-in')
    } catch (error) {
      console.error('Error signing out:', error)
      setIsLoggingOut(false)
    }
  }

  const handleReauthenticate = () => {
    // Clear any remaining local data and redirect to dashboard
    // The encryption provider will detect no device and prompt for backup password
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Device Access Revoked</CardTitle>
          <CardDescription className="text-base">
            This device has been revoked and can no longer access your encrypted data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">What happened?</p>
            <p>
              An administrator or another device has revoked access for this device.
              This is a security measure to protect your data.
            </p>
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">What can you do?</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Re-authenticate this device using your backup password</li>
              <li>Sign out and use a different device</li>
              <li>Contact support if you believe this was a mistake</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <Button
              onClick={handleReauthenticate}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-authenticate This Device
            </Button>
            <Button
              variant="outline"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {isLoggingOut ? 'Signing out...' : 'Sign Out'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
