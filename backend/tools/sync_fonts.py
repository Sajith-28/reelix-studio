"""
REELIX — font pipeline

One command keeps the three font consumers in lock-step:

  * frontend/public/fonts/*.ttf   + src/fonts.generated.css  (browser @font-face)
  * backend/fonts/*.ttf                                        (PIL + LibASS export)
  * frontend/src/lib/fontLibrary.json                          (the font picker)

    cd backend && python tools/sync_fonts.py          # import sources + regenerate
    cd backend && python tools/sync_fonts.py --scan   # only regenerate from the files present

Sources are curated below: static files from the local `fonts sublyx` archive,
OFL faces fetched from github.com/google/fonts, and variable fonts instanced to
static weights (fontTools) so the browser, Pillow and LibASS all rasterise the
exact same outlines. Every generated file is named Family-Weight[Italic].ttf.

To add your own font: drop a .ttf/.otf into BOTH font folders (or list it in
SOURCES) and run --scan. The name table decides family / weight / italic.
"""

import argparse
import io
import os
import shutil
import sys
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARCHIVE = os.path.join(ROOT, "fonts sublyx")
FRONT_FONTS = os.path.join(ROOT, "frontend", "public", "fonts")
BACK_FONTS = os.path.join(ROOT, "backend", "fonts")
CSS_OUT = os.path.join(ROOT, "frontend", "src", "fonts.generated.css")
LIB_OUT = os.path.join(ROOT, "frontend", "src", "lib", "fontLibrary.json")
GF = "https://raw.githubusercontent.com/google/fonts/main/ofl/"

WEIGHT_NAMES = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
                600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black"}

A = lambda *p: os.path.join(ARCHIVE, *p)  # noqa: E731
POP = A("Archivo_Black,Dela_Gothic_One,Montserrat,Oswald,Poppins")

# (family, [ {src, weight, italic, axes?} ... ])  — src: local path or URL; "var" for a variable font to instance
SOURCES = [
    # Archivo Black ships as typographic family "Archivo" / subfamily "Black" at weight 400 — rename so it reads as its own family.
    ("Archivo Black", [{"src": A(POP, "Archivo_Black", "ArchivoBlack-Regular.ttf"), "weight": 400, "rename": True}]),
    ("Dela Gothic One", [{"src": A(POP, "Dela_Gothic_One", "DelaGothicOne-Regular.ttf"), "weight": 400}]),
    ("Poppins", [{"src": A(POP, "Poppins", f"Poppins-{w}.ttf"), "weight": n}
                 for w, n in (("Bold", 700), ("ExtraBold", 800), ("Black", 900))]
     + [{"src": A(POP, "Poppins", "Poppins-BlackItalic.ttf"), "weight": 900, "italic": True}]),
    ("League Spartan", [{"src": A("LeagueSpartan-2.220", "LeagueSpartan-2.220", "static", "TTF", f"LeagueSpartan-{w}.ttf"), "weight": n}
                        for w, n in (("Bold", 700), ("ExtraBold", 800), ("Black", 900))]),
    ("Clash Display", [{"src": A("ClashDisplay_Complete", "ClashDisplay_Complete", "Fonts", "WEB", "fonts", f"ClashDisplay-{w}.ttf"), "weight": n}
                       for w, n in (("Medium", 500), ("Semibold", 600), ("Bold", 700))]),
    ("Satoshi", [{"var": A("Satoshi_Complete", "Satoshi_Complete", "Fonts", "TTF", "Satoshi-Variable.ttf"), "weight": w} for w in (700, 900)]
     + [{"var": A("Satoshi_Complete", "Satoshi_Complete", "Fonts", "TTF", "Satoshi-VariableItalic.ttf"), "weight": 700, "italic": True}]),
    ("Kanit", [{"src": GF + f"kanit/Kanit-{w}.ttf", "weight": n} for w, n in (("Bold", 700), ("ExtraBold", 800), ("Black", 900))]),
    ("Lilita One", [{"src": GF + "lilitaone/LilitaOne-Regular.ttf", "weight": 400}]),
    ("Instrument Serif", [{"src": GF + "instrumentserif/InstrumentSerif-Regular.ttf", "weight": 400},
                          {"src": GF + "instrumentserif/InstrumentSerif-Italic.ttf", "weight": 400, "italic": True}]),
    ("DM Serif Display", [{"src": GF + "dmserifdisplay/DMSerifDisplay-Regular.ttf", "weight": 400},
                          {"src": GF + "dmserifdisplay/DMSerifDisplay-Italic.ttf", "weight": 400, "italic": True}]),
    ("Italiana", [{"src": GF + "italiana/Italiana-Regular.ttf", "weight": 400}]),
    ("Cormorant Garamond", [{"var": GF + "cormorantgaramond/CormorantGaramond[wght].ttf", "weight": w} for w in (600, 700)]
     + [{"var": GF + "cormorantgaramond/CormorantGaramond-Italic[wght].ttf", "weight": 600, "italic": True}]),
    ("Space Grotesk", [{"var": GF + "spacegrotesk/SpaceGrotesk[wght].ttf", "weight": w} for w in (500, 700)]),
    ("Unbounded", [{"var": GF + "unbounded/Unbounded[wght].ttf", "weight": w} for w in (700, 800, 900)]),
    ("Bodoni Moda", [{"var": GF + "bodonimoda/BodoniModa[opsz,wght].ttf", "weight": 700, "axes": {"opsz": 28}},
                     {"var": GF + "bodonimoda/BodoniModa-Italic[opsz,wght].ttf", "weight": 600, "italic": True, "axes": {"opsz": 28}}]),
]

