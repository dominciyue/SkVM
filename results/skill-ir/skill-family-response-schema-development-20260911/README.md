# Response-direction schema basis — development

Explicit createResponseSchemaChecker API retains response-required readOnly fields and
rejects writeOnly leakage; request APIs retain their original semantics. Directional
properties under composition remain unsupported. No request/response generator changed.
This is schema checking only, not proof of live response behavior or full skill output.

Initial missing-export RED and21test/115assertion GREEN are preserved in tests.json.
Main typecheck exit0. Next: explicit operation/status/media-bound offline observations,
distinguishing source examples from actual traffic and preserving unsupported schemas.
