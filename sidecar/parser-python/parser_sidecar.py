#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import re
import sys
from typing import Any, Dict, List, Sequence, Tuple

try:
    import tomllib
except Exception:
    tomllib = None

try:
    import pdfplumber  # type: ignore
except Exception:
    pdfplumber = None

try:
    import ezdxf  # type: ignore
except Exception:
    ezdxf = None

try:
    import pytesseract  # type: ignore
except Exception:
    pytesseract = None

try:
    import numpy as np  # type: ignore
except Exception:
    np = None

try:
    from rapidocr_onnxruntime import RapidOCR  # type: ignore
except Exception:
    RapidOCR = None

WELD_HINT = re.compile(r"(weld|joint|groove|fillet|bevel|branch|\\bFW\\b|\\bBW\\b|\\bSW\\b|焊缝|焊接|接头|坡口|角焊)", re.I)
MAT_PAT = re.compile(r"P[-\\s]?No\\.?\\s*[A-Za-z0-9.+-]+", re.I)
MAT_CODE_PAT = re.compile(r"\b(?:Q\d{3,4}[A-Z]?|Q245R|Q345R|16MN(?:II)?|20R|304L?|316L?|321|15CRMO[R]?|09MNNIDR|S30408|S31603)\b", re.I)
THK_PAT = re.compile(r"(\\d+(?:\\.\\d+)?)\\s*(?:mm|MM)\\b")
X_THK_PAT = re.compile(r"[xX×]\s*(\d+(?:\.\d+)?)")
PAREN_THK_PAT = re.compile(r"[（(]\s*(\d+(?:\.\d+)?)\s*[)）]")
NUM_PAT = re.compile(r"\b(\d{1,4}(?:\.\d+)?)\b")
POS_PAT = re.compile(r"\\b([1-6](?:G|F))\\b", re.I)
WID_PAT = re.compile(r"\\bW[-_/A-Z0-9]{2,}\\b", re.I)
METHOD_PAT = re.compile(r"\b(?:SMAW|GMAW|GTAW|FCAW|SAW|MIG|MAG|TIG)\b", re.I)
FILLER_PAT = re.compile(r"\b(?:E\d{4,5}|ER\d+[A-Z0-9-]*|HJ\d{3,5}|G49[A-Z0-9-]+|S49[A-Z0-9-]+)\b", re.I)
INTERFACE_NAME_PAT = re.compile(r"(进气口|出气口|安全阀口|压力表接口|液位计口|排污口|人孔|视镜口|放空口)")
_RAPID_OCR = None
_AI_CONFIG_CACHE: Tuple[str, Dict[str, Any]] | None = None


def read_stdin_json_text() -> str:
    raw = sys.stdin.buffer.read()
    if not raw:
        return ""
    try:
        return raw.decode("utf-8-sig").strip()
    except UnicodeDecodeError:
        return raw.decode(sys.getfilesystemencoding() or "utf-8", errors="replace").strip()


def emit_json(payload: Dict[str, Any]) -> None:
    sys.stdout.buffer.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    sys.stdout.buffer.write(b"\n")


