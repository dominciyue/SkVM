"""Great Expectations expectation suite builder for raw ingestion data."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import great_expectations as gx
import pandas as pd
from great_expectations.core import ExpectationSuite
from great_expectations.core.batch import RuntimeBatchRequest
from great_expectations.data_context import FileDataContext

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "great_expectations"


def build_raw_ingestion_suite(context: FileDataContext) -> ExpectationSuite:
    """
    Create and persist a strict ExpectationSuite for raw incoming data.

    Includes schema validations, null constraints, statistical range checks,
    and uniqueness constraints to detect schema drift early.

    Args:
        context: Active Great Expectations FileDataContext.

    Returns:
        The persisted ExpectationSuite instance.
    """
    suite_name = "raw_ingestion_suite"
    try:
        suite = context.suites.get(suite_name)
    except Exception:
        suite = context.suites.add(ExpectationSuite(expectation_suite_name=suite_name))

    validator = _bootstrap_validator(context, suite_name)

    validator.expect_table_columns_to_match_ordered_list(
        column_list=[
            "user_id",
            "event_timestamp",
            "feature_a",
            "feature_b",
            "feature_c",
            "label",
        ]
    )
    validator.expect_column_values_to_be_of_type(column="user_id", type_="int64")
    validator.expect_column_values_to_be_of_type(column="event_timestamp", type_="object")
    validator.expect_column_values_to_be_of_type(column="feature_a", type_="float64")
    validator.expect_column_values_to_be_of_type(column="feature_b", type_="float64")
    validator.expect_column_values_to_be_of_type(column="feature_c", type_="float64")
    validator.expect_column_values_to_be_of_type(column="label", type_="int64")

    validator.expect_column_values_to_not_be_null(column="user_id")
    validator.expect_column_values_to_not_be_null(column="event_timestamp")
    validator.expect_column_values_to_not_be_null(column="feature_a")
    validator.expect_column_values_to_not_be_null(column="feature_b")
    validator.expect_column_values_to_not_be_null(column="label")

    validator.expect_column_values_to_be_between(
        column="feature_a", min_value=0.0, max_value=1000.0, mostly=0.99
    )
    validator.expect_column_values_to_be_between(
        column="feature_b", min_value=-50.0, max_value=50.0, mostly=0.99
    )
    validator.expect_column_values_to_be_between(
        column="feature_c", min_value=0.0, max_value=1.0, mostly=0.95
    )
    validator.expect_column_values_to_be_in_set(column="label", value_set=[0, 1])
    validator.expect_column_values_to_be_unique(column="user_id")
    validator.expect_table_row_count_to_be_between(min_value=1, max_value=10_000_000)

    validator.save_expectation_suite(discard_failed_expectations=False)
    return context.suites.get(suite_name)


def _bootstrap_validator(context: FileDataContext, suite_name: str) -> Any:
    """Create a bootstrap validator with sample data for suite building."""
    sample = pd.DataFrame(
        {
            "user_id": [1, 2, 3],
            "event_timestamp": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
            "feature_a": [10.5, 20.3, 15.7],
            "feature_b": [-1.2, 3.4, 0.0],
            "feature_c": [0.5, 0.8, 0.3],
            "label": [0, 1, 0],
        }
    )
    batch_request = RuntimeBatchRequest(
        datasource_name="pandas_datasource",
        data_connector_name="default_runtime_data_connector",
        data_asset_name="raw_batch_asset",
        batch_identifiers={"default": "bootstrap"},
        runtime_parameters={"batch_data": sample},
    )
    return context.get_validator(batch_request=batch_request, expectation_suite_name=suite_name)


def _bootstrap_project_files(project_root: Path) -> None:
    """Copy bundled GX config and create required directory structure."""
    project_root.mkdir(parents=True, exist_ok=True)
    template_yml = _TEMPLATE_DIR / "great_expectations.yml"
    target_yml = project_root / "great_expectations.yml"
    if template_yml.exists():
        shutil.copy(template_yml, target_yml)
    for subdir in ("expectations", "uncommitted", "checkpoints", "uncommitted/validations"):
        (project_root / subdir).mkdir(parents=True, exist_ok=True)


def initialize_ge_project(project_root: Path) -> FileDataContext:
    """
    Initialize a Great Expectations project with datasource and expectation suite.

    Args:
        project_root: Root directory for the GX project.

    Returns:
        Configured FileDataContext ready for validation.
    """
    project_root = Path(project_root)
    _bootstrap_project_files(project_root)
    context = FileDataContext(context_root_dir=str(project_root))

    datasource_name = "pandas_datasource"
    if hasattr(context, "data_sources"):
        try:
            context.data_sources.get(datasource_name)
        except Exception:
            datasource = context.data_sources.add_pandas(name=datasource_name)
            datasource.add_dataframe_asset(name="raw_batch_asset")

    build_raw_ingestion_suite(context)
    return context
