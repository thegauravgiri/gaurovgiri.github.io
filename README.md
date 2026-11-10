# gauravgiri.com.np

Portfolio built with **Astro + React + Tailwind**. The home page hosts a live voice avatar; the rest is
a blog (Markdown/MDX content collection), projects, achievements, CV and about.

```sh
npm install
cp .env.example .env   # set PUBLIC_AVATAR_API / PUBLIC_TURNSTILE_SITE_KEY
npm run dev            # http://localhost:4321
npm run build          # static output in dist/
```

- Blog posts: `src/content/blog/*.md`
- Projects / achievements: `src/data/`
- CV PDF: put it at `public/Gaurav_Giri_CV.pdf`
- Deploys to GitHub Pages from `main` via `.github/workflows/pages-deploy.yml`

## Avatar
The home page shows a rigged 3D head (`public/avatar.glb`) driven by the voice audio: jaw, lip shapes,
blinks and head motion (`src/components/agent/rig/glb.ts`). If that file is missing, a photo-based avatar is used.
The voice runs through a separate gateway; set its URL in `PUBLIC_AVATAR_API`.
