# Development input-byte decoding

The new specimen/body-negative and response batch runners previously checked raw file
SHA256, then used Buffer.toString(), which replaces malformed UTF-8. TDD confirms a file
containing0xff inside a JSON string was still reported pass/analyzed as a different text.
Raw binding and analyzed-source text must not silently diverge.

Use shared decodeDevelopmentUtf8(Uint8Array): fatal UTF-8 decoding with ignoreBOM=true.
Malformed encoding throws an explicit UTF-8 error; valid byte sequences, literal U+FFFD
and any leading BOM are preserved. This does not promise a BOM-containing JSON is valid:
the existing format parser still decides that. No Unicode normalization or fallback codec.
The behavior follows [Node TextDecoder documentation](https://nodejs.org/api/util.html#new-textdecoderencoding-options)
and is tested on the pinned Bun runtime; no runtime or dependency version is changed.

Decode the bound input index strictly before parsing it; an unreadable index fails the
batch rather than fabricating an input inventory. Decode each source after its raw digest
check inside the per-input failure boundary, retaining the failure and continuing siblings.
Include the helper's hash in the new runners' source bindings. The response CLI delegates
to runResponseDevelopment(options), analogous to the existing specimen runner, to test the
same batch path with an explicit temporary input root and separate execution root.

The same defect was reproduced in all four new source-duty mapping profiles; their API
task bytes now use the same decoder after digest verification and retain per-task errors.
Historical v2 dispatch still receives its original raw-file manifest unchanged. Mapping
metadata/SKILL-loader decoding is outside this small task; no claim of repository-wide
encoding hardening is made. Source bodies in the exposed corpus were separately validated.
This rejects invalid task bytes, not new schema syntax or expanded semantics. String-level
construction/checking APIs and frozen v1/v2 parsers/runners retain their existing contracts.

Test valid ASCII/Unicode/BOM/literal replacement character byte round trips, malformed
continuation/overlong/surrogate/out-of-range/truncated sequences, and malformed-source
failure retention beside a valid sibling in both batch runners. Compare strict decoding
of the12already-exposed source documents against previous decoded text and archived source
hashes; if text is identical and only ingestion changed, do not regenerate all artifacts.

```powershell
bun test ./src/skill-ir/development-utf8.test.ts ./scripts/skill-ir/api-request-specimens-development.test.ts ./scripts/skill-ir/api-response-schema-development.test.ts
```
