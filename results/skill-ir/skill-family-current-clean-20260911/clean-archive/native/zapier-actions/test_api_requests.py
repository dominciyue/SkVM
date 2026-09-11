SUITE_SHA256 = "eb91100909f2fb2a5a335c6fb1c21e8d9c0e2559f627b2a6a97c7056725a3ea6"
"""Reviewed synthetic-loopback pytest runtime; suite hash is prefixed by the emitter."""
import hashlib
import json
import os
import re
from pathlib import Path

import httpx
import pytest


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def strict_json(text):
    return json.loads(text, object_pairs_hook=unique_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))


SUITE_BYTES = Path(__file__).with_name("suite.json").read_bytes()
assert hashlib.sha256(SUITE_BYTES).hexdigest() == SUITE_SHA256, "SUITE_BINDING_MISMATCH"
SUITE = strict_json(SUITE_BYTES.decode("utf-8", errors="strict"))
assert SUITE["schemaVersion"] == "api-pytest-request-suite/v1"
assert len({row["id"] for row in SUITE["rows"]}) == len(SUITE["rows"]), "DUPLICATE_CASE_ID"


@pytest.mark.parametrize("row", SUITE["rows"], ids=lambda row: row["id"])
def test_source_request_against_explicit_fixture(row):
    if row["status"] != "constructed":
        pytest.skip("SOURCE_UNRESOLVED: " + "; ".join(row["reasons"]))
    if row["security"]:
        pytest.skip("CREDENTIALS_UNSUPPORTED")
    oracle_path = os.environ.get("SKVM_PYTEST_ORACLE")
    if not oracle_path:
        pytest.skip("EXPLICIT_LOOPBACK_ORACLE_REQUIRED")
    oracle = strict_json(Path(oracle_path).read_text(encoding="utf-8"))
    assert oracle["schemaVersion"] == "api-pytest-loopback-oracle/v1", "ORACLE_VERSION_MISMATCH"
    assert oracle["suiteSha256"] == SUITE_SHA256, "ORACLE_SUITE_BINDING_MISMATCH"
    assert re.fullmatch(r"[0-9a-f]{64}", oracle["fixtureSha256"]), "FIXTURE_IDENTITY_REQUIRED"
    origin = oracle["origin"]
    matched = re.fullmatch(r"http://127\.0\.0\.1:([1-9][0-9]{0,4})", origin)
    assert matched and int(matched.group(1)) <= 65535, "LOOPBACK_ORIGIN_REQUIRED"
    assert len({case["id"] for case in oracle["cases"]}) == len(oracle["cases"]), "DUPLICATE_ORACLE_CASE"
    selected = [case for case in oracle["cases"] if case["id"] == row["id"]]
    if not selected:
        pytest.skip("CASE_ORACLE_REQUIRED")
    expected = selected[0]
    assert expected["requestSha256"] == hashlib.sha256(row["requestJson"].encode("utf-8")).hexdigest(), "ORACLE_REQUEST_BINDING_MISMATCH"
    response_rule = expected["response"]
    assert type(response_rule["statusCode"]) is int and 100 <= response_rule["statusCode"] <= 599, "EXPLICIT_STATUS_REQUIRED"
    assert isinstance(response_rule["mediaType"], str) and isinstance(response_rule["bodyText"], str), "EXPLICIT_RESPONSE_REQUIRED"
    request = strict_json(row["requestJson"])
    target = request["target"]
    assert target.startswith("/") and not target.startswith("//"), "RELATIVE_TARGET_REQUIRED"
    body = request["body"]["text"].encode("utf-8") if request["body"] else b""
    headers = [(header["name"], header["value"]) for header in request["headers"]]
    with httpx.Client(trust_env=False, follow_redirects=False, timeout=5.0) as client:
        prepared = client.build_request(request["method"], origin + target, headers=headers, content=body)
        assert prepared.url.raw_path == target.encode("ascii"), "PREPARED_TARGET_MISMATCH"
        assert prepared.content == body, "PREPARED_BODY_MISMATCH"
        response = client.send(prepared, stream=True)
        try:
            assert response.status_code == response_rule["statusCode"], "STATUS_MISMATCH"
            assert response.headers.get("content-type", "") == response_rule["mediaType"], "MEDIA_MISMATCH"
            chunks = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                assert size <= 1048576, "RESPONSE_BYTE_BUDGET"
                chunks.append(chunk)
            assert b"".join(chunks) == response_rule["bodyText"].encode("utf-8"), "RESPONSE_BODY_MISMATCH"
        finally:
            response.close()
