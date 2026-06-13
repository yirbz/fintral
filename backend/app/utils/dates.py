"""
Centralized datetime module.

ALL internal dates are stored as timezone-aware UTC datetimes.
The database stores TIMESTAMPTZ (PostgreSQL) or equivalent.
Display-timezone conversion happens at the presentation layer only.

Never use datetime.now() or datetime.utcnow() anywhere.
Use utc_now() for timestamps and parse_date_loose() for invoice dates.
"""

from datetime import datetime, date, timezone
from typing import Optional, Union
from zoneinfo import ZoneInfo

_UTC = timezone.utc


# ── System time (always UTC) ─────────────────────────────────────────────


def utc_now() -> datetime:
    """Current instant as timezone-aware UTC datetime."""
    return datetime.now(_UTC)


def utc_today() -> date:
    """Today's date in UTC."""
    return utc_now().date()


# ── User display timezone helpers ────────────────────────────────────────


USER_DEFAULT_TZ = "America/Santo_Domingo"


def now_in_tz(tz_name: Optional[str] = None) -> datetime:
    """Current instant in the given timezone (default: USER_DEFAULT_TZ)."""
    tz = ZoneInfo(tz_name or USER_DEFAULT_TZ)
    return datetime.now(tz)


def today_in_tz(tz_name: Optional[str] = None) -> date:
    return now_in_tz(tz_name).date()


def ensure_utc(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware and in UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=_UTC)
    return dt.astimezone(_UTC)


def to_tz(dt: datetime, target_tz: str) -> datetime:
    """Convert a datetime (naive assumed UTC) to target timezone."""
    utc_dt = ensure_utc(dt)
    return utc_dt.astimezone(ZoneInfo(target_tz))


def format_user_datetime(dt: datetime, tz_name: str = USER_DEFAULT_TZ) -> str:
    """Format a datetime for user display in their timezone."""
    return to_tz(dt, tz_name).isoformat()


# ── Date parsing (invoice dates, user input) ─────────────────────────────


def _parse_delimited_date(value: str, sep: str) -> Optional[date]:
    """Try DD/MM/YYYY first, then MM/DD/YYYY. If both valid, prefer DD/MM/YYYY."""
    parts = value.split(sep)
    if len(parts) != 3:
        return None
    a, b, y_str = parts
    if len(y_str) not in (2, 4):
        return None
    century = "20" if len(y_str) == 2 else ""
    try:
        a_int, b_int, y_int = int(a), int(b), int(y_str) if len(y_str) == 4 else int(century + y_str)
    except ValueError:
        return None
    if y_int < 100:
        y_int += 2000
    if not (1 <= y_int <= 9999):
        return None
    # Try DD/MM
    if 1 <= b_int <= 12:
        try:
            return date(y_int, b_int, a_int)
        except ValueError:
            pass
    # Try MM/DD
    if 1 <= a_int <= 12:
        try:
            return date(y_int, a_int, b_int)
        except ValueError:
            pass
    return None


def parse_date_loose(value: Union[str, datetime, date, None]) -> Optional[date]:
    """Parse a date string in various formats. Returns date object (no time)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    value = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except (ValueError, TypeError):
            continue
    # Delimited dates: smart DD/MM vs MM/DD disambiguation
    for sep in ("/", "-", "."):
        result = _parse_delimited_date(value, sep)
        if result is not None:
            return result
    return None


def parse_datetime_loose(value: Union[str, datetime, None]) -> Optional[datetime]:
    """Parse a datetime string. Returns timezone-aware UTC datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return ensure_utc(value)
    value = str(value).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%d", "%Y/%m/%d", "%Y%m%d"):
        try:
            parsed = datetime.strptime(value, fmt)
            return parsed.replace(tzinfo=_UTC)
        except (ValueError, TypeError):
            continue
    # Delimited dates: smart DD/MM vs MM/DD disambiguation
    for sep in ("/", "-", "."):
        d = _parse_delimited_date(value, sep)
        if d is not None:
            return datetime(d.year, d.month, d.day, tzinfo=_UTC)
    return None


# ── DGII format helpers ──────────────────────────────────────────────────


def format_date_dgii(value: Union[str, datetime, date, None]) -> Optional[str]:
    """Format a date to YYYYMMDD for DGII reports."""
    if value is None:
        return None
    d = parse_date_loose(value)
    return d.strftime("%Y%m%d") if d else None


def is_future_date(value, reference_date: Optional[date] = None) -> bool:
    """Check if a date is in the future (relative to UTC today)."""
    ref = reference_date or utc_today()
    d = parse_date_loose(value)
    return d is not None and d > ref
