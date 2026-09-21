"""
REELIX — font index for the export engines

Scans backend/fonts once and resolves (family, weight, italic) to the exact
file the browser uses (frontend/src/fonts.generated.css is generated from the
same files by backend/tools/sync_fonts.py). Reading the name / OS/2 / head
tables directly keeps the runtime free of fontTools.
"""

import os
import struct
from functools import lru_cache

FONTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts"))
WEIGHT_NAMES = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
                600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black"}
DEFAULT_WEIGHT = 900  # "as heavy as the family goes" — matches the preview's fallback
FALLBACK_FAMILIES = ("Montserrat", "Anton", "Inter")


def _norm(name):
    return "".join(ch for ch in (name or "").lower() if ch.isalnum())


def _name_records(data, off):
    count, strings = struct.unpack(">HH", data[off + 2:off + 6])
    out = {}
    for i in range(count):
        rec = off + 6 + 12 * i
        pid, eid, lang, nid, length, str_off = struct.unpack(">HHHHHH", data[rec:rec + 12])
        start = off + strings + str_off
        raw = data[start:start + length]
        try:
            if pid == 3 and eid in (1, 10):
                text = raw.decode("utf-16-be")
            elif pid == 1:
                text = raw.decode("mac_roman")
            else:
                continue
        except UnicodeDecodeError:
            continue
        # Windows English wins; Mac Roman only fills gaps.
        if nid not in out or (pid == 3 and lang == 0x409):
            out[nid] = text.strip()
    return out


@lru_cache(maxsize=256)
def read_face(path):
    """
    Everything the engines need from one font file:
        family      typographic family ("Poppins")
        ass_family  name ID 1, what LibASS matches on ("Poppins Black")
        weight      OS/2 usWeightClass
        italic      real italic face
        bold        the face's own bold flag (LibASS emboldens synthetically when
                    Bold is requested on a face without it — never do that)
        size_ratio  CSS px → ASS Fontsize (winAscent+winDescent)/upem
    """
    info = {"path": path, "family": None, "ass_family": None, "subfamily": "", "weight": 400, "italic": False,
            "bold": False, "size_ratio": 1.0, "win_asc": 0.0, "win_desc": 0.0, "upem": 1000}
    try:
        with open(path, "rb") as fh:
            data = fh.read()
        tables = {}
        for i in range(struct.unpack(">H", data[4:6])[0]):
            rec = 12 + 16 * i
            tables[data[rec:rec + 4]] = struct.unpack(">I", data[rec + 8:rec + 12])[0]

        names = _name_records(data, tables[b"name"]) if b"name" in tables else {}
        fam1, sub2 = names.get(1, ""), names.get(2, "")
        fam16, sub17 = names.get(16, ""), names.get(17, "")
        info["ass_family"] = fam1 or None
        info["subfamily"] = sub17 or sub2

        if b"OS/2" in tables:
            o = tables[b"OS/2"]
            info["weight"] = struct.unpack(">H", data[o + 4:o + 6])[0] or 400
            fs_selection = struct.unpack(">H", data[o + 62:o + 64])[0]
            info["italic"] = bool(fs_selection & 0x01)
            info["bold"] = bool(fs_selection & 0x20)
            win_asc, win_desc = struct.unpack(">HH", data[o + 74:o + 78])
            info.update(win_asc=win_asc, win_desc=win_desc)
        if b"head" in tables:
            h = tables[b"head"]
            info["upem"] = struct.unpack(">H", data[h + 18:h + 20])[0] or 1000
            mac_style = struct.unpack(">H", data[h + 44:h + 46])[0]
            info["bold"] = info["bold"] or bool(mac_style & 0x01)
            info["italic"] = info["italic"] or bool(mac_style & 0x02)
        if info["upem"] > 0 and (info["win_asc"] + info["win_desc"]) > 0:
            info["size_ratio"] = (info["win_asc"] + info["win_desc"]) / info["upem"]

        family = fam16 or fam1
        if not fam16:
            # RIBBI-only fonts encode the weight in the family name ("Playfair Display Black").
            for n in WEIGHT_NAMES.values():
                if n != "Regular" and fam1.endswith(" " + n):
                    family = fam1[: -len(n) - 1]
                    break
        info["family"] = family or os.path.splitext(os.path.basename(path))[0]
    except (OSError, struct.error, KeyError, IndexError):
        info["family"] = info["family"] or os.path.splitext(os.path.basename(path))[0]
    return info


@lru_cache(maxsize=1)
def font_index():
    """{ normalised family: [face, ...] } plus aliases like "montserratblack" → the 900 face."""
    index = {}
    for fn in sorted(os.listdir(FONTS_DIR)) if os.path.isdir(FONTS_DIR) else []:
        if not fn.lower().endswith((".ttf", ".otf")):
            continue
        face = read_face(os.path.join(FONTS_DIR, fn))
        index.setdefault(_norm(face["family"]), []).append(face)
    # Keep one face per (weight, italic), preferring the canonical Family-Weight.ttf file name.
    for key, faces in index.items():
        best = {}
        for f in faces:
            k = (f["weight"], f["italic"])
            canonical = os.path.basename(f["path"]).startswith(f["family"].replace(" ", "") + "-")
            if k not in best or canonical:
                best[k] = f
        index[key] = sorted(best.values(), key=lambda f: (f["italic"], f["weight"]))
    return index


def families():
    """[{family, weights, italics}] for every family on disk (what the picker shows)."""
    out = []
    for faces in font_index().values():
        out.append({
            "family": faces[0]["family"],
            "weights": sorted({f["weight"] for f in faces if not f["italic"]}),
            "italics": sorted({f["weight"] for f in faces if f["italic"]}),
        })
    return sorted(out, key=lambda x: x["family"].lower())


def resolve_face(family, weight=None, italic=False):
    """
    The face to render `family` with. Nearest available weight (ties go heavier);
    a real italic when one exists, otherwise the upright face with
    `synth_italic=True` so the engine shears it like the browser does.
    """
    index = font_index()
    faces = index.get(_norm(family))
    if not faces:
        # "Montserrat Black" style requests: family + weight name.
        for n, w in ((n, w) for w, n in WEIGHT_NAMES.items()):
            key = _norm(family)
            if key.endswith(_norm(n)) and index.get(key[: -len(_norm(n))]):
                faces = index[key[: -len(_norm(n))]]
                weight = weight or w
                break
    if not faces:
        for fb in FALLBACK_FAMILIES:
            faces = index.get(_norm(fb))
            if faces:
                break
    if not faces:
        raise FileNotFoundError(f"no fonts found in {FONTS_DIR}")

    target = int(weight or DEFAULT_WEIGHT)
    pool = [f for f in faces if f["italic"] == bool(italic)] or faces
    best = min(pool, key=lambda f: (abs(f["weight"] - target), -f["weight"]))
    out = dict(best)
    out["synth_italic"] = bool(italic) and not best["italic"]
    return out