# Picker metadata. Families found on disk but not listed here fall into "clean".
LIBRARY = {
    "Anton": ("impact", "Hormozi punch"),
    "Archivo Black": ("impact", "Viral headline"),
    "Dela Gothic One": ("impact", "Heavy poster"),
    "Bebas Neue": ("impact", "Tall condensed"),
    "Oswald": ("impact", "Classic title"),
    "Kanit": ("impact", "Sharp & loud"),
    "Lilita One": ("impact", "Rounded pop"),
    "Unbounded": ("impact", "Future wide"),
    "League Spartan": ("impact", "Geometric black"),
    "Montserrat": ("clean", "Viral Reels"),
    "Poppins": ("clean", "Creator classic"),
    "Inter": ("clean", "Minimal UI"),
    "Rubik": ("clean", "Smooth bold"),
    "Outfit": ("clean", "Sleek geometric"),
    "Plus Jakarta Sans": ("clean", "Modern"),
    "Satoshi": ("clean", "Premium grotesk"),
    "Space Grotesk": ("clean", "Tech grotesk"),
    "Clash Display": ("editorial", "Fashion display"),
    "Syne": ("editorial", "Edgy creator"),
    "Bai Jamjuree": ("editorial", "Tech display"),
    "Playfair Display": ("editorial", "Luxe serif"),
    "Instrument Serif": ("editorial", "Aesthetic serif"),
    "DM Serif Display": ("editorial", "Quote serif"),
    "Cormorant Garamond": ("editorial", "Whisper serif"),
    "Bodoni Moda": ("editorial", "Vogue serif"),
    "Italiana": ("editorial", "Thin couture"),
}
CATEGORY_LABELS = {"impact": "Impact & Viral", "clean": "Clean & Modern", "editorial": "Aesthetic & Editorial"}


def fetch(src):
    if src.startswith("http"):
        with urllib.request.urlopen(src, timeout=60) as r:
            return r.read()
    with open(src, "rb") as f:
        return f.read()


def set_names(font, family, weight, italic):
    """RIBBI-correct name table + weight/style bits so every consumer agrees on the face."""
    wname = WEIGHT_NAMES.get(weight, str(weight))
    ribbi = weight == 700
    sub = ("Bold Italic" if italic else "Bold") if ribbi else ("Italic" if italic else "Regular")
    fam1 = family if ribbi or weight == 400 else f"{family} {wname}"
    typo_sub = f"{wname} Italic" if italic else wname
    if weight == 400:
        typo_sub = "Italic" if italic else "Regular"
    full = f"{family} {typo_sub}".replace(" Regular", "") if weight == 400 and not italic else f"{family} {typo_sub}"
    ps = f"{family.replace(' ', '')}-{wname}{'Italic' if italic else ''}"
    name = font["name"]
    for rec_id, value in ((1, fam1), (2, sub), (3, f"{ps};reelix"), (4, full), (6, ps), (16, family), (17, typo_sub)):
        name.setName(value, rec_id, 3, 1, 0x409)
        name.setName(value, rec_id, 1, 0, 0)
    os2 = font["OS/2"]
    os2.usWeightClass = weight
    sel = os2.fsSelection & ~(0x01 | 0x20 | 0x40)
    if italic:
        sel |= 0x01
    if ribbi:
        sel |= 0x20
    if not italic and not ribbi:
        sel |= 0x40
    os2.fsSelection = sel
    font["head"].macStyle = (0x01 if ribbi else 0) | (0x02 if italic else 0)


def face_filename(family, weight, italic):
    style = ("Italic" if weight == 400 else f"{WEIGHT_NAMES[weight]}Italic") if italic else WEIGHT_NAMES[weight]
    return f"{family.replace(' ', '')}-{style}.ttf"


def build_face(family, spec):
    weight = spec["weight"]
    italic = bool(spec.get("italic"))
    fname = face_filename(family, weight, italic)
    if "var" in spec:
        vf = TTFont(io.BytesIO(fetch(spec["var"])))
        axes = {"wght": weight, **spec.get("axes", {})}
        font = instancer.instantiateVariableFont(vf, axes, inplace=False, updateFontNames=False)
        set_names(font, family, weight, italic)
        out = io.BytesIO()
        font.save(out)
        data = out.getvalue()
    else:
        data = fetch(spec["src"])
        font = TTFont(io.BytesIO(data))
        if spec.get("rename"):
            set_names(font, family, weight, italic)
            out = io.BytesIO()
            font.save(out)
            data = out.getvalue()
    return fname, data


