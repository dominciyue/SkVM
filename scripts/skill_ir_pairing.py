from typing import Any


PAIRING_IDENTITY_FIELDS = (
    "model",
    "modelFamily",
    "adapter",
    "adapterVersion",
    "panelConfigId",
    "runIndex",
)

PairingKey = tuple[Any, ...]


def pairing_key(row: dict[str, Any]) -> PairingKey | None:
    case_id = row.get("caseId")
    if not case_id:
        return None

    present = [field in row for field in PAIRING_IDENTITY_FIELDS]
    if not any(present):
        return (str(case_id),)
    if not all(present):
        return None

    string_values = [row[field] for field in PAIRING_IDENTITY_FIELDS[:-1]]
    if any(not isinstance(value, str) or not value.strip() for value in string_values):
        return None
    run_index = row["runIndex"]
    if isinstance(run_index, bool) or not isinstance(run_index, int) or run_index < 1:
        return None
    return (str(case_id), *string_values, run_index)
