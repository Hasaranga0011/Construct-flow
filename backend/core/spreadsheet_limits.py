"""Reject oversized uploads and compressed spreadsheet bombs before pandas parsing."""
import io
import zipfile


def validate_spreadsheet(content: bytes, filename: str):
    if not content or len(content) > 10 * 1024 * 1024:
        raise ValueError("Spreadsheet must contain data and be no larger than 10 MB")
    if filename.lower().endswith('.xls'):
        raise ValueError("Save legacy .xls files as .xlsx or CSV before uploading")
    if filename.lower().endswith('.xlsx'):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                entries = archive.infolist()
                sheets = [entry for entry in entries if entry.filename.startswith('xl/worksheets/') and entry.filename.endswith('.xml')]
                if len(entries) > 1000 or len(sheets) > 20 or sum(entry.file_size for entry in entries) > 40 * 1024 * 1024:
                    raise ValueError("Spreadsheet expands beyond the safe parsing limit")
                if any(entry.flag_bits & 1 for entry in entries):
                    raise ValueError("Encrypted spreadsheets are not supported")
        except zipfile.BadZipFile as exc:
            raise ValueError("Invalid XLSX archive") from exc