def import_sources():
    for family, specs in SOURCES:
        for spec in specs:
            try:
                fname, data = build_face(family, spec)
            except Exception as e:  # keep going: one missing source must not block the rest
                print(f"  ! {family} {spec.get('weight')}: {e}")
                continue
            for d in (FRONT_FONTS, BACK_FONTS):
                with open(os.path.join(d, fname), "wb") as f:
                    f.write(data)
            print(f"  + {fname}")


def face_info(path):
    """family / weight / italic / ass_family as the runtime reads them (name + OS/2 + head)."""
    font = TTFont(path, lazy=True)
    name = font["name"]

    def rec(nid):
        r = name.getName(nid, 3, 1, 0x409) or name.getName(nid, 1, 0, 0)
        return r.toUnicode().strip() if r else ""

    fam1, fam16 = rec(1), rec(16)
    family = fam16 or fam1
    os2 = font["OS/2"]
    weight = int(os2.usWeightClass) or 400
    italic = bool(os2.fsSelection & 0x01) or bool(font["head"].macStyle & 0x02)
    if not fam16:
        # RIBBI-only fonts encode the weight in the family name ("Playfair Display Black").
        for w, n in WEIGHT_NAMES.items():
            if fam1.endswith(" " + n) and n not in ("Regular",):
                family = fam1[: -len(n) - 1]
                break
    font.close()
    return {"family": family, "weight": weight, "italic": italic, "ass_family": fam1, "file": os.path.basename(path)}


def scan():
    faces = {}
    for fn in sorted(os.listdir(FRONT_FONTS)):
        if not fn.lower().endswith((".ttf", ".otf")):
            continue
        try:
            info = face_info(os.path.join(FRONT_FONTS, fn))
        except Exception as e:
            print(f"  ! skip {fn}: {e}")
            continue
        key = (info["family"].lower(), info["weight"], info["italic"])
        # Prefer the canonical Family-Weight.ttf name when duplicates exist.
        canonical = info["weight"] in WEIGHT_NAMES and fn == face_filename(info["family"], info["weight"], info["italic"])
        if key not in faces or canonical:
            faces[key] = info
    return sorted(faces.values(), key=lambda f: (f["family"].lower(), f["italic"], f["weight"]))


def write_outputs(faces):
    css = ["/* GENERATED by backend/tools/sync_fonts.py — do not edit. One @font-face per file with its exact weight/style. */"]
    for f in faces:
        css.append(
            "@font-face { font-family: '%s'; src: url('/fonts/%s') format('%s'); font-weight: %d; font-style: %s; font-display: block; }"
            % (f["family"], f["file"].replace("'", "%27"), "opentype" if f["file"].lower().endswith(".otf") else "truetype",
               f["weight"], "italic" if f["italic"] else "normal"))
    with open(CSS_OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(css) + "\n")

    lib = {}
    for f in faces:
        entry = lib.setdefault(f["family"], {"family": f["family"], "weights": [], "italics": []})
        (entry["italics"] if f["italic"] else entry["weights"]).append(f["weight"])
    out = []
    for fam, e in lib.items():
        cat, tag = LIBRARY.get(fam, ("clean", ""))
        weights = sorted(set(e["weights"]))
        out.append({"family": fam, "category": cat, "tagline": tag, "weights": weights,
                    "italics": sorted(set(e["italics"])), "defaultWeight": max(weights) if weights else 400})
    order = {"impact": 0, "clean": 1, "editorial": 2}
    out.sort(key=lambda x: (order.get(x["category"], 9), x["family"].lower()))
    import json
    with open(LIB_OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"categories": CATEGORY_LABELS, "fonts": out}, fh, indent=2)
        fh.write("\n")
    print(f"  {len(faces)} faces, {len(out)} families -> fonts.generated.css + fontLibrary.json")


def mirror_check():
    a = {f for f in os.listdir(FRONT_FONTS) if f.lower().endswith((".ttf", ".otf"))}
    b = {f for f in os.listdir(BACK_FONTS) if f.lower().endswith((".ttf", ".otf"))}
    for fn in sorted(a - b):
        shutil.copy2(os.path.join(FRONT_FONTS, fn), os.path.join(BACK_FONTS, fn))
        print(f"  = backend/fonts/{fn}")
    for fn in sorted(b - a):
        shutil.copy2(os.path.join(BACK_FONTS, fn), os.path.join(FRONT_FONTS, fn))
        print(f"  = frontend/public/fonts/{fn}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", action="store_true", help="only regenerate from the files present")
    args = ap.parse_args()
    if not args.scan:
        print("importing sources …")
        import_sources()
    print("mirroring font folders …")
    mirror_check()
    print("scanning …")
    write_outputs(scan())


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
