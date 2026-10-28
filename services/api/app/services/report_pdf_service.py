"""Dependency-free, branded PDF rendering for canonical reports.

This writer intentionally accepts a prepared DataFrame. CSV, JSON and PDF
therefore share one filtered Python result and cannot introduce a second
calculation path. The logo is drawn as vector artwork, so the API image needs
no font, browser or document-rendering runtime.
"""

from __future__ import annotations

import math
import re
from typing import Any

import pandas as pd

from app.schemas.filters import AnalyticsFilters

PAGE_WIDTH = 595
PAGE_HEIGHT = 842
MARGIN = 42
FOREST = (0.027, 0.239, 0.176)
INK = (0.141, 0.204, 0.278)
MUTED = (0.40, 0.45, 0.52)
LINE = (0.84, 0.89, 0.87)
PALE_GREEN = (0.92, 0.97, 0.95)


def _text(value: Any) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "-"
    try:
        if pd.isna(value):
            return "-"
    except (TypeError, ValueError):
        pass
    rendered = str(value)
    replacements = {"–": "-", "—": "-", "×": "x", "·": "-", "’": "'", "“": '"', "”": '"'}
    for source, target in replacements.items():
        rendered = rendered.replace(source, target)
    return rendered.encode("latin-1", "replace").decode("latin-1")


