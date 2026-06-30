# Greenchild — Instagram Content

Fertige, markenkonforme Instagram-Posts für einen hochwertigen, professionellen
Greenchild-Account. Inhalte (Headlines, Texte, Fakten) stammen aus dem Messaging
der Website (`/de/`) und den echten Plantagen-/Photoshoot-Fotos.

## Inhalt
- `posts/p1.png … p9.png` — 9 fertige Posts, **1080×1080** (exportiert in 2160×2160 für scharfe Darstellung)
- `grid-preview.png` — 3×3-Vorschau des Profil-Rasters
- `captions.md` — Profil-Bio, Posting-Reihenfolge und für jeden Post Caption + Hashtags
- `posts.html` — Quelle/Template aller Posts (datengetrieben, Greenchild-Brand-Tokens)
- `render.js` — Render-Skript (Playwright/Chromium → PNG)

## Branding
Markenfarben aus `../css/style.css` (Grün `#00A86B` / `#2DD4A0`, Tiefgrün
`#0C2E20`, Gold `#C4993C`), Fonts **Manrope** + **Outfit**, Greenchild-Wortmarke,
einheitliche Eyebrow-Labels, Glas-Statistikkarten, dezentes Filmkorn.

## Neu rendern / Texte anpassen
Texte, Fotos und Reihenfolge im `posts`-Array in `posts.html` bearbeiten, dann:

```bash
# benötigt Manrope/Outfit (z. B. via Google Fonts in ~/.fonts) und Playwright/Chromium
NODE_PATH=/opt/node22/lib/node_modules node render.js
```

Die PNGs in `posts/` werden überschrieben. Fotos liegen in `../assets/img/`.