def sf(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number == number else default


def norm(value: Any) -> str:
    return " ".join(str(value or "").replace("\n", " ").split())


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def default_ai_config() -> Dict[str, Any]:
    return {
        "providers": {"ocr": "rapidocr_local", "layout": "onnx_local", "reasoning": "disabled"},
        "runtime": {
            "candidate_confidence_threshold": 0.55,
            "association_confidence_threshold": 0.7,
            "ocr_languages": ["zh", "en"],
        },
        "features": {
            "enable_ocr": True,
            "enable_layout_detection": True,
            "enable_table_extraction": True,
            "enable_llm_reasoning": False,
            "enable_cloud_api": False,
        },
        "profile": {"name": "pressure_vessel_default"},
    }


def merge_dicts(base_map: Dict[str, Any], patch_map: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base_map)
    for key, value in patch_map.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_ai_config() -> Dict[str, Any]:
    global _AI_CONFIG_CACHE
    config_path = norm(os.environ.get("WELDLAYER_AI_CONFIG_PATH"))
    if not config_path or tomllib is None or not os.path.isfile(config_path):
        return default_ai_config()
    if _AI_CONFIG_CACHE and _AI_CONFIG_CACHE[0] == config_path:
        return _AI_CONFIG_CACHE[1]
    try:
        with open(config_path, "rb") as handle:
            payload = tomllib.load(handle)
    except Exception:
        payload = {}
    config = merge_dicts(default_ai_config(), payload if isinstance(payload, dict) else {})
    _AI_CONFIG_CACHE = (config_path, config)
    return config


def ai_feature_enabled(config: Dict[str, Any], key: str, default: bool = True) -> bool:
    return bool(config.get("features", {}).get(key, default))


def ai_provider(config: Dict[str, Any], key: str, default: str) -> str:
    return norm(config.get("providers", {}).get(key, default)).lower() or default


def ai_runtime_threshold(config: Dict[str, Any], key: str, default: float) -> float:
    return clamp(sf(config.get("runtime", {}).get(key), default))


def profile_aliases(config: Dict[str, Any], key: str, fallback: Sequence[str]) -> List[str]:
    names = config.get("profile", {}).get("field_alias", {}).get(key, {}).get("names", [])
    values = [norm(item) for item in names if norm(item)]
    if values:
        return values
    return [norm(item) for item in fallback if norm(item)]


def profile_part_prefixes(config: Dict[str, Any]) -> List[str]:
    items = config.get("profile", {}).get("part_number_prefixes", [])
    values = [norm(item).upper() for item in items if norm(item)]
    return values or ["A", "B", "DN"]


def base(path: str) -> str:
    return os.path.basename(path or "")


def anc(x: float, y: float, w: float, h: float, page_index: int) -> Dict[str, Any]:
    return {"x": clamp(x), "y": clamp(y), "w": clamp(max(0.03, w)), "h": clamp(max(0.03, h)), "page_index": max(0, int(page_index))}


def anc_box(x0: float, top: float, x1: float, bottom: float, width: float, height: float, page_index: int, ex: float = 20.0, ey: float = 14.0) -> Dict[str, Any]:
    width = max(width, 1.0)
    height = max(height, 1.0)
    left = max(0.0, x0 - ex)
    top_edge = max(0.0, top - ey)
    right = min(width, x1 + ex)
    bottom_edge = min(height, bottom + ey)
    return anc(left / width, top_edge / height, (right - left) / width, (bottom_edge - top_edge) / height, page_index)


def fallback_anchor(page_index: int, slot: int = 0) -> Dict[str, Any]:
    cols = [0.18, 0.42, 0.68]
    rows = [0.24, 0.42, 0.6]
    return anc(cols[slot % len(cols)], rows[(slot // len(cols)) % len(rows)], 0.11, 0.065, page_index)


def ev(kind: str, score: float, source_ref: str, summary: str) -> Dict[str, Any]:
    return {"type": kind, "score": round(score, 2), "source_ref": source_ref, "summary": summary}


def mats(text: str) -> List[str]:
    items: List[str] = []
    for match in MAT_PAT.findall(text):
        cleaned = norm(match).replace(" ", "")
        if cleaned and cleaned not in items:
            items.append(cleaned)
    for match in MAT_CODE_PAT.findall(text):
        cleaned = norm(match).replace(" ", "").upper()
        if cleaned and cleaned not in items:
            items.append(cleaned)
    return items


def methods(text: str) -> List[str]:
    items: List[str] = []
    for match in METHOD_PAT.findall(text):
        cleaned = norm(match).upper()
        if cleaned and cleaned not in items:
            items.append(cleaned)
    return items


def fillers(text: str) -> List[str]:
    items: List[str] = []
    for match in FILLER_PAT.findall(text):
        cleaned = norm(match).upper()
        if cleaned and cleaned not in items:
            items.append(cleaned)
    return items


def thks(text: str) -> List[float]:
    values: List[float] = []
    for match in THK_PAT.findall(text):
        value = sf(match, -1.0)
        if value > 0 and value not in values:
            values.append(value)
    for match in X_THK_PAT.findall(text):
        value = sf(match, -1.0)
        if 0 < value <= 80.0 and value not in values:
            values.append(value)
    for match in PAREN_THK_PAT.findall(text):
        value = sf(match, -1.0)
        if 0 < value <= 80.0 and value not in values:
            values.append(value)
    return values


def guess_thicknesses(text: str) -> List[float]:
    values: List[float] = []
    for match in X_THK_PAT.findall(text):
        value = sf(match, -1.0)
        if 3.0 <= value <= 80.0 and value not in values:
            values.append(value)
    for match in PAREN_THK_PAT.findall(text):
        value = sf(match, -1.0)
        if 3.0 <= value <= 80.0 and value not in values:
            values.append(value)
    for match in NUM_PAT.findall(text):
        value = sf(match, -1.0)
        if value < 3.0 or value > 80.0:
            continue
        if value not in values:
            values.append(value)
    return values[:2]


def interface_names(text: str) -> List[str]:
    items: List[str] = []
    for match in INTERFACE_NAME_PAT.findall(text):
        cleaned = norm(match)
        if cleaned and cleaned not in items:
            items.append(cleaned)
    return items


def pos(text: str) -> str:
    match = POS_PAT.search(text)
    return match.group(1).upper() if match else ""


def infer_symbol(seed: str, nearby: str) -> str:
    blob = f"{seed} {nearby}".upper()
    if "BW" in blob or "GROOVE" in blob or "BEVEL" in blob or "坡口" in blob:
        return "BW"
    if "FW" in blob or "FILLET" in blob or "角焊" in blob:
        return "FW"
    if "SW" in blob:
        return "SW"
    return ""


def infer_type(seed: str, nearby: str) -> Tuple[str, str]:
    blob = f"{seed} {nearby}".lower()
    if "branch" in blob or "支管" in blob or "相贯" in blob:
        return "branch_joint", "pipe_branch"
    if "fw" in blob or "fillet" in blob or "角焊" in blob:
        return "fillet_joint", "plate_fillet"
    if "bw" in blob or "groove" in blob or "对接" in blob:
        return "butt_joint", "plate_butt"
    return "weld_candidate", "unknown"


def make_cand(candidate_id: str, draw_ref: str, page_index: int, source_kind: str, candidate_type: str, joint_geometry: str, material_a: str, material_b: str, thickness_a: float, thickness_b: float, position_code: str, weld_symbol: str, confidence: float, anchor_bbox: Dict[str, Any], evidence: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"candidate_id": candidate_id, "draw_ref": draw_ref, "sheet_no": f"S-{page_index + 1:02d}", "page_index": page_index, "source_kind": source_kind, "candidate_type": candidate_type, "joint_geometry": joint_geometry, "material_guess_a": material_a, "material_guess_b": material_b, "thickness_guess_a_mm": thickness_a, "thickness_guess_b_mm": thickness_b, "position_guess": position_code, "weld_symbol_guess": weld_symbol, "confidence_score": round(confidence, 4), "review_status": "pending" if confidence >= 0.82 else "uncertain", "anchor_bbox": anchor_bbox, "evidence": evidence[:4]}


def seam_from_cand(index: int, draw_ref: str, candidate: Dict[str, Any]) -> Dict[str, Any]:
    confidence = max(0.55, sf(candidate.get("confidence_score"), 0.65))
    evidence_text = " ".join(str(item.get("summary") or "") for item in candidate.get("evidence", []))
    weld_id = (WID_PAT.search(evidence_text).group(0).upper() if WID_PAT.search(evidence_text) else f"W-AUTO-{index:03d}")
    return {"weld_id": weld_id, "draw_ref": draw_ref, "weld_symbol": str(candidate.get("weld_symbol_guess") or ""), "material_spec": str(candidate.get("material_guess_a") or ""), "thickness_mm": sf(candidate.get("thickness_guess_a_mm"), 0.0), "position_code": str(candidate.get("position_guess") or ""), "confidence_score": round(confidence, 4), "review_status": "pending" if confidence >= 0.82 else "uncertain", "source_kind": "auto_detected", "anchor_bbox": candidate.get("anchor_bbox")}


def seam_fallback(index: int, path: str, kind: str, anchor_bbox: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return {"weld_id": f"W-AUTO-{index:03d}", "draw_ref": base(path), "weld_symbol": "", "material_spec": "", "thickness_mm": 0.0, "position_code": "", "confidence_score": 0.65 if kind == "dwg" else 0.72, "review_status": "uncertain", "source_kind": "fallback", "anchor_bbox": anchor_bbox or fallback_anchor(0, index - 1)}


def fallback_cand(file_name: str, kind: str, page_index: int, sequence_no: int, reason: str) -> Dict[str, Any]:
    return make_cand(f"WC-{sequence_no:04d}", file_name, page_index, "fallback", "weld_candidate", "unknown", "", "", 0.0, 0.0, "", "", 0.41 if kind == "pdf" else 0.5, fallback_anchor(page_index, sequence_no - 1), [ev("fallback_seed", 0.12, file_name, reason)])


def topdown_y(height: float, pdf_y: float) -> float:
    return max(0.0, min(height, height - pdf_y))


def region_box(page: Dict[str, Any], preference: str) -> Tuple[float, float, float, float]:
    width = sf(page.get("width"), 1.0)
    height = sf(page.get("height"), 1.0)
    pref = norm(preference).lower()
    if pref == "bottom_right":
        return width * 0.55, height * 0.72, width, height
    if pref == "bottom_left":
        return 0.0, height * 0.72, width * 0.55, height
    if pref == "top_right":
        return width * 0.55, 0.0, width, height * 0.28
    if pref == "top_left":
        return 0.0, 0.0, width * 0.55, height * 0.28
    if pref == "right_middle":
        return width * 0.52, height * 0.45, width, height * 0.82
    if pref == "left_middle":
        return 0.0, height * 0.45, width * 0.52, height * 0.82
    if pref == "right_bottom":
        return width * 0.52, height * 0.62, width, height
    return 0.0, 0.0, width, height


def words_in_region(page: Dict[str, Any], preference: str) -> List[Dict[str, Any]]:
    x0, y0, x1, y1 = region_box(page, preference)
    return [
        word for word in page.get("words", [])
        if x0 <= sf(word.get("cx")) <= x1 and y0 <= sf(word.get("cy")) <= y1
    ]


def build_text_lines(words: Sequence[Dict[str, Any]], y_tolerance: float = 14.0) -> List[Dict[str, Any]]:
    lines: List[Dict[str, Any]] = []
    for word in sorted(words, key=lambda item: (sf(item.get("cy")) / max(y_tolerance, 1.0), sf(item.get("x0")))):
        placed = False
        cy = sf(word.get("cy"))
        for line in lines:
            if abs(sf(line.get("cy")) - cy) <= y_tolerance:
                line["words"].append(word)
                total = len(line["words"])
                line["cy"] = ((sf(line.get("cy")) * (total - 1)) + cy) / total
                placed = True
                break
        if not placed:
            lines.append({"cy": cy, "words": [word]})
    for line in lines:
        line_words = sorted(line["words"], key=lambda item: sf(item.get("x0")))
        line["words"] = line_words
        line["text"] = " ".join(norm(item.get("text")) for item in line_words if norm(item.get("text")))
        line["x0"] = min(sf(item.get("x0")) for item in line_words)
        line["x1"] = max(sf(item.get("x1")) for item in line_words)
        line["top"] = min(sf(item.get("top")) for item in line_words)
        line["bottom"] = max(sf(item.get("bottom")) for item in line_words)
    return [line for line in lines if norm(line.get("text"))]


def line_contains_alias(line_text: str, aliases: Sequence[str]) -> bool:
    text = norm(line_text)
    return any(alias and alias in text for alias in aliases)


def extract_part_tokens(text: str, prefixes: Sequence[str]) -> List[str]:
    tokens: List[str] = []
    seen = set()
    upper = norm(text).upper()
    for prefix in prefixes:
        value = norm(prefix).upper()
        if not value:
            continue
        pattern = re.compile(rf"\b{re.escape(value)}[-_/]?\d{{1,4}}\b")
        for match in pattern.findall(upper):
            cleaned = norm(match).upper()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                tokens.append(cleaned)
    for match in re.findall(r"\b[A-Z]{1,3}-?\d{1,4}\b", upper):
        cleaned = norm(match).upper()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            tokens.append(cleaned)
    return tokens[:6]


def build_page_context(file_name: str, page: Dict[str, Any], config: Dict[str, Any], logs: List[Dict[str, str]]) -> Dict[str, Any]:
    material_aliases = profile_aliases(config, "material", ["材料", "材质", "母材"])
    thickness_aliases = profile_aliases(config, "thickness", ["厚度", "δ", "t"])
    interface_aliases = profile_aliases(config, "interface_no", ["接口号", "接口", "接管号"])
    method_aliases = profile_aliases(config, "weld_method", ["焊接方法", "焊接规程", "WPS"])
    filler_aliases = profile_aliases(config, "filler", ["焊接材料", "焊材", "焊丝"])
    part_prefixes = profile_part_prefixes(config)
    title_block_words = words_in_region(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_title_block", "bottom_right"))
    bom_words = words_in_region(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_bom_region", "bottom_left"))
    interface_words = words_in_region(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_interface_region", "right_middle"))
    requirement_words = words_in_region(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_requirement_region", "right_bottom"))
    title_lines = build_text_lines(title_block_words)
    bom_lines = build_text_lines(bom_words)
    interface_lines = build_text_lines(interface_words)
    requirement_lines = build_text_lines(requirement_words)
    contexts = title_lines + bom_lines + interface_lines + requirement_lines
    materials_found = mats(" ".join(line.get("text", "") for line in contexts))
    methods_found = methods(" ".join(line.get("text", "") for line in contexts))
    fillers_found = fillers(" ".join(line.get("text", "") for line in contexts))
    row_candidates: List[Dict[str, Any]] = []
    for region_name, lines in (("bom", bom_lines), ("interface", interface_lines), ("title_block", title_lines), ("requirement", requirement_lines)):
        for line in lines:
            text = line.get("text", "")
            row = {
                "region": region_name,
                "text": text,
                "materials": mats(text),
                "thicknesses": thks(text) or guess_thicknesses(text),
                "methods": methods(text),
                "fillers": fillers(text),
                "interfaces": interface_names(text),
                "part_tokens": extract_part_tokens(text, part_prefixes),
                "has_material_alias": line_contains_alias(text, material_aliases),
                "has_thickness_alias": line_contains_alias(text, thickness_aliases),
                "has_interface_alias": line_contains_alias(text, interface_aliases),
                "has_method_alias": line_contains_alias(text, method_aliases),
                "has_filler_alias": line_contains_alias(text, filler_aliases),
            }
            if any(
                [
                    row["materials"],
                    row["thicknesses"],
                    row["methods"],
                    row["fillers"],
                    row["interfaces"],
                    row["part_tokens"],
                    row["has_material_alias"],
                    row["has_interface_alias"],
                ]
            ):
                row_candidates.append(row)
    logs.append(
        {
            "level": "info",
            "message": f"context page {page.get('page_index', 0) + 1}: materials={','.join(materials_found[:4]) or '-'} methods={','.join(methods_found[:3]) or '-'} fillers={','.join(fillers_found[:3]) or '-'} rows={len(row_candidates)}",
        }
    )
    return {
        "materials": materials_found,
        "methods": methods_found,
        "fillers": fillers_found,
        "rows": row_candidates,
        "part_prefixes": part_prefixes,
        "title_lines": [line.get("text", "") for line in title_lines[:8]],
        "region_boxes": {
            "title_block": region_box(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_title_block", "bottom_right")),
            "bom": region_box(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_bom_region", "bottom_left")),
            "interface": region_box(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_interface_region", "right_middle")),
            "requirement": region_box(page, config.get("profile", {}).get("layout_hint", {}).get("prefer_requirement_region", "right_bottom")),
        },
    }


def point_in_box(x: float, y: float, box: Tuple[float, float, float, float]) -> bool:
    x0, y0, x1, y1 = box
    return x0 <= x <= x1 and y0 <= y <= y1


def is_candidate_seed_in_context_region(word: Dict[str, Any], context: Dict[str, Any]) -> bool:
    x = sf(word.get("cx"))
    y = sf(word.get("cy"))
    for box in (context.get("region_boxes") or {}).values():
        if point_in_box(x, y, box):
            return True
    return False


def enrich_candidate(candidate: Dict[str, Any], page: Dict[str, Any], context: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(candidate)
    evidence = list(item.get("evidence") or [])
    anchor = item.get("anchor_bbox") or {}
    width = max(sf(page.get("width"), 1.0), 1.0)
    height = max(sf(page.get("height"), 1.0), 1.0)
    cx = sf(anchor.get("x")) * width
    cy = sf(anchor.get("y")) * height
    local_words = nearby_words(page.get("words", []), cx, cy, 240.0, 130.0)
    local_text = " ".join(word.get("text", "") for word in local_words)
    local_materials = mats(local_text)
    local_thicknesses = thks(local_text) or guess_thicknesses(local_text)
    local_methods = methods(local_text)
    local_fillers = fillers(local_text)
    local_interfaces = interface_names(local_text)
    local_symbol = infer_symbol(str(item.get("candidate_type") or ""), local_text)
    local_parts = extract_part_tokens(local_text, context.get("part_prefixes", []))

    matched_row = None
    if local_parts:
        for row in context.get("rows", []):
            overlap = set(local_parts) & set(row.get("part_tokens", []))
            if overlap and (row.get("materials") or row.get("thicknesses") or row.get("interfaces")):
                matched_row = row
                break
    if not matched_row and local_interfaces:
        for row in context.get("rows", []):
            overlap = set(local_interfaces) & set(row.get("interfaces", []))
            if overlap:
                matched_row = row
                break

    confidence_bonus = 0.0
    if not norm(item.get("material_guess_a")):
        source_material = ""
        if local_materials:
            source_material = local_materials[0]
            evidence.append(ev("local_material_context", 0.18, item.get("draw_ref", ""), f"near material: {source_material}"))
            confidence_bonus += 0.04
        elif matched_row and matched_row.get("materials"):
            source_material = matched_row["materials"][0]
            evidence.append(
                ev(
                    "table_row_material_match",
                    0.24,
                    item.get("draw_ref", ""),
                    f"row match: {matched_row.get('text', '')[:120]}",
                )
            )
            confidence_bonus += 0.06
        elif context.get("materials"):
            source_material = context["materials"][0]
            evidence.append(ev("global_material_context", 0.16, item.get("draw_ref", ""), f"global material: {source_material}"))
            confidence_bonus += 0.03
        if source_material:
            item["material_guess_a"] = source_material
            item["material_guess_b"] = item.get("material_guess_b") or source_material

    if sf(item.get("thickness_guess_a_mm"), 0.0) <= 0.0:
        source_thickness = 0.0
        if local_thicknesses:
            source_thickness = local_thicknesses[0]
            evidence.append(ev("local_thickness_context", 0.18, item.get("draw_ref", ""), f"near thickness: {source_thickness:.1f}mm"))
            confidence_bonus += 0.04
        elif matched_row and matched_row.get("thicknesses"):
            source_thickness = sf(matched_row["thicknesses"][0], 0.0)
            evidence.append(ev("table_row_thickness_match", 0.22, item.get("draw_ref", ""), f"row thickness: {source_thickness:.1f}mm"))
            confidence_bonus += 0.05
        if source_thickness > 0:
            item["thickness_guess_a_mm"] = source_thickness
            item["thickness_guess_b_mm"] = sf(item.get("thickness_guess_b_mm"), 0.0) or source_thickness

    if not norm(item.get("weld_symbol_guess")) and local_symbol:
        item["weld_symbol_guess"] = local_symbol
        evidence.append(ev("local_symbol_context", 0.12, item.get("draw_ref", ""), f"near symbol: {local_symbol}"))
        confidence_bonus += 0.03

    if local_methods:
        evidence.append(ev("local_weld_method_context", 0.12, item.get("draw_ref", ""), f"near method: {' / '.join(local_methods[:2])}"))
    elif context.get("methods"):
        evidence.append(ev("global_weld_method_context", 0.08, item.get("draw_ref", ""), f"global method: {' / '.join(context.get('methods', [])[:2])}"))

    if local_fillers:
        evidence.append(ev("local_filler_context", 0.12, item.get("draw_ref", ""), f"near filler: {' / '.join(local_fillers[:2])}"))
    elif context.get("fillers"):
        evidence.append(ev("global_filler_context", 0.08, item.get("draw_ref", ""), f"global filler: {' / '.join(context.get('fillers', [])[:2])}"))

    if matched_row:
        association_label = ""
        if local_interfaces and set(local_interfaces) & set(matched_row.get("interfaces", [])):
            association_label = f"interface {'/'.join(local_interfaces[:2])}"
        elif local_parts:
            association_label = f"part tokens {'/'.join(local_parts[:3])}"
        else:
            association_label = "row context"
        evidence.append(ev("part_row_association", 0.18, item.get("draw_ref", ""), f"{association_label} -> {matched_row.get('region', '-')}: {matched_row.get('text', '')[:96]}"))
        confidence_bonus += 0.04

    if local_parts and not matched_row:
        evidence.append(ev("local_part_tokens", 0.08, item.get("draw_ref", ""), f"near part tokens: {' / '.join(local_parts[:4])}"))
    if local_interfaces and not matched_row:
        evidence.append(ev("local_interface_terms", 0.08, item.get("draw_ref", ""), f"near interface: {' / '.join(local_interfaces[:3])}"))

    item["evidence"] = evidence[:6]
    confidence = clamp(sf(item.get("confidence_score"), 0.0) + confidence_bonus)
    item["confidence_score"] = round(confidence, 4)
    item["review_status"] = "pending" if confidence >= 0.82 else "uncertain"
    return item


def get_rapid_ocr() -> Any:
    global _RAPID_OCR
    if RapidOCR is None:
        return None
    if _RAPID_OCR is None:
        _RAPID_OCR = RapidOCR()
    return _RAPID_OCR


def ocr_page_words(page: Any, page_width: float, page_height: float, config: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not ai_feature_enabled(config, "enable_ocr", True):
        return []
    provider = ai_provider(config, "ocr", "rapidocr_local")
    image = page.to_image(resolution=220).original
    image_width = max(1, int(getattr(image, "width", 1)))
    image_height = max(1, int(getattr(image, "height", 1)))
    words: List[Dict[str, Any]] = []
    if provider == "tesseract_local" and pytesseract is not None:
        try:
            languages = [lang for lang in config.get("runtime", {}).get("ocr_languages", []) if norm(lang)]
            kwargs: Dict[str, Any] = {"output_type": pytesseract.Output.DICT}
            if languages:
                kwargs["lang"] = "+".join(languages)
            data = pytesseract.image_to_data(image, **kwargs)
            for idx, text in enumerate(data.get("text", [])):
                text = norm(text)
                conf = sf(data.get("conf", [0])[idx], 0.0) / 100.0
                if not text or conf < 0.45:
                    continue
                left = sf(data.get("left", [0])[idx]); top = sf(data.get("top", [0])[idx])
                width_px = sf(data.get("width", [0])[idx], 1.0); height_px = sf(data.get("height", [0])[idx], 1.0)
                x0 = left / image_width * page_width
                x1 = (left + width_px) / image_width * page_width
                y0 = top / image_height * page_height
                y1 = (top + height_px) / image_height * page_height
                words.append({"text": text, "x0": x0, "x1": x1, "top": y0, "bottom": y1, "cx": (x0 + x1) / 2.0, "cy": (y0 + y1) / 2.0, "ocr_score": conf})
            return words
        except Exception:
            return []
    if provider != "rapidocr_local" or np is None:
        return []
    ocr = get_rapid_ocr()
    if ocr is None:
        return []
    result, _elapsed = ocr(np.array(image))
    for item in result or []:
        if len(item) < 3:
            continue
        box = item[0]
        text = norm(item[1])
        score = sf(item[2])
        if not text or score < 0.45:
            continue
        xs = [sf(point[0]) for point in box]
        ys = [sf(point[1]) for point in box]
        left = min(xs) / image_width * page_width
        right = max(xs) / image_width * page_width
        top = min(ys) / image_height * page_height
        bottom = max(ys) / image_height * page_height
        words.append({"text": text, "x0": left, "x1": right, "top": top, "bottom": bottom, "cx": (left + right) / 2.0, "cy": (top + bottom) / 2.0, "ocr_score": score})
    return words

def extract_pdf_pages(path: str, config: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    logs: List[Dict[str, str]] = []
    pages: List[Dict[str, Any]] = []
    if pdfplumber is None:
        logs.append({"level": "warn", "message": "pdfplumber unavailable; using fallback parser"})
        return pages, logs
    with pdfplumber.open(path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            width = max(1.0, sf(getattr(page, "width", 0.0), 1.0))
            height = max(1.0, sf(getattr(page, "height", 0.0), 1.0))
            try:
                words_raw = page.extract_words(x_tolerance=2, y_tolerance=3, keep_blank_chars=False, use_text_flow=True)
            except TypeError:
                words_raw = page.extract_words(x_tolerance=2, y_tolerance=3, keep_blank_chars=False)
            words = []
            for word in words_raw or []:
                text = norm(word.get("text"))
                if not text:
                    continue
                x0 = sf(word.get("x0")); x1 = sf(word.get("x1")); top = sf(word.get("top")); bottom = sf(word.get("bottom"), top + 12.0)
                words.append({"text": text, "x0": x0, "x1": x1, "top": top, "bottom": bottom, "cx": (x0 + x1) / 2.0, "cy": (top + bottom) / 2.0})
            ocr_words = []
            if len(words) < 4 and ai_feature_enabled(config, "enable_ocr", True):
                try:
                    ocr_words = ocr_page_words(page, width, height, config)
                except Exception as exc:
                    logs.append({"level": "warn", "message": f"page {page_index + 1} OCR failed: {exc}"})
                    ocr_words = []
                if ocr_words:
                    words.extend(ocr_words)
            lines = []
            for item in page.lines or []:
                x0 = sf(item.get("x0")); x1 = sf(item.get("x1")); y0 = topdown_y(height, sf(item.get("y0"))); y1 = topdown_y(height, sf(item.get("y1")))
                dx = abs(x1 - x0); dy = abs(y1 - y0); length = math.hypot(dx, dy)
                if length < 6.0:
                    continue
                orientation = "vertical" if dx <= 2.0 and dy > 0 else "horizontal" if dy <= 2.0 and dx > 0 else "diagonal"
                lines.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "length": length, "orientation": orientation, "mx": (x0 + x1) / 2.0, "my": (y0 + y1) / 2.0})
            images = []
            for obj in page.images or []:
                x0 = sf(obj.get("x0")); x1 = sf(obj.get("x1"), x0); top = sf(obj.get("top")); bottom = sf(obj.get("bottom"), top)
                if x1 > x0 and bottom > top:
                    images.append((x0, top, x1, bottom))
            curves = len(page.curves or [])
            pages.append({"page_index": page_index, "width": width, "height": height, "words": words, "lines": lines, "images": images, "is_scanned": bool(images) and not words and len(lines) < 40 and curves < 40, "page_ref": page})
            logs.append({"level": "info", "message": f"pdf page {page_index + 1}: size={width:.0f}x{height:.0f}, words={len(words)}, ocr={len(ocr_words)}, lines={len(lines)}, curves={curves}, images={len(images)}"})
    return pages, logs


def nearby_words(words: Sequence[Dict[str, Any]], x: float, y: float, rx: float = 180.0, ry: float = 96.0) -> List[Dict[str, Any]]:
    return [word for word in words if abs(sf(word.get("cx")) - x) <= rx and abs(sf(word.get("cy")) - y) <= ry]


def dedupe(candidates: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for candidate in sorted(candidates, key=lambda item: item.get("confidence_score", 0.0), reverse=True):
        anchor = candidate.get("anchor_bbox") or {}
        duplicate = False
        for current in result:
            other = current.get("anchor_bbox") or {}
            if current.get("page_index") == candidate.get("page_index") and abs(sf(other.get("x")) - sf(anchor.get("x"))) < 0.035 and abs(sf(other.get("y")) - sf(anchor.get("y"))) < 0.035:
                duplicate = True
                break
        if not duplicate:
            result.append(candidate)
    result.sort(key=lambda item: (item.get("page_index", 0), -(item.get("confidence_score", 0.0))))
    return result


def text_candidates(file_name: str, page: Dict[str, Any], start: int, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for index, word in enumerate(page["words"]):
        if not WELD_HINT.search(word["text"]):
            continue
        if is_candidate_seed_in_context_region(word, context):
            continue
        local = nearby_words(page["words"], word["cx"], word["cy"])
        nearby = " ".join(item["text"] for item in local)
        m = mats(nearby); t = thks(nearby) or guess_thicknesses(nearby); p = pos(nearby); s = infer_symbol(word["text"], nearby); ctype, geom = infer_type(word["text"], nearby)
        conf = min(0.95, 0.42 + (0.16 if WELD_HINT.search(word["text"]) else 0.0) + (0.16 if re.search(r"\\b(FW|BW|SW)\\b", nearby, re.I) else 0.0) + (0.08 if m else 0.0) + (0.08 if t else 0.0) + (0.05 if p else 0.0))
        src = f"{file_name}#page{page['page_index'] + 1}"
        evidence = [ev("text_hit", min(0.6, conf), src, f"text hit: {word['text']}")]
        if m: evidence.append(ev("material_label_nearby", 0.22, src, f"near material: {' / '.join(m[:2])}"))
        if t: evidence.append(ev("thickness_label_nearby", 0.18, src, f"near thickness: {' / '.join(f'{value:.1f}mm' for value in t[:2])}"))
        if p: evidence.append(ev("position_label_nearby", 0.14, src, f"near position: {p}"))
        out.append(make_cand(f"WC-{start + len(out):04d}", file_name, page["page_index"], "pdf_text", ctype, geom, m[0] if m else "", m[1] if len(m) > 1 else (m[0] if m else ""), t[0] if t else 0.0, t[1] if len(t) > 1 else (t[0] if t else 0.0), p, s, conf, anc_box(word["x0"], word["top"], word["x1"], word["bottom"], page["width"], page["height"], page["page_index"]), evidence))
        if len(out) >= 8:
            break
    return out


def leader_candidates(file_name: str, page: Dict[str, Any], start: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    w = page["width"]; h = page["height"]
    for line in page["lines"]:
        if line["orientation"] != "diagonal" or line["length"] < 18.0 or line["length"] > 240.0:
            continue
        dx = abs(line["x1"] - line["x0"]); dy = abs(line["y1"] - line["y0"])
        if dx < 10.0 or dy < 10.0:
            continue
        ratio = dx / max(dy, 1.0)
        if ratio < 0.18 or ratio > 5.5:
            continue
        tip_x, tip_y = (line["x0"], line["y0"]) if line["y0"] > line["y1"] else (line["x1"], line["y1"])
        if tip_x < w * 0.05 or tip_x > w * 0.95 or tip_y < h * 0.05 or tip_y > h * 0.95:
            continue
        local = nearby_words(page["words"], tip_x, tip_y, 260.0, 150.0)
        nearby = " ".join(word["text"] for word in local)
        m = mats(nearby); t = thks(nearby) or guess_thicknesses(nearby); p = pos(nearby); s = infer_symbol("", nearby)
        conf = min(0.83, 0.62 + min(0.14, line["length"] / 800.0) + (0.06 if nearby else 0.0))
        src = f"{file_name}#page{page['page_index'] + 1}"
        evidence = [ev("leader_line", 0.45, src, f"diagonal segment len={line['length']:.1f}")]
        if nearby: evidence.append(ev("leader_nearby_notes", 0.16, src, nearby[:120]))
        out.append(make_cand(f"WC-{start + len(out):04d}", file_name, page["page_index"], "pdf_leader", "leader_joint", "leader_target", m[0] if m else "", m[1] if len(m) > 1 else (m[0] if m else ""), t[0] if t else 0.0, t[1] if len(t) > 1 else (t[0] if t else 0.0), p, s, conf, anc_box(tip_x - 10.0, tip_y - 10.0, tip_x + 10.0, tip_y + 10.0, w, h, page["page_index"], 0.0, 0.0), evidence))
        if len(out) >= 6:
            break
    return out

def geometry_candidates(file_name: str, page: Dict[str, Any], start: int) -> List[Dict[str, Any]]:
    lines = page["lines"]
    if not lines:
        return []
    cols = 7; rows = 7; w = page["width"]; h = page["height"]
    cells: Dict[Tuple[int, int], Dict[str, Any]] = {}
    def add_point(x: float, y: float, orientation: str, weight: float) -> None:
        if x < w * 0.06 or x > w * 0.94 or y < h * 0.08 or y > h * 0.92:
            return
        col = min(cols - 1, max(0, int(x / w * cols))); row = min(rows - 1, max(0, int(y / h * rows)))
        cell = cells.setdefault((row, col), {"count": 0.0, "x": 0.0, "y": 0.0, "orientations": set()})
        cell["count"] += weight; cell["x"] += x * weight; cell["y"] += y * weight; cell["orientations"].add(orientation)
    for line in lines:
        if line["length"] < 12.0:
            continue
        weight = 1.0 if line["orientation"] != "diagonal" else 1.35
        if line["length"] > 90.0:
            weight += 0.25
        add_point(line["x0"], line["y0"], line["orientation"], weight); add_point(line["x1"], line["y1"], line["orientation"], weight)
    ranked = sorted(((cell["count"] + max(0, len(cell["orientations"]) - 1) * 1.2, row, col, cell) for (row, col), cell in cells.items()), reverse=True)
    if not ranked:
        return []
    best = ranked[0][0]; out: List[Dict[str, Any]] = []
    for score, row, col, cell in ranked[:4]:
        if score < 3.0 or score < best * 0.42:
            continue
        cx = sf(cell["x"]) / max(sf(cell["count"]), 1.0); cy = sf(cell["y"]) / max(sf(cell["count"]), 1.0)
        local = nearby_words(page["words"], cx, cy, 220.0, 120.0); nearby = " ".join(word["text"] for word in local)
        m = mats(nearby); t = thks(nearby) or guess_thicknesses(nearby); p = pos(nearby); s = infer_symbol("", nearby); ctype, geom = infer_type("", nearby)
        conf = min(0.79, 0.52 + (score / max(best, 1.0)) * 0.2 + max(0, len(cell["orientations"]) - 1) * 0.04)
        src = f"{file_name}#page{page['page_index'] + 1}"
        evidence = [ev("geometry_endpoint_cluster", min(0.48, conf), src, f"endpoint cluster row={row + 1} col={col + 1} orientations={','.join(sorted(cell['orientations']))}")]
        if nearby: evidence.append(ev("nearby_notes", 0.12, src, nearby[:120]))
        out.append(make_cand(f"WC-{start + len(out):04d}", file_name, page["page_index"], "pdf_geometry", ctype, geom if geom != "unknown" else "geometry_cluster", m[0] if m else "", m[1] if len(m) > 1 else (m[0] if m else ""), t[0] if t else 0.0, t[1] if len(t) > 1 else (t[0] if t else 0.0), p, s, conf, anc_box(cx - 20.0, cy - 16.0, cx + 20.0, cy + 16.0, w, h, page["page_index"], 0.0, 0.0), evidence))
    return out


def density_candidates(file_name: str, page: Dict[str, Any], start: int) -> List[Dict[str, Any]]:
    lines = page["lines"]
    if not lines:
        return []
    cols = 6; rows = 6; w = page["width"]; h = page["height"]
    scores = [[0.0 for _ in range(cols)] for _ in range(rows)]
    for line in lines:
        x = line["mx"]; y = line["my"]
        if x < w * 0.08 or x > w * 0.92 or y < h * 0.08 or y > h * 0.92:
            continue
        col = min(cols - 1, max(0, int(x / w * cols))); row = min(rows - 1, max(0, int(y / h * rows)))
        weight = 1.0 + (0.2 if line["orientation"] == "diagonal" else 0.0) + (0.4 if line["length"] > 60.0 else 0.0)
        scores[row][col] += weight
    ranked = sorted(((scores[row][col], row, col) for row in range(rows) for col in range(cols)), reverse=True)
    if not ranked or ranked[0][0] <= 0:
        return []
    best = ranked[0][0]; out: List[Dict[str, Any]] = []
    for score, row, col in ranked[:3]:
        if score < best * 0.35:
            continue
        conf = min(0.74, 0.46 + (score / max(best, 1.0)) * 0.22)
        out.append(make_cand(f"WC-{start + len(out):04d}", file_name, page["page_index"], "pdf_vector_density", "weld_candidate", "vector_cluster", "", "", 0.0, 0.0, "", "", conf, anc((col + 0.18) / cols, (row + 0.2) / rows, 0.12, 0.075, page["page_index"]), [ev("vector_density_cluster", min(0.4, conf), f"{file_name}#page{page['page_index'] + 1}", f"dense vector grid row={row + 1} col={col + 1} weight={score:.1f}")]))
    return out


def scan_candidates(file_name: str, page: Dict[str, Any], start: int, logs: List[Dict[str, str]], config: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not page["is_scanned"]:
        return []
    src = f"{file_name}#page{page['page_index'] + 1}"
    if ai_feature_enabled(config, "enable_ocr", True) and pytesseract is not None:
        try:
            image = page["page_ref"].to_image(resolution=150).original
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
            out: List[Dict[str, Any]] = []
            for idx, text in enumerate(data.get("text", [])):
                text = norm(text)
                if not text or not WELD_HINT.search(text):
                    continue
                left = sf(data.get("left", [0])[idx]); top = sf(data.get("top", [0])[idx]); width_px = sf(data.get("width", [0])[idx], 1.0); height_px = sf(data.get("height", [0])[idx], 1.0)
                out.append(make_cand(f"WC-{start + len(out):04d}", file_name, page["page_index"], "pdf_scan_ocr", "weld_candidate", "scan_text", "", "", 0.0, 0.0, pos(text), infer_symbol(text, text), 0.64, anc(left / image.width, top / image.height, width_px / image.width, height_px / image.height, page["page_index"]), [ev("ocr_text_hit", 0.36, src, f"ocr hit: {text}")]))
            if out:
                logs.append({"level": "info", "message": f"scan OCR produced {len(out)} candidates for {src}"})
                return out
        except Exception as exc:
            logs.append({"level": "warn", "message": f"scan OCR unavailable for {src}: {exc}"})
    out = []
    for box in page["images"][:2]:
        x0, top, x1, bottom = box
        out.append(make_cand(f"WC-{start + len(out):04d}", file_name, page["page_index"], "pdf_scan_region", "weld_candidate", "scan_region", "", "", 0.0, 0.0, "", "", 0.44, anc_box(x0, top, x1, bottom, page["width"], page["height"], page["page_index"], 0.0, 0.0), [ev("scan_page_region", 0.16, src, "scan page detected, OCR unavailable; seeded image region candidate")]))
    if out:
        logs.append({"level": "warn", "message": f"scan page fallback produced {len(out)} candidates for {src}"})
    return out

def parse_pdf_file(path: str, logs: List[Dict[str, str]], config: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    file_name = base(path)
    pages, probe_logs = extract_pdf_pages(path, config)
    logs.extend(probe_logs)
    page_map = {int(page.get("page_index", 0)): page for page in pages}
    page_contexts = {
        int(page.get("page_index", 0)): build_page_context(file_name, page, config, logs) for page in pages
    }
    candidates: List[Dict[str, Any]] = []
    seq = 1
    for page in pages:
        context = page_contexts.get(int(page.get("page_index", 0)), {})
        items = text_candidates(file_name, page, seq, context)
        candidates.extend(items)
        seq += len(items)
        for producer in (leader_candidates, geometry_candidates) if ai_feature_enabled(config, "enable_layout_detection", True) else (leader_candidates,):
            items = producer(file_name, page, seq)
            candidates.extend(items)
            seq += len(items)
        scans = scan_candidates(file_name, page, seq, logs, config)
        candidates.extend(scans)
        seq += len(scans)
        if ai_feature_enabled(config, "enable_layout_detection", True) and (
            not candidates or candidates[-1].get("page_index") != page["page_index"]
        ):
            dense = density_candidates(file_name, page, seq)
            candidates.extend(dense)
            seq += len(dense)
    candidates = dedupe(candidates)
    candidates = [
        enrich_candidate(candidate, page_map.get(int(candidate.get("page_index", 0)), pages[0] if pages else {}), page_contexts.get(int(candidate.get("page_index", 0)), {}), config)
        for candidate in candidates
    ]
    threshold = ai_runtime_threshold(config, "candidate_confidence_threshold", 0.55)
    filtered = [candidate for candidate in candidates if sf(candidate.get("confidence_score"), 0.0) >= threshold]
    if filtered:
        candidates = filtered
        logs.append({"level": "info", "message": f"candidate threshold applied: {threshold:.2f}, kept {len(candidates)} anchors for {file_name}"})
    elif candidates:
        candidates = candidates[:1]
        logs.append({"level": "warn", "message": f"candidate threshold {threshold:.2f} removed all anchors for {file_name}; kept top candidate as fallback"})
    if not candidates:
        candidates.append(fallback_cand(file_name, "pdf", 0, seq, "no anchored PDF features found; emitted low-confidence fallback candidate"))
        logs.append({"level": "warn", "message": f"no anchored pdf hits for {file_name}; emitted fallback candidate"})
    else:
        logs.append({"level": "info", "message": f"detected {len(candidates)} candidate anchors in {file_name}"})
    seams = [seam_from_cand(index, file_name, candidate) for index, candidate in enumerate(candidates[:3], start=1)]
    if not seams:
        seams.append(seam_fallback(1, path, "pdf", candidates[0].get("anchor_bbox") if candidates else None))
    logs.append({"level": "info", "message": f"inferred {len(seams)} explicit seams in {file_name}"})
    return seams, candidates


def parse_dwg_file(path: str, logs: List[Dict[str, str]], seq: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    file_name = base(path)
    if ezdxf is None:
        logs.append({"level": "warn", "message": f"ezdxf unavailable; using DWG fallback for {file_name}"})
        cand = fallback_cand(file_name, "dwg", 0, seq, "DWG parser unavailable; install ezdxf to enable entity-based detection")
        return [seam_fallback(seq, path, "dwg", cand["anchor_bbox"])], [cand]
    try:
        doc = ezdxf.readfile(path)
        msp = doc.modelspace()
    except Exception as exc:
        logs.append({"level": "warn", "message": f"DWG parse failed for {file_name}: {exc}; using fallback"})
        cand = fallback_cand(file_name, "dwg", 0, seq, "DWG parse failed; emitted fallback candidate")
        return [seam_fallback(seq, path, "dwg", cand["anchor_bbox"])], [cand]
    texts: List[Tuple[str, float, float]] = []
    for entity in msp.query("TEXT MTEXT"):
        text = norm(entity.plain_text() if hasattr(entity, "plain_text") else entity.dxf.text)
        insert = getattr(entity.dxf, "insert", None)
        if text and insert is not None:
            texts.append((text, sf(insert.x), sf(insert.y)))
    if not texts:
        logs.append({"level": "warn", "message": f"DWG contained no text entities for {file_name}; using fallback"})
        cand = fallback_cand(file_name, "dwg", 0, seq, "DWG contained no text entities; emitted fallback candidate")
        return [seam_fallback(seq, path, "dwg", cand["anchor_bbox"])], [cand]
    xs = [item[1] for item in texts]; ys = [item[2] for item in texts]; min_x = min(xs); max_x = max(xs); min_y = min(ys); max_y = max(ys)
    width = max(1.0, max_x - min_x); height = max(1.0, max_y - min_y)
    candidates: List[Dict[str, Any]] = []
    for text, x, y in texts:
        if not WELD_HINT.search(text):
            continue
        anchor = anc((x - min_x) / width, 1.0 - ((y - min_y) / height), 0.1, 0.06, 0)
        candidates.append(make_cand(f"WC-{seq + len(candidates):04d}", file_name, 0, "dwg_text", "weld_candidate", "dwg_annotation", "P-No.1", "P-No.1", 12.0, 12.0, "5G", infer_symbol(text, text), 0.66, anchor, [ev("dwg_text_hit", 0.34, file_name, f"text entity: {text}")]))
        if len(candidates) >= 4:
            break
    if not candidates:
        candidates.append(fallback_cand(file_name, "dwg", 0, seq, "DWG loaded but no weld-like text found; emitted fallback candidate"))
    seams = [seam_from_cand(index, file_name, candidate) for index, candidate in enumerate(candidates[:3], start=1)]
    logs.append({"level": "info", "message": f"DWG parser produced {len(candidates)} candidates for {file_name}"})
    return seams, candidates


def parse_request(request: Dict[str, Any]) -> Dict[str, Any]:
    config = load_ai_config()
    files: List[Dict[str, Any]] = request.get("files", [])
    seams: List[Dict[str, Any]] = []
    candidates: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    logs: List[Dict[str, str]] = [
        {"level": "info", "message": f"received {len(files)} files"},
        {
            "level": "info",
            "message": "ai config: "
            + f"profile={norm(config.get('profile', {}).get('name')) or 'default'}, "
            + f"ocr={ai_provider(config, 'ocr', 'rapidocr_local')}, "
            + f"layout={ai_provider(config, 'layout', 'onnx_local')}, "
            + f"reasoning={ai_provider(config, 'reasoning', 'disabled')}",
        },
    ]
    next_seq = 1
    for index, item in enumerate(files, start=1):
        path = str(item.get("path", "")).strip(); file_type = str(item.get("file_type", "")).lower().strip()
        if not path:
            errors.append({"code": "PARSE_EMPTY_PATH", "message": "file path is empty", "path": ""}); continue
        if file_type not in {"pdf", "dwg"}:
            errors.append({"code": "PARSE_UNSUPPORTED_FILE_TYPE", "message": f"unsupported file type: {file_type}", "path": path}); continue
        if not os.path.isfile(path):
            errors.append({"code": "PARSE_FILE_NOT_FOUND", "message": "input file does not exist", "path": path}); continue
        logs.append({"level": "info", "message": f"checked file {base(path)} ({os.path.getsize(path)} bytes, type={file_type})"})
        try:
            file_seams, file_candidates = parse_pdf_file(path, logs, config) if file_type == "pdf" else parse_dwg_file(path, logs, next_seq)
        except Exception as exc:
            errors.append({"code": "PARSE_ANALYSIS_FAILED", "message": str(exc), "path": path})
            logs.append({"level": "error", "message": f"parse failed for {base(path)}: {exc}"})
            continue
        seams.extend(file_seams); candidates.extend(file_candidates); next_seq += len(file_candidates)
    status = "success"
    if errors and (seams or candidates):
        status = "partial"
    elif errors and not seams and not candidates:
        status = "failed"
    return {"trace_id": request.get("trace_id", "TRC-UNKNOWN"), "status": status, "seams": seams, "candidates": candidates, "errors": errors, "logs": logs}


def main() -> int:
    raw = read_stdin_json_text()
    if not raw:
        emit_json({"trace_id": "TRC-EMPTY", "status": "failed", "seams": [], "candidates": [], "errors": [{"code": "PARSE_EMPTY_INPUT", "message": "stdin is empty", "path": ""}], "logs": [{"level": "error", "message": "no input"}]})
        return 1
    try:
        request = json.loads(raw)
    except json.JSONDecodeError as exc:
        emit_json({"trace_id": "TRC-INVALID-JSON", "status": "failed", "seams": [], "candidates": [], "errors": [{"code": "PARSE_BAD_JSON", "message": str(exc), "path": ""}], "logs": [{"level": "error", "message": "invalid json"}]})
        return 1
    emit_json(parse_request(request))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
