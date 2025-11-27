/**
 * Device Guard Utility
 * Checks if a device has been revoked and blocks access
 */

import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * Custom error for revoked devices
 */
export class DeviceRevokedError extends Error {
  constructor(message = 'Device has been revoked') {
    super(message)
    this.name = 'DeviceRevokedError'
  }
}

/**
 * Check if a device is active (not revoked)
 * Throws DeviceRevokedError if device has been revoked
 *
 * @param deviceId - The device ID to check
 * @throws DeviceRevokedError if device is revoked
 */
export async function requireActiveDevice(deviceId: string | null): Promise<void> {
  if (!deviceId) return // Device context not required for this request

  const device = await db.device.findUnique({
    where: { id: deviceId },
    select: { revokedAt: true, revocationReason: true },
  })

  if (!device) {
    // Device doesn't exist - this is a different error
    return
  }

  if (device.revokedAt) {
    throw new DeviceRevokedError(
      device.revocationReason
        ? `Device has been revoked: ${device.revocationReason}`
        : 'Device has been revoked'
    )
  }
}

/**
 * Check if a device is revoked (returns boolean, doesn't throw)
 *
 * @param deviceId - The device ID to check
 * @returns true if device is revoked, false otherwise
 */
export async function isDeviceRevoked(deviceId: string): Promise<boolean> {
  const device = await db.device.findUnique({
    where: { id: deviceId },
    select: { revokedAt: true },
  })

  return device?.revokedAt != null
}

/**
 * Create a JSON response for revoked device error
 */
export function revokedDeviceResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Device has been revoked' },
    { status: 403 }
  )
}

/**
 * Get active (non-revoked) devices for a user
 *
 * @param userId - The user's database ID
 * @returns Array of active devices
 */
export async function getActiveDevices(userId: string) {
  return db.device.findMany({
    where: {
      userId,
      revokedAt: null, // Only active devices
    },
    orderBy: { lastSeen: 'desc' },
  })
}

/**
 * Middleware helper to check device status from request headers
 *
 * @param request - The incoming request
 * @returns The device ID if valid and not revoked, or null if no device ID provided
 * @throws DeviceRevokedError if device is revoked
 */
export async function getAndValidateDeviceId(request: Request): Promise<string | null> {
  const deviceId = request.headers.get('x-device-id')

  if (deviceId) {
    await requireActiveDevice(deviceId)
  }

  return deviceId
}
