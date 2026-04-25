Place your homepage background image here

To use the image you attached as the homepage background, save the image file in the project `public/assets` folder with the name `homepage-bg.jpg` (or any name you prefer) and restart the dev server.

Paths and options

- Recommended path: `public/assets/homepage-bg.jpg`
- The app will use the environment variable `VITE_HOMEPAGE_BG` if set. Example:

  - In Windows PowerShell (temporary for current session):

    $env:VITE_HOMEPAGE_BG = '/assets/homepage-bg.jpg'
    npm run dev

  - Or in a `.env` file at project root add:

    VITE_HOMEPAGE_BG=/assets/homepage-bg.jpg

Notes

- The frontend's `pages/HomePage.tsx` already prefers `VITE_HOMEPAGE_BG` and falls back to `/homepage-bg.jpg` if not set.
- If you saved the image to `public/assets/homepage-bg.jpg`, set `VITE_HOMEPAGE_BG=/assets/homepage-bg.jpg` for consistency.
- After adding the image file, restart the Vite dev server so it picks up the new static asset.
