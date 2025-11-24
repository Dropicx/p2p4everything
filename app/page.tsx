import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { CTA } from '@/components/landing/cta'

export default async function Home() {
  const { userId } = await auth()

  // If user is authenticated, redirect to dashboard
  if (userId) {
    redirect('/dashboard')
  }

  // Show landing page for unauthenticated users
  return (
    <div className="min-h-screen">
      <Hero />
      <Features />
      <CTA />
    </div>
  )
}
