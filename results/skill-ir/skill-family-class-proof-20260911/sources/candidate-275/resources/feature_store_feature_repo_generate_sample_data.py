"""Materialize sample feature data for local development and testing."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


def generate_sample_feature_data(output_dir: Path) -> None:
    """
    Generate sample Parquet files for Feast offline and online materialization.

    Args:
        output_dir: Directory to write Parquet source files.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    base_time = datetime(2024, 1, 1, 0, 0, 0)
    user_ids = list(range(1, 101))

    batch_rows = []
    for uid in user_ids:
        for day_offset in range(30):
            ts = base_time + timedelta(days=day_offset)
            batch_rows.append(
                {
                    "user_id": uid,
                    "event_timestamp": ts,
                    "created_at": ts,
                    "feature_a": float(uid * 10 + day_offset),
                    "feature_b": float(day_offset - 15),
                    "label": uid % 2,
                }
            )

    batch_df = pd.DataFrame(batch_rows)
    batch_df.to_parquet(output_dir / "user_batch_features.parquet", index=False)

    realtime_rows = []
    for uid in user_ids:
        for hour_offset in range(72):
            ts = base_time + timedelta(hours=hour_offset)
            realtime_rows.append(
                {
                    "user_id": uid,
                    "event_timestamp": ts,
                    "created_at": ts,
                    "feature_c": float(hour_offset % 24) / 24.0,
                    "session_count": hour_offset % 10,
                    "last_active_minutes": hour_offset * 5,
                }
            )

    realtime_df = pd.DataFrame(realtime_rows)
    realtime_df.to_parquet(output_dir / "user_realtime_features.parquet", index=False)


if __name__ == "__main__":
    repo_data = Path(__file__).parent / "data"
    generate_sample_feature_data(repo_data)
