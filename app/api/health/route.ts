import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`
    
    return NextResponse.json({
      status: 'ok',
      service: 'p2p4everything-web',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        service: 'p2p4everything-web',
        error: 'Database connection failed',
      },
      { status: 503 }
    )
  }
}

