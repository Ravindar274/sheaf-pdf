# Sheaf

Merge PDFs and reorder, rotate, duplicate or delete pages. Everything runs in the browser, so files are never uploaded to a server.

## Features

- Add several PDFs at once (file picker or drag and drop anywhere on the page)
- Page thumbnails, rendered lazily as you scroll
- Drag to reorder (mouse, touch with press-and-hold, or keyboard)
- Rotate, duplicate and delete single pages
- Remove every page from one source file in one click
- Reverse the whole order
- Undo (button or Ctrl/Cmd+Z)
- Custom output file name
- Clear errors for non-PDFs, password-locked files and files with security restrictions
- Works on phones, with light and dark themes

## Stack

| Part | Library |
| --- | --- |
| UI | React 19 + TypeScript, built with Vite |
| Thumbnails | pdf.js (`pdfjs-dist`), running in a web worker |
| Building the output PDF | pdf-lib, loaded only when the user downloads |
| Drag and drop | dnd-kit |

## Run locally

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # output in dist/
npm run preview    # serve the build at http://localhost:4173
```

## Deploy to Vercel (free)

1. Push this folder to a new GitHub repo.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Vercel detects Vite automatically. Keep the build command `npm run build` and output folder `dist`.
4. Deploy. Every push to `main` redeploys.

Netlify and Cloudflare Pages work the same way, since the build is just static files.

## Project layout

```
src/
  App.tsx                 page state, toolbar, drag-and-drop wiring
  App.css                 all styles (light and dark)
  components/PageCard.tsx one page tile and its lazy thumbnail
  lib/pdf.ts              loading, thumbnail rendering and PDF export
```

## How it works

1. Each file is read into memory and opened with pdf.js, which gives the page count and renders thumbnails.
2. The board is just a list of `{ docId, pageIndex, rotation }` items. Reordering, rotating and deleting only change this list.
3. On download, pdf-lib copies each page from its source file in list order, applies the extra rotation and saves a new PDF, which the browser downloads.

## Known limits

- PDFs with a password or edit restrictions are refused. pdf-lib can't decrypt them, so the output would be broken.
- Very large files (hundreds of pages) can use a lot of memory on phones, since the whole file is kept in memory.

## Ideas for next steps

- Multi-select pages to rotate or delete in bulk
- Split a PDF into several files
- Insert blank pages
- Offline support as a PWA
- Mobile app build with Capacitor
