# kayaz.dev

Personal portfolio for **kayaz** — low-level dev, maker of Omnis CS2.

The whole site is skinned as a **CS2 cheat menu** (gamesense / memesense style):
group boxes, checkboxes, sliders, tabbed panels, and a live watermark with
fps / ping / clock. One self-contained `index.html` — no build step.

## Features
- Tabbed menu nav (home / projects / contact) with project detail pages
- Live Discord activity + status via the [Lanyard](https://github.com/Phineas/lanyard) API
- Built-in music player
- Before / after comparison slider and config screenshot gallery for Omnis CS2
- Live watermark: real clock, animated fps counter, session uptime

## Run it
Open `index.html` in a browser. For local HTTPS dev use something like
[Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).

## Customize
Everything lives in `index.html`. Theme variables (colors, accent, fonts) are in
the `:root` block at the top of the `<style>` section — change `--accent` to
re-skin the whole menu.
