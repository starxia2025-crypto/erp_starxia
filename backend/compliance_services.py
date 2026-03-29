from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Protocol


class AeatSubmissionAdapter(Protocol):
    def submit_invoice_record(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...


class MockAeatSubmissionAdapter:
    def submit_invoice_record(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "status": "mocked",
            "message": "AEAT submission adapter not enabled yet",
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "payload_reference": payload.get("record_count"),
        }


def get_aeat_adapter() -> AeatSubmissionAdapter:
    return MockAeatSubmissionAdapter()


def build_verifactu_export(company: Dict[str, Any], records: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "spec": "verifactu-prepared",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "company": company,
        "record_count": len(records),
        "records": records,
    }