def _escape(value: Any) -> str:
    return _text(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _number(value: Any) -> str:
    if isinstance(value, float) and not math.isnan(value):
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    if isinstance(value, int):
        return f"{value:,}"
    return _text(value)


def _period_label(filters: AnalyticsFilters) -> str:
    if filters.period_code:
        return f"{filters.period_code[:4]} Season {filters.period_code[4:]}"
    return "All published periods"


def _scope_text(filters: AnalyticsFilters) -> str:
    parts = [_period_label(filters), f"Crop: {filters.crop or 'All crops'}"]
    if filters.province:
        parts.append(f"Province: {filters.province}")
    parts.append(f"District: {filters.district or 'All districts'}")
    parts.append(f"Benchmark: {filters.benchmark_strategy.replace('_', ' ')}")
    return "  |  ".join(_text(part) for part in parts)


def _display_columns(frame: pd.DataFrame) -> list[str]:
    preferred = [
        "period", "period_code", "district", "province", "crop",
        "canonical_crop_name", "indicator", "value", "unit",
        "yield_kg_ha", "benchmark_yield_kg_ha", "gap_index",
        "production_mt", "harvested_area_ha", "priority_score",
        "source_id", "quality_flag",
    ]
    columns = [column for column in preferred if column in frame.columns]
    return (columns or list(frame.columns))[:8]


def _label(column: str) -> str:
    labels = {
        "period": "Period", "period_code": "Period",
        "canonical_crop_name": "Crop", "crop": "Crop",
        "district": "District", "province": "Province",
        "indicator": "Indicator", "value": "Value", "unit": "Unit",
        "yield_kg_ha": "Yield kg/ha", "benchmark_yield_kg_ha": "Benchmark kg/ha",
        "gap_index": "Gap %", "production_mt": "Production mt",
        "harvested_area_ha": "Harvested area ha", "priority_score": "Priority score",
        "source_id": "Source", "quality_flag": "Quality",
    }
    return labels.get(column, re.sub(r"_+", " ", column).title())


def _command_text(x: float, y: float, size: float, value: Any, color: tuple[float, float, float] = INK) -> str:
    r, g, b = color
    return f"BT /F1 {size:g} Tf {r:g} {g:g} {b:g} rg {x:g} {y:g} Td ({_escape(value)}) Tj ET"


def _wrapped_commands(
    x: float,
    y: float,
    size: float,
    value: Any,
    max_chars: int,
    leading: float,
    color: tuple[float, float, float] = INK,
) -> tuple[list[str], float]:
    words = _text(value).split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current or not lines:
        lines.append(current)
    commands = [_command_text(x, y - index * leading, size, line, color) for index, line in enumerate(lines)]
    return commands, y - len(lines) * leading


def _summary(frame: pd.DataFrame) -> list[tuple[str, str]]:
    periods: set[str] = set()
    for column in ("period", "period_code"):
        if column in frame.columns:
            periods.update(_text(value) for value in frame[column].dropna().unique())
    crop_column = "crop" if "crop" in frame.columns else "canonical_crop_name"
    return [
        ("Rows", _number(len(frame))),
        ("Periods", _number(len(periods) or "-")),
        ("Districts", _number(frame["district"].nunique()) if "district" in frame.columns else "-"),
        ("Crops", _number(frame[crop_column].nunique()) if crop_column in frame.columns else "-"),
    ]


def _page_commands(
    *,
    report_key: str,
    title: str,
    coverage_note: str,
    frame: pd.DataFrame,
    filters: AnalyticsFilters,
    generated_label: str,
    rows: list[dict[str, Any]],
    columns: list[str],
    page_number: int,
    page_count: int,
    first_row: int,
) -> bytes:
    commands = [
        "q",
        f"{FOREST[0]} {FOREST[1]} {FOREST[2]} rg {MARGIN} 758 54 28 re f",
        "1 1 1 RG 2 w 47 764 m 56 777 l 64 766 l S",
        _command_text(110, 771, 15, "CROPMATICS", FOREST),
        _command_text(110, 760, 6.5, "Crop intelligence from data to action", MUTED),
        "Q",
        _command_text(MARGIN, 726, 18, title, FOREST),
        _command_text(MARGIN, 711, 8, "Decision brief generated from the verified reporting layer", MUTED),
        f"{PALE_GREEN[0]} {PALE_GREEN[1]} {PALE_GREEN[2]} rg {MARGIN} 660 511 33 re f",
        f"{LINE[0]} {LINE[1]} {LINE[2]} RG 0.6 w {MARGIN} 660 511 33 re S",
        _command_text(MARGIN + 10, 682, 6.5, "REPORT SCOPE", MUTED),
    ]
    scope_commands, _ = _wrapped_commands(MARGIN + 10, 671, 8, _scope_text(filters), 91, 10)
    commands.extend(scope_commands)

    card_width = 127.75
    for index, (label, value) in enumerate(_summary(frame)):
        x = MARGIN + index * card_width
        commands.extend([
            f"1 1 1 rg {x:g} 611 {card_width - 4:g} 34 re f",
            f"{LINE[0]} {LINE[1]} {LINE[2]} RG 0.5 w {x:g} 611 {card_width - 4:g} 34 re S",
            _command_text(x + 7, 634, 6.5, label, MUTED),
            _command_text(x + 7, 621, 11, value, FOREST),
        ])

    source_values = []
    if "source_id" in frame.columns:
        source_values = sorted({_text(value) for value in frame["source_id"].dropna().unique()})
    commands.extend([
        _command_text(MARGIN, 590, 9.5, "Evidence", FOREST),
    ])
    evidence = "Sources: " + (", ".join(source_values) if source_values else "source metadata is not present in this table")
    evidence_commands, evidence_y = _wrapped_commands(MARGIN, 576, 7.5, evidence + ". Official statistics and voluntary operational data remain separate.", 104, 9, MUTED)
    commands.extend(evidence_commands)
    coverage_commands, table_top = _wrapped_commands(MARGIN, evidence_y - 7, 7.5, coverage_note, 104, 9, MUTED)
    commands.extend(coverage_commands)

    if not columns:
        commands.append(_command_text(MARGIN, table_top - 18, 10, "No verified rows match this scope.", FOREST))
    else:
        table_y = min(table_top - 18, 518)
        table_width = 511
        column_width = table_width / len(columns)
        header_height = 24
        row_height = 15
        commands.extend([
            _command_text(MARGIN, table_y + 10, 9.5, "Report rows", FOREST),
            f"{FOREST[0]} {FOREST[1]} {FOREST[2]} rg {MARGIN} {table_y - header_height} {table_width} {header_height} re f",
        ])
        for index, column in enumerate(columns):
            x = MARGIN + index * column_width + 4
            commands.append(_command_text(x, table_y - 16, 6.2, _label(column), (1, 1, 1)))
        row_start = table_y - header_height
        for row_index, row in enumerate(rows):
            y = row_start - row_index * row_height
            background = "1 1 1" if row_index % 2 == 0 else "0.97 0.98 0.97"
            commands.append(f"{background} rg {MARGIN} {y - row_height} {table_width} {row_height} re f")
            for column_index, column in enumerate(columns):
                value = row.get(column)
                rendered = _number(value) if isinstance(value, int | float) else _text(value)
                max_chars = max(7, int(column_width / 4.1))
                if len(rendered) > max_chars:
                    rendered = rendered[: max_chars - 3] + "..."
                commands.append(_command_text(MARGIN + column_index * column_width + 4, y - 11, 6.2, rendered, INK))
            commands.append(f"{LINE[0]} {LINE[1]} {LINE[2]} RG 0.25 w {MARGIN} {y - row_height} {table_width} {row_height} re S")

    if first_row + len(rows) < len(frame):
        note = f"Showing rows {first_row + 1}-{first_row + len(rows)} of {len(frame)}. Download CSV for the complete filtered export."
    else:
        note = f"{len(frame)} row(s) in this filtered report."
    commands.extend([
        _command_text(MARGIN, 57, 7, note, MUTED),
        _command_text(MARGIN, 42, 7, f"Generated {generated_label}. Missing values remain unavailable.", MUTED),
        f"{LINE[0]} {LINE[1]} {LINE[2]} RG 0.6 w {MARGIN} 30 m {PAGE_WIDTH - MARGIN} 30 l S",
        _command_text(MARGIN, 18, 7, "Cropmatics | Official data, transparent methods", MUTED),
        _command_text(485, 18, 7, f"Page {page_number}/{page_count}", MUTED),
    ])
    return ("\n".join(commands) + "\n").encode("latin-1", "replace")


def build_report_pdf(
    *,
    report_key: str,
    title: str,
    coverage_note: str,
    frame: pd.DataFrame,
    filters: AnalyticsFilters,
    generated_label: str,
) -> bytes:
    """Build a valid, paginated PDF with a vector Cropmatics logo."""
    columns = _display_columns(frame) if not frame.empty else []
    records = frame.to_dict(orient="records") if not frame.empty else []
    rows_per_page = 25
    chunks = [records[index : index + rows_per_page] for index in range(0, len(records), rows_per_page)] or [[]]
    streams = [
        _page_commands(
            report_key=report_key,
            title=title,
            coverage_note=coverage_note,
            frame=frame,
            filters=filters,
            generated_label=generated_label,
            rows=chunk,
            columns=columns,
            page_number=index + 1,
            page_count=len(chunks),
            first_row=index * rows_per_page,
        )
        for index, chunk in enumerate(chunks)
    ]

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",  # filled after page references are known
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    page_ids = []
    for stream in streams:
        page_id = len(objects) + 1
        content_id = page_id + 1
        page_ids.append(page_id)
        objects.extend([
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>".encode(),
            b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        ])
    objects[1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(page_ids)} >>"
    ).encode()

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    )
    return bytes(pdf)
