# Project Structure

This document outlines the recommended project structure for p2p4everything.

## Monorepo Structure

```
p2p4everything/
├── apps/
│   ├── web/                    # Next.js web application
│   │   ├── app/                # Next.js App Router
│   │   │   ├── (auth)/         # Auth routes
│   │   │   ├── (dashboard)/    # Dashboard routes
│   │   │   ├── api/            # API routes
│   │   │   └── layout.tsx      # Root layout
│   │   ├── components/         # React components
│   │   │   ├── ui/             # UI components
│   │   │   ├── chat/           # Chat components
│   │   │   ├── file-sharing/   # File sharing components
│   │   │   └── calls/          # Call components
│   │   ├── lib/                # Utilities
│   │   │   ├── clerk.ts        # Clerk configuration
│   │   │   ├── db.ts           # Database client
│   │   │   └── utils.ts        # Helper functions
│   │   ├── hooks/              # React hooks
│   │   ├── styles/             # Global styles
│   │   ├── public/             # Static assets
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   ├── mobile/                 # React Native app (future)
│   │   ├── src/
│   │   ├── android/
│   │   ├── ios/
│   │   └── package.json
│   │
│   └── desktop/                # Electron app (future)
│       ├── src/
│       ├── main/               # Main process
│       ├── renderer/           # Renderer process
│       └── package.json
│
├── packages/
│   ├── sdk/                    # Shared TypeScript SDK
│   │   ├── src/
│   │   │   ├── client.ts       # Main SDK client
│   │   │   ├── webrtc.ts       # WebRTC wrapper
│   │   │   ├── encryption.ts   # Encryption utilities
│   │   │   └── types.ts        # Type definitions
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── crypto/                 # Encryption package
│   │   ├── src/
│   │   │   ├── keys.ts         # Key generation
│   │   │   ├── encrypt.ts      # Encryption functions
│   │   │   ├── decrypt.ts      # Decryption functions
│   │   │   └── key-exchange.ts # Key exchange protocol
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── webrtc/                 # WebRTC utilities
│   │   ├── src/
│   │   │   ├── peer.ts         # Peer connection
│   │   │   ├── signaling.ts    # Signaling client
│   │   │   ├── data-channel.ts # Data channel wrapper
│   │   │   └── media-stream.ts # Media stream wrapper
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── types/                  # Shared TypeScript types
│       ├── src/
│       │   ├── user.ts
│       │   ├── message.ts
│       │   ├── file.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── services/
│   ├── signaling/              # WebSocket signaling server
│   │   ├── src/
│   │   │   ├── server.ts       # Main server
│   │   │   ├── socket.ts       # Socket handlers
│   │   │   ├── rooms.ts        # Room management
│   │   │   └── middleware.ts   # Auth middleware
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── api/                    # REST/GraphQL API (optional)
│       ├── src/
│       │   ├── server.ts
│       │   ├── routes/
│       │   └── middleware.ts
│       ├── package.json
│       └── tsconfig.json
│
├── infrastructure/
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.signaling
│   │   └── docker-compose.yml
│   │
│   ├── k8s/                    # Kubernetes configs (future)
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── ingress.yaml
│   │
│   └── terraform/              # Infrastructure as code (future)
│       └── main.tf
│
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # Database migrations
│
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── FEATURES.md
│   ├── DEPLOYMENT.md
│   └── API.md                  # API documentation
│
├── scripts/                    # Utility scripts
│   ├── setup.sh
│   ├── migrate.sh
│   └── seed.sh
│
├── .github/
│   ├── workflows/              # CI/CD workflows
│   │   ├── ci.yml
│   │   └── deploy.yml
│   └── ISSUE_TEMPLATE/
│
├── .env.example                # Environment variables template
├── .gitignore
├── package.json                # Root package.json (workspace)
├── pnpm-workspace.yaml         # pnpm workspace config
├── turbo.json                  # Turborepo config (optional)
├── tsconfig.json               # Root TypeScript config
└── README.md
```

## Package Organization

### Apps
- **web**: Main Next.js application
- **mobile**: React Native mobile app (future)
- **desktop**: Electron desktop app (future)

### Packages
- **sdk**: Shared SDK for all clients
- **crypto**: Encryption utilities
- **webrtc**: WebRTC wrapper and utilities
- **types**: Shared TypeScript types

### Services
- **signaling**: WebSocket signaling server
- **api**: Optional REST/GraphQL API server

## Key Directories

### `/apps/web/app/`
Next.js App Router structure:
- `(auth)/`: Authentication routes (login, signup)
- `(dashboard)/`: Main application routes
  - `chat/`: Chat interface
  - `files/`: File sharing
  - `calls/`: Voice/video calls
  - `settings/`: User settings
- `api/`: API routes
  - `auth/`: Auth endpoints
  - `users/`: User endpoints
  - `files/`: File metadata endpoints
  - `signaling/`: Signaling endpoints

### `/apps/web/components/`
Component organization:
- `ui/`: Reusable UI components (buttons, inputs, etc.)
- `chat/`: Chat-specific components
- `file-sharing/`: File sharing components
- `calls/`: Call components
- `layout/`: Layout components

### `/packages/sdk/src/`
SDK structure:
- `client.ts`: Main SDK client class
- `webrtc.ts`: WebRTC connection management
- `encryption.ts`: Encryption/decryption
- `signaling.ts`: Signaling client
- `storage.ts`: Local storage utilities

## File Naming Conventions

- **Components**: PascalCase (e.g., `ChatMessage.tsx`)
- **Utilities**: camelCase (e.g., `formatDate.ts`)
- **Hooks**: camelCase with `use` prefix (e.g., `useWebRTC.ts`)
- **Types**: PascalCase (e.g., `User.ts`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `API_ENDPOINTS.ts`)

## Import Paths

Use path aliases for cleaner imports:

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@p2p4everything/sdk": ["../../packages/sdk/src"],
      "@p2p4everything/crypto": ["../../packages/crypto/src"],
      "@p2p4everything/types": ["../../packages/types/src"]
    }
  }
}
```

## Database Schema Location

- **Schema**: `/prisma/schema.prisma`
- **Migrations**: `/prisma/migrations/`
- **Seed**: `/prisma/seed.ts`

## Configuration Files

- **Next.js**: `/apps/web/next.config.js`
- **TypeScript**: Root `tsconfig.json` + package-specific configs
- **ESLint**: `.eslintrc.js` (root or per package)
- **Prettier**: `.prettierrc` (root)
- **Docker**: `/infrastructure/docker/`

## Testing Structure

```
apps/web/
├── __tests__/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── components/
    └── __tests__/
```

## Documentation Structure

- **Architecture**: High-level system design
- **Tech Stack**: Technology choices
- **Features**: Feature specifications
- **Deployment**: Deployment guides
- **API**: API documentation
- **Contributing**: Contribution guidelines

## Getting Started

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Set up environment variables: `cp .env.example .env`
4. Set up database: `pnpm db:migrate`
5. Start development: `pnpm dev`

## Workspace Management

Using pnpm workspaces or Turborepo for monorepo management:

```json
// pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

This structure provides:
- Code reusability across platforms
- Type safety across packages
- Independent versioning
- Efficient builds with caching

