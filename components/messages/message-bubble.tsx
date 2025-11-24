'use client'

interface MessageBubbleProps {
  message: string
  isOwn: boolean
  timestamp: Date
  senderName?: string
}

export function MessageBubble({
  message,
  isOwn,
  timestamp,
  senderName,
}: MessageBubbleProps) {
  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isOwn
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
        }`}
      >
        {!isOwn && senderName && (
          <p className="text-xs font-semibold mb-1 opacity-75">{senderName}</p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message}</p>
        <p
          className={`text-xs mt-1 ${
            isOwn ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}

