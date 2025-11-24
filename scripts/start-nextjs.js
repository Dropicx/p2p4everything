#!/usr/bin/env node

/**
 * Graceful shutdown wrapper for Next.js in Railway serverless mode
 * Handles SIGTERM cleanly to avoid npm error messages
 */

const { spawn } = require('child_process')

console.log('🚀 Starting Next.js with graceful shutdown handler...')

// Spawn Next.js process
const nextProcess = spawn('npx', ['next', 'start'], {
  stdio: 'inherit',
  env: process.env
})

// Handle graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down Next.js gracefully...`)

  // Give Next.js a moment to finish current requests
  setTimeout(() => {
    nextProcess.kill('SIGTERM')

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      nextProcess.kill('SIGKILL')
      process.exit(0)
    }, 5000)
  }, 1000)
}

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle Next.js process exit
nextProcess.on('exit', (code, signal) => {
  if (signal === 'SIGTERM' || signal === 'SIGINT') {
    console.log('✅ Next.js shut down gracefully')
    process.exit(0)
  } else {
    process.exit(code || 0)
  }
})

// Handle errors
nextProcess.on('error', (error) => {
  console.error('❌ Error starting Next.js:', error)
  process.exit(1)
})
