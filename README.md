# kayaz.dev

Personal site for **kayaz** — self-taught low-level developer and creator of
**Omnis**, external cheats for CS2 and Rainbow Six.

A single self-contained `index.html` (no build step): a dark, product-led
landing page with a hero, work section, an Omnis CS2 deep-dive, an Omnis R6
"in development" section, about, and contact.

## Sections
- **Hero** — intro + a framed product showcase, with a live Discord status pill.
- **Work** — Omnis CS2 (live) and Omnis R6 (in development).
- **Omnis CS2** — trailer, feature grid, before/after slider, menu gallery, pricing.
- **Omnis R6** — what's coming.
- **About / Stack** and **Contact**.

## Features
- Live Discord presence + activity via the [Lanyard](https://github.com/Phineas/lanyard) API
- Built-in music player
- Before / after comparison slider and menu screenshot gallery
- Scroll-reveal animations and a responsive mobile nav

## Run it
Open `index.html` in a browser. For local HTTPS dev use something like
[Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).

## Customize
Everything lives in `index.html`. Theme variables (colors, accent, fonts) are in
the `:root` block at the top of the `<style>` section — change `--accent` to
re-skin the whole site.
