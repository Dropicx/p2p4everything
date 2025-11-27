import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/clerk(.*)',
  '/api/health(.*)',
])

/**
 * Content Security Policy directives
 * Protects against XSS attacks that could steal encryption keys from IndexedDB
 */
const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    // Clerk SDK scripts
    'https://*.clerk.accounts.dev',
    'https://*.clerk.com',
    // Next.js requires unsafe-eval in development for HMR
    ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
  ],
  'style-src': ["'self'", "'unsafe-inline'"], // Tailwind CSS uses inline styles
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.clerk.com', 'https://*.gravatar.com'],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    // Clerk API endpoints
    'https://*.clerk.accounts.dev',
    'https://*.clerk.com',
    // WebSocket signaling server
    'wss://*',
    // Development WebSocket
    ...(process.env.NODE_ENV === 'development' ? ['ws://localhost:*'] : []),
  ],
  'frame-src': ["'self'", 'https://*.clerk.accounts.dev', 'https://*.clerk.com'],
  'frame-ancestors': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
}

/**
 * Build CSP header string from directives
 */
function buildCSP(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ')
}

/**
 * Security headers to protect against common web vulnerabilities
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': buildCSP(),
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

/**
 * Add security headers to a response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

export default clerkMiddleware(async (auth, request) => {
  // Allow API routes to handle their own authentication
  // This prevents redirecting API calls to sign-in page (which returns HTML)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Let API routes handle authentication themselves
    // Add security headers to API responses
    return addSecurityHeaders(NextResponse.next())
  }

  if (!isPublicRoute(request)) {
    const { userId } = await auth()
    if (!userId) {
      const signInUrl = new URL('/sign-in', request.url)
      signInUrl.searchParams.set('redirect_url', request.url)
      return addSecurityHeaders(NextResponse.redirect(signInUrl))
    }
  }

  // Add security headers to all responses
  return addSecurityHeaders(NextResponse.next())
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}

