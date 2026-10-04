"""Assembles the TrackToDeal landing page: page.html (artifact body) and index.html (standalone)."""
import os
here = os.path.dirname(os.path.abspath(__file__))
logo = open(os.path.join(here, "logo-snippet.svg")).read()
page = open(os.path.join(here, "page.template.html")).read().replace("{{LOGO}}", logo)
open(os.path.join(here, "page.html"), "w").write(page)
open(os.path.join(here, "index.html"), "w").write(
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + page.replace("<header", "</head><body>\n<header", 1) + "\n</body></html>\n")
