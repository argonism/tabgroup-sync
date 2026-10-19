def normalize_label(text: str) -> str:
    """Trim surrounding whitespace and lowercase a label."""
    return text.strip().lower()
