"""Point-in-time correct feature retrieval eliminating target leakage."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from feast import FeatureStore

logger = logging.getLogger(__name__)


class FeatureRetrievalError(Exception):
    """Raised when feature retrieval fails or produces invalid results."""


def get_feature_store(repo_path: Path | str | None = None) -> FeatureStore:
    """
    Load the Feast FeatureStore from the configured repository path.

    Args:
        repo_path: Optional override for the feature repo directory.

    Returns:
        Initialized Feast FeatureStore instance.
    """
    if repo_path is None:
        repo_path = Path(__file__).parent / "feature_repo"
    return FeatureStore(repo_path=str(repo_path))


def build_training_dataset(
    entity_df: pd.DataFrame,
    feature_store: FeatureStore | None = None,
    feature_view_names: list[str] | None = None,
) -> pd.DataFrame:
    """
    Build a point-in-time correct training dataset via historical feature retrieval.

    Uses Feast's `get_historical_features` to join features as they existed at each
    entity's `event_timestamp`, preventing target leakage from future data.

    Args:
        entity_df: DataFrame with columns `user_id` (int64) and `event_timestamp`
            (datetime). Each row represents an entity-event pair for training.
        feature_store: Optional pre-loaded FeatureStore instance.
        feature_view_names: Feature views to retrieve. Defaults to both views.

    Returns:
        Training DataFrame with entity keys, timestamps, features, and labels.

    Raises:
        FeatureRetrievalError: If required columns are missing or retrieval fails.
    """
    required_cols = {"user_id", "event_timestamp"}
    missing = required_cols - set(entity_df.columns)
    if missing:
        raise FeatureRetrievalError(f"entity_df missing required columns: {missing}")

    if feature_store is None:
        feature_store = get_feature_store()

    if feature_view_names is None:
        feature_view_names = ["user_batch_features", "user_realtime_features"]

    entity_df = entity_df.copy()
    entity_df["event_timestamp"] = pd.to_datetime(entity_df["event_timestamp"])
    entity_df["user_id"] = entity_df["user_id"].astype("int64")

    feature_refs = _build_feature_refs(feature_store, feature_view_names)

    try:
        training_df = feature_store.get_historical_features(
            entity_df=entity_df,
            features=feature_refs,
        ).to_df()
    except Exception as exc:
        raise FeatureRetrievalError(f"Historical feature retrieval failed: {exc}") from exc

    _validate_no_leakage(entity_df, training_df)
    logger.info(
        "Built training dataset: %d rows, %d columns.",
        len(training_df),
        len(training_df.columns),
    )
    return training_df


def get_online_features(
    user_ids: list[int],
    feature_store: FeatureStore | None = None,
    feature_view_names: list[str] | None = None,
) -> pd.DataFrame:
    """
    Retrieve latest online features from the Redis-backed online store.

    Args:
        user_ids: List of user entity IDs for inference.
        feature_store: Optional pre-loaded FeatureStore instance.
        feature_view_names: Feature views to retrieve.

    Returns:
        DataFrame with online feature values for each user.
    """
    if feature_store is None:
        feature_store = get_feature_store()

    if feature_view_names is None:
        feature_view_names = ["user_realtime_features"]

    feature_refs = _build_feature_refs(feature_store, feature_view_names)
    entity_rows = [{"user_id": uid} for uid in user_ids]

    response = feature_store.get_online_features(
        features=feature_refs,
        entity_rows=entity_rows,
    )
    return response.to_df()


def _build_feature_refs(
    feature_store: FeatureStore,
    feature_view_names: list[str],
) -> list[str]:
    """Construct fully-qualified feature references from view names."""
    refs: list[str] = []
    for view_name in feature_view_names:
        view = feature_store.get_feature_view(view_name)
        for field in view.schema:
            refs.append(f"{view_name}:{field.name}")
    return refs


def _validate_no_leakage(entity_df: pd.DataFrame, training_df: pd.DataFrame) -> None:
    """
    Verify that retrieved features do not post-date their entity timestamps.

    Args:
        entity_df: Original entity DataFrame with event timestamps.
        training_df: Retrieved training DataFrame.

    Raises:
        FeatureRetrievalError: If potential target leakage is detected.
    """
    if training_df.empty:
        raise FeatureRetrievalError("Training dataset is empty after feature retrieval.")

    if "event_timestamp" in training_df.columns:
        merged = entity_df.merge(
            training_df[["user_id", "event_timestamp"]],
            on=["user_id", "event_timestamp"],
            how="left",
            indicator=True,
        )
        unmatched = merged[merged["_merge"] != "both"]
        if len(unmatched) > 0:
            raise FeatureRetrievalError(
                f"Point-in-time join mismatch: {len(unmatched)} entities unmatched."
            )
