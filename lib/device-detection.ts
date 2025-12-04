/**
 * Device Detection Utility
 *
 * Uses User-Agent Client Hints API (when available) for accurate device detection,
 * with fallback to User-Agent string parsing for browsers that don't support it.
 */

export interface DeviceInfo {
  browser: string
  device: string
  displayName: string // "Browser on Device" format
  isMobile: boolean
}

interface UADataBrand {
  brand: string
  version: string
}

interface UADataValues {
  brands?: UADataBrand[]
  mobile?: boolean
  platform?: string
  model?: string
  platformVersion?: string
  fullVersionList?: UADataBrand[]
}

// Extend Navigator interface for TypeScript
declare global {
  interface Navigator {
    userAgentData?: {
      brands: UADataBrand[]
      mobile: boolean
      platform: string
      getHighEntropyValues(hints: string[]): Promise<UADataValues>
    }
  }
}

/**
 * Extract browser name from Client Hints brands array
 */
function extractBrowserFromBrands(brands: UADataBrand[]): string {
  // Filter out placeholder brands (e.g., "Not A;Brand", "Not/A)Brand")
  const realBrands = brands.filter(
    (b) =>
      !b.brand.startsWith('Not') &&
      !b.brand.includes(';') &&
      !b.brand.includes(')')
  )

  // Priority list: specific browsers first, then generic
  const browserPriority = ['Vivaldi', 'Brave', 'Opera', 'Edge', 'Chrome', 'Chromium']

  for (const preferred of browserPriority) {
    const found = realBrands.find((b) =>
      b.brand.toLowerCase().includes(preferred.toLowerCase())
    )
    if (found) {
      return found.brand
    }
  }

  return realBrands[0]?.brand || 'Browser'
}

/**
 * Clean up device model name for display
 */
function cleanDeviceModel(model: string): string {
  let cleaned = model.trim()

  // Samsung models: SM-XXXX -> keep as is (recognizable)
  if (cleaned.startsWith('SM-')) {
    return `Samsung ${cleaned}`
  }

  // Pixel models are already readable
  if (cleaned.toLowerCase().includes('pixel')) {
    return cleaned
  }

  return cleaned
}

/**
 * Extract device name from Client Hints data
 */
function extractDeviceName(uaData: UADataValues): string {
  const platform = uaData.platform || 'Unknown'
  const model = uaData.model

  // Android with model info
  if (platform === 'Android' && model && model.trim() !== '') {
    return cleanDeviceModel(model)
  }

  // Android without model
  if (platform === 'Android') {
    return 'Android Device'
  }

  // Desktop platforms
  if (platform === 'Windows') {
    return 'Windows PC'
  }

  if (platform === 'macOS') {
    return 'Mac'
  }

  if (platform === 'Linux') {
    return 'Linux PC'
  }

  if (platform === 'Chrome OS') {
    return 'Chromebook'
  }

  return platform
}

/**
 * Get device info using Client Hints API (Chromium browsers)
 */
async function getDeviceInfoFromClientHints(): Promise<DeviceInfo | null> {
  if (!navigator.userAgentData) {
    return null
  }

  try {
    const uaData = await navigator.userAgentData.getHighEntropyValues([
      'model',
      'platform',
      'platformVersion',
      'fullVersionList',
    ])

    const browser = extractBrowserFromBrands(
      uaData.fullVersionList || navigator.userAgentData.brands
    )
    const device = extractDeviceName(uaData)
    const isMobile = navigator.userAgentData.mobile

    return {
      browser,
      device,
      displayName: `${browser} on ${device}`,
      isMobile,
    }
  } catch (error) {
    console.warn('[Device Detection] Client Hints failed:', error)
    return null
  }
}

/**
 * Detect browser from User-Agent string
 */
