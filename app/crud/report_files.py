"""Excel and CSV files from a ReportTable."""
import csv
import re
from datetime import date, datetime, timezone
from io import BytesIO, StringIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

from app.crud.reports import CREATED_AT_IS_NAIVE_UTC, REPORT_TZ
from app.schemas.report_tables import ReportTable

NUMBER_FORMATS = {
    "money": "#,##0.00", "int": "#,##0", "percent": "0.0%",
    "date": "yyyy-mm-dd", "datetime": "yyyy-mm-dd hh:mm",
}
_NUMBERLIKE = re.compile(r"[+\-]?[\d\s().\-]+")   # phone numbers are text, but harmless
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _local(value: datetime) -> datetime:
    """Stored time -> business-local wall-clock time (what a person expects to read)."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc if CREATED_AT_IS_NAIVE_UTC else REPORT_TZ)
    return value.astimezone(REPORT_TZ).replace(tzinfo=None)


def _csv_text(value) -> str:
    s = str(value)
    if s.startswith(_FORMULA_START) and not _NUMBERLIKE.fullmatch(s):
        return "'" + s          # CSV has no "this is text" flag, so a quote prefix it is
    return s


def _cell(col_type: str, value):
    if value is None or value == "":
        return None
    if col_type == "datetime":
        return _local(value if isinstance(value, datetime) else datetime.fromisoformat(str(value)))
    if col_type == "date":
        return value.date() if isinstance(value, datetime) else value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
    if col_type in ("money", "int", "percent"):
        return value
    return str(value)


def to_xlsx(table: ReportTable, exported_by: str) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = table.title[:31]
    cols = table.columns
    n_cols = len(cols)

    # ---- header block
    ws.append([table.title])
    ws["A1"].font = Font(bold=True, size=14)
    for line in table.filters:
        ws.append([line])
    ws.append([f"Generated {_local(table.generated_at):%Y-%m-%d %H:%M} by {exported_by}"])
    if table.truncated:
        ws.append([f"Only the first {len(table.rows)} of {table.total} rows are included. Narrow the filters to get the rest."])
        ws.cell(row=ws.max_row, column=1).font = Font(bold=True, color="B91C1C")
    ws.append([])

    # ---- column headers
    header_row = ws.max_row + 1
    ws.append([c.label for c in cols])
    fill = PatternFill("solid", start_color="EA580C")
    for i in range(1, n_cols + 1):
        cell = ws.cell(row=header_row, column=i)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = fill
        cell.alignment = Alignment(
            horizontal="right" if cols[i - 1].type in ("money", "int", "percent") else "left", vertical="center"
        )

    # ---- data
    for row in table.rows:
        ws.append([_cell(c.type, row.get(c.key)) for c in cols])
        r = ws.max_row
        for i, c in enumerate(cols, start=1):
            cell = ws.cell(row=r, column=i)
            if c.type in NUMBER_FORMATS:
                cell.number_format = NUMBER_FORMATS[c.type]
            elif isinstance(cell.value, str) and cell.value.startswith("="):
                cell.data_type = "s"     # keep it text; never a formula
    last_data_row = ws.max_row

    # ---- totals
    if table.totals:
        values = []
        for i, c in enumerate(cols):
            v = table.totals.get(c.key)
            values.append(("Total" if i == 0 else None) if v is None else _cell(c.type, v))
        ws.append(values)
        r = ws.max_row
        top = Border(top=Side(style="thin"))
        for i, c in enumerate(cols, start=1):
            cell = ws.cell(row=r, column=i)
            cell.font = Font(bold=True)
            cell.border = top
            if c.type in NUMBER_FORMATS:
                cell.number_format = NUMBER_FORMATS[c.type]

    # ---- usability
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    if table.rows:
        ws.auto_filter.ref = f"A{header_row}:{get_column_letter(n_cols)}{last_data_row}"
    for i, c in enumerate(cols, start=1):
        sample = [len(c.label)] + [len(str(r.get(c.key) or "")) for r in table.rows[:200]]
        width = max(sample) + 2
        ws.column_dimensions[get_column_letter(i)].width = max(12, min(width, 48))
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.print_title_rows = f"{header_row}:{header_row}"

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def to_csv(table: ReportTable) -> bytes:
    """Header + rows only (no totals), so it loads cleanly into a pivot table or BI tool."""
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow([c.label + (" (%)" if c.type == "percent" else "") for c in table.columns])
    for row in table.rows:
        out = []
        for c in table.columns:
            v = row.get(c.key)
            if v is None:
                out.append("")
            elif c.type == "money":
                out.append(f"{float(v):.2f}")
            elif c.type == "percent":
                out.append(f"{float(v) * 100:.2f}")
            elif c.type == "datetime":
                out.append(f"{_local(v if isinstance(v, datetime) else datetime.fromisoformat(str(v))):%Y-%m-%d %H:%M}")
            elif c.type == "date":
                out.append(str(v)[:10])
            elif c.type == "int":
                out.append(str(int(v)))
            else:
                out.append(_csv_text(v))
        writer.writerow(out)
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")   # BOM so Excel reads UTF-8 correctly