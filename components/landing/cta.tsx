'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function CTA() {
  return (
    <div className="relative py-24 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600">
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
          Ready to get started?
        </h2>
        <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
          Join the decentralized future of communication. Start connecting securely today.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/sign-up">
            <Button
              variant="secondary"
              className="w-full sm:w-auto px-8 py-4 text-lg font-semibold bg-white text-gray-900 hover:bg-gray-100 shadow-xl"
            >
              Create Free Account
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button
              variant="secondary"
              className="w-full sm:w-auto px-8 py-4 text-lg font-semibold bg-white/10 text-white border-2 border-white hover:bg-white/20 backdrop-blur-sm"
            >
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

