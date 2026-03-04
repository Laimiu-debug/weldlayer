#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List


def probe_pdf_pages(path: str) -> int | None:
    try:
        from pypdf import PdfReader  # type: ignore

        return len(PdfReader(path).pages)
    except Exception:
        return None


def seam_from_file(index: int, file_obj: Dict[str, Any], detected_type: str) -> Dict[str, Any]:
    file_name = os.path.basename(file_obj.get("path", "unknown"))
    return {
        "weld_id": f"W-AUTO-{index:03d}",
        "draw_ref": file_name,
        "weld_symbol": "BW" if detected_type == "dwg" else "FW",
        "material_spec": "P-No.1",
        "thickness_mm": 12.0 + float(index),
        "position_code": "2G",
        "confidence_score": 0.65 if detected_type == "dwg" else 0.82,
    }


def parse_request(request: Dict[str, Any]) -> Dict[str, Any]:
    files: List[Dict[str, Any]] = request.get("files", [])
    seams: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    logs: List[Dict[str, str]] = [{"level": "info", "message": f"received {len(files)} files"}]

    for index, item in enumerate(files, start=1):
        path = str(item.get("path", "")).strip()
        if not path:
            errors.append(
                {
                    "code": "PARSE_EMPTY_PATH",
                    "message": "file path is empty",
                    "path": "",
                }
            )
            continue

        file_type = str(item.get("file_type", "")).lower().strip()
        if file_type not in {"pdf", "dwg"}:
            errors.append(
                {
                    "code": "PARSE_UNSUPPORTED_FILE_TYPE",
                    "message": f"unsupported file type: {file_type}",
                    "path": path,
                }
            )
            continue

        if not os.path.isfile(path):
            errors.append(
                {
                    "code": "PARSE_FILE_NOT_FOUND",
                    "message": "input file does not exist",
                    "path": path,
                }
            )
            continue

        size_bytes = os.path.getsize(path)
        logs.append(
            {
                "level": "info",
                "message": f"checked file {os.path.basename(path)} ({size_bytes} bytes, type={file_type})",
            }
        )
        if file_type == "pdf":
            page_count = probe_pdf_pages(path)
            if page_count is not None:
                logs.append(
                    {
                        "level": "info",
                        "message": f"pdf pages detected: {page_count} ({os.path.basename(path)})",
                    }
                )

        seams.append(seam_from_file(index, item, file_type))

    status = "success"
    if errors and seams:
        status = "partial"
    elif errors and not seams:
        status = "failed"

    return {
        "trace_id": request.get("trace_id", "TRC-UNKNOWN"),
        "status": status,
        "seams": seams,
        "errors": errors,
        "logs": logs,
    }


def main() -> int:
    raw = sys.stdin.read().lstrip("\ufeff").strip()
    if not raw:
        print(
            json.dumps(
                {
                    "trace_id": "TRC-EMPTY",
                    "status": "failed",
                    "seams": [],
                    "errors": [{"code": "PARSE_EMPTY_INPUT", "message": "stdin is empty", "path": ""}],
                    "logs": [{"level": "error", "message": "no input"}],
                },
                ensure_ascii=False,
            )
        )
        return 1

    try:
        request = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(
            json.dumps(
                {
                    "trace_id": "TRC-INVALID-JSON",
                    "status": "failed",
                    "seams": [],
                    "errors": [{"code": "PARSE_BAD_JSON", "message": str(exc), "path": ""}],
                    "logs": [{"level": "error", "message": "invalid json"}],
                },
                ensure_ascii=False,
            )
        )
        return 1

    response = parse_request(request)
    print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
