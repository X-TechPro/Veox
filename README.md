# Veox Player

A premium video streaming player built with Next.js 16, React 19, and TypeScript. Veox provides a modern, elegant interface for streaming direct media URLs (MP4/M3U8) and looking up content via TMDB IDs through the ShowBox API.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.2-38bdf8?logo=tailwind-css)

## Features

- **Direct Stream Playback** - Play any MP4 or M3U8 stream URL directly
- **ShowBox Integration** - Look up movies and TV shows by TMDB ID
- **Quality Selection** - Support for multiple quality options
- **Subtitle Support** - Built-in subtitle track handling
- **HLS.js Integration** - Native M3U8/HLS stream support
- **Modern UI** - Clean, responsive design with shadcn/ui components
- **Dark/Light Theme** - Theme support via next-themes
- **Analytics** - Integrated Vercel Analytics

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5.7
- **Styling:** Tailwind CSS 4.2
- **UI Components:** shadcn/ui (Radix UI primitives)
- **Icons:** Lucide React
- **Video:** HLS.js for HLS stream support
- **Forms:** React Hook Form + Zod validation
- **Date Handling:** date-fns

## Getting Started

### Prerequisites

- Node.js 18+ or pnpm
- npm, yarn, or pnpm package manager

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd Veox

# Install dependencies
npm install
# or
pnpm install
# or
yarn install
```

### Development

```bash
# Start the development server
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Production

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Usage

### Home Page

The home page provides two main options:

1. **Direct Stream** - Enter any MP4 or M3U8 URL to play directly
2. **ShowBox Lookup** - Enter a TMDB ID and API key to fetch and stream content

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/stream?link={media_url}` | Play a direct media URL |
| `GET` | `/showbox?tmdb={tmdb_id}&api={api_key}` | Lookup and stream via ShowBox |
| `GET` | `/showbox?tmdb={id}&type={type}&s={season}&e={episode}&api={key}` | Full ShowBox query with type/season/episode |

#### Query Parameters

**Stream Endpoint:**
- `link` - The media URL (MP4 or M3U8)
- `title` (optional) - Custom title for the stream

**ShowBox Endpoint:**
- `tmdb` - TMDB movie or TV ID
- `api` - ShowBox API key
- `type` - Content type (default: "1")
- `s` / `season` - Season number (for TV shows)
- `e` / `episode` - Episode number (for TV shows)

### Example URLs

```
# Direct stream
http://localhost:3000/stream?link=https://example.com/video.mp4

# ShowBox lookup
http://localhost:3000/showbox?tmdb=550&api=your_api_key

# TV Show episode
http://localhost:3000/showbox?tmdb=1399&type=2&s=1&e=3&api=your_api_key
```

## Project Structure

```
Veox/
├── app/
│   ├── api/           # API routes
│   ├── showbox/       # ShowBox lookup page
│   ├── stream/        # Direct stream player page
│   ├── globals.css    # Global styles
│   ├── layout.tsx     # Root layout
│   └── page.tsx       # Home page
├── components/
│   ├── ui/            # shadcn/ui components
│   ├── theme-provider.tsx
│   └── veox-player.tsx  # Main video player component
├── hooks/             # Custom React hooks
├── lib/               # Utility functions
├── styles/            # Additional styles
└── public/            # Static assets
```

## Configuration

### Next.js Config

See `next.config.mjs` for build configuration including TypeScript error handling and image optimization settings.

### TypeScript Config

Path aliases are configured in `tsconfig.json`:
- `@/*` maps to the project root

### Tailwind Config

Using Tailwind CSS v4 with CSS-based configuration in `app/globals.css`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## License

This project is private and proprietary.

---

**Veox Player** - A premium video streaming experience.