function detectBrowserFromUA(ua: string): string {
  // Order matters - check specific browsers before generic ones

  // Vivaldi (must check before Chrome as it includes Chrome in UA)
  if (/Vivaldi\/[\d.]+/.test(ua)) {
    return 'Vivaldi'
  }

  // Opera (must check before Chrome)
  if (/OPR\/[\d.]+/.test(ua) || /Opera\/[\d.]+/.test(ua)) {
    return 'Opera'
  }

  // Edge (Chromium-based, must check before Chrome)
  if (/Edg\/[\d.]+/.test(ua)) {
    return 'Edge'
  }

  // Firefox
  if (/Firefox\/[\d.]+/.test(ua)) {
    return 'Firefox'
  }

  // Safari (must check before Chrome, as Chrome has Safari in UA)
  if (/Safari\/[\d.]+/.test(ua) && !/Chrome\/[\d.]+/.test(ua)) {
    return 'Safari'
  }

  // Chrome (check last among Chromium browsers)
  if (/Chrome\/[\d.]+/.test(ua)) {
    return 'Chrome'
  }

  return 'Browser'
}

/**
 * Detect device from User-Agent string
 */
function detectDeviceFromUA(ua: string): { device: string; isMobile: boolean } {
  // iOS devices
  if (/iPhone/.test(ua)) {
    return { device: 'iPhone', isMobile: true }
  }

  if (/iPad/.test(ua)) {
    return { device: 'iPad', isMobile: true }
  }

  if (/iPod/.test(ua)) {
    return { device: 'iPod', isMobile: true }
  }

  // Android - try to extract device model from UA
  // Some UAs include model: "Android 10; SM-G973F"
  const androidMatch = ua.match(/Android[^;)]+;\s*([^;)]+)/)
  if (androidMatch && androidMatch[1]) {
    const model = androidMatch[1].trim()
    // Check if it's a meaningful model (not frozen "K")
    if (model !== 'K' && model.length > 1) {
      return {
        device: cleanDeviceModel(model),
        isMobile: /Mobile/.test(ua),
      }
    }
    return {
      device: 'Android Device',
      isMobile: /Mobile/.test(ua),
    }
  }

  // Android without model info
  if (/Android/.test(ua)) {
    return {
      device: 'Android Device',
      isMobile: /Mobile/.test(ua),
    }
  }

  // Desktop detection
  if (/Windows/.test(ua)) {
    return { device: 'Windows PC', isMobile: false }
  }

  if (/Mac OS X/.test(ua)) {
    // Check for iPad in desktop mode (iPadOS 13+)
    if (typeof document !== 'undefined' && 'ontouchend' in document && /Mac/.test(ua)) {
      return { device: 'iPad', isMobile: true }
    }
    return { device: 'Mac', isMobile: false }
  }

  if (/Linux/.test(ua)) {
    return { device: 'Linux PC', isMobile: false }
  }

  if (/CrOS/.test(ua)) {
    return { device: 'Chromebook', isMobile: false }
  }

  return { device: 'Device', isMobile: /Mobile/.test(ua) }
}

/**
 * Get device info from User-Agent string (fallback)
 */
function getDeviceInfoFromUserAgent(): DeviceInfo {
  const ua = navigator.userAgent

  const browser = detectBrowserFromUA(ua)
  const { device, isMobile } = detectDeviceFromUA(ua)

  return {
    browser,
    device,
    displayName: `${browser} on ${device}`,
    isMobile,
  }
}

/**
 * Get device information using modern APIs with fallback
 * Returns: "Browser on Device" format (e.g., "Vivaldi on Pixel 8")
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  // Try Client Hints first (works on Chromium browsers)
  const clientHintsInfo = await getDeviceInfoFromClientHints()

  if (clientHintsInfo) {
    return clientHintsInfo
  }

  // Fall back to User-Agent parsing
  return getDeviceInfoFromUserAgent()
}

/**
 * Synchronous version for compatibility
 * Uses only User-Agent (no Client Hints)
 */
export function getDeviceInfoSync(): DeviceInfo {
  return getDeviceInfoFromUserAgent()
}
