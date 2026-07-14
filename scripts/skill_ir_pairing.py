from typing import Any


PAIRING_IDENTITY_FIELDS = (
    "model",
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
    return (str(case_id), *(row.get(field) for field in PAIRING_IDENTITY_FIELDS))
