# TreasureScan

TreasureScan is a mobile-first AI discovery radar for thrift stores, attics, church restorations, flea markets, workshops, and object hunting.

The MVP opens the camera when possible, captures the current frame, sends it to a Next.js API route, and asks OpenAI Vision for cautious structured JSON about visible objects and potential value signals. It considers both historical and modern objects that may have resale, collectible, parts, brand, model, design, or material interest.

## Install

```bash
npm install
```

## Environment

Create `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

The API key is only used by the server route and is never exposed to the browser.

## Run

```bash
npm run dev
```

Open the local URL shown in the terminal.

## Test On Mobile

1. Start the dev server on your computer.
2. Make sure your phone is on the same Wi-Fi network.
3. Open the local network URL from your phone, for example `http://192.168.1.20:3000`.
4. Allow camera permission when prompted.
5. Point the camera at objects and tap **Analyze frame**.

If camera permission fails, use **Upload photo** as the fallback path.

## MVP Scope

Included:

- Mobile-first dark interface
- Live browser camera preview with rear camera preference
- Fallback image upload
- Frame capture to canvas
- Captured-frame preview with clear analysis progress and automatic result focus
- Numbered approximate object markers linked to result cards
- Client-side image resizing and server-side image size validation
- Next.js API route for analysis
- OpenAI Vision discovery scan with strict structured JSON and up to five candidates
- Candidate states for interesting, needs-close-up, and low-priority objects
- Separate identification and pricing confidence
- Result cards with indicator color, score, period, cautious value range, recommendation, and next photo suggestions

Not included yet:

- Smart glasses
- eBay API
- Payments
- Authentication

## Next Steps

1. Save scans to Supabase
2. Add eBay sold data
3. Add live auto-scan every few seconds
4. Add bounding boxes/object overlay
5. Add user accounts and paid credits
