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
# Optional model overrides:
# OPENAI_SCENE_MODEL=gpt-5.6-terra
# OPENAI_ITEM_MODEL=gpt-4.1-mini
```

The API key is only used by the server route and is never exposed to the browser.
Scene scans use `gpt-5.6-terra` by default, while Item Deep Dive uses
`gpt-4.1-mini`. Set `OPENAI_SCENE_MODEL=gpt-4.1-mini` in Vercel to restore the
previous scene model without changing the code.

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
- Camera stream released after capture or upload and restarted on retake
- Captured-frame preview with clear analysis progress and automatic result focus
- Numbered approximate object markers linked to result cards
- Approximate object boxes used for on-demand image crops
- Client-side image resizing and server-side image size validation
- Next.js API routes for scene and selected-item analysis
- Server-side OpenAI timeout and cancellation when the client disconnects
- OpenAI Vision discovery scan with strict structured JSON and up to five candidates
- Provisional EUR ranges based on visible model, brand, or category details
- Server-calculated visible scene value total with duplicate-result protection
- Candidate states for interesting, needs-close-up, and low-priority objects
- Separate identification and pricing confidence
- Result cards with value first, recommendation, confidence, score, period, and optional next-photo guidance
- On-demand Item Deep Dive with an automatic crop or optional phone close-up
- Automatic scrolling from the captured image to the analysis results

Not included yet:

- Smart glasses
- eBay API
- Payments
- Authentication

## Next Steps

1. Save scans to Supabase
2. Add eBay sold data
3. Add live auto-scan every few seconds
4. Save multi-angle close-ups with each item
5. Add user accounts and paid credits
