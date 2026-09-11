from datetime import timedelta

from feast import Entity, FeatureView, Field, FileSource, ValueType
from feast.types import Float32, Float64, Int64

user = Entity(
    name="user",
    join_keys=["user_id"],
    description="User entity for batch and real-time feature retrieval.",
)

batch_source = FileSource(
    name="user_batch_source",
    path="data/user_batch_features.parquet",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_at",
)

user_batch_features = FeatureView(
    name="user_batch_features",
    entities=[user],
    ttl=timedelta(days=365),
    schema=[
        Field(name="feature_a", dtype=Float64),
        Field(name="feature_b", dtype=Float64),
        Field(name="label", dtype=Int64),
    ],
    source=batch_source,
    online=False,
    description="Batch offline training features backed by Parquet on S3/local filesystem.",
)

realtime_source = FileSource(
    name="user_realtime_source",
    path="data/user_realtime_features.parquet",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_at",
)

user_realtime_features = FeatureView(
    name="user_realtime_features",
    entities=[user],
    ttl=timedelta(hours=24),
    schema=[
        Field(name="feature_c", dtype=Float32),
        Field(name="session_count", dtype=Int64),
        Field(name="last_active_minutes", dtype=Int64),
    ],
    source=realtime_source,
    online=True,
    description="Real-time inference features backed by Redis online store.",
)
