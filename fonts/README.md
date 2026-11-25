# PDF fonts (optional)

The PDF renderer looks here when `DYSLEXIA_FONT_PATH` / `HINDI_FONT_PATH` are not set or the file
does not exist (for example on Vercel, where system fonts are not available):

- `fonts/OpenDyslexic-Regular.otf` (and optionally `OpenDyslexic-Bold.otf`) – used for the `dyslexia_font` adaptation
- `fonts/NotoSansDevanagari-Regular.ttf` (and optionally `NotoSansDevanagari-Bold.ttf`) – needed to render Hindi text

Both fonts are under the SIL Open Font License. Download them from their official sources
(opendyslexic.org and fonts.google.com/noto) and commit them here. Without them, PDFs fall back to
Helvetica and Hindi text will not render correctly. The Docker image installs both from Debian packages.
