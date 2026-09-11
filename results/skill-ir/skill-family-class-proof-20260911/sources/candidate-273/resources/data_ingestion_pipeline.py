"""Data ingestion pipeline with Great Expectations validation gates."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
from great_expectations.core.batch import RuntimeBatchRequest
from great_expectations.data_context import FileDataContext

logger = logging.getLogger(__name__)


class DataValidationError(Exception):
    """Raised when upstream data fails Great Expectations validation."""

    def __init__(self, message: str, validation_result: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.validation_result = validation_result


@dataclass(frozen=True)
class IngestionResult:
    """Result of a successful data ingestion and validation run."""

    rows_ingested: int
    batch_id: str
    validation_success: bool
    output_path: Path | None = None


class DataIngestionPipeline:
    """
    Orchestrates raw data ingestion with strict GX validation gates.

    The pipeline halts execution immediately when schema drift, null violations,
    statistical range anomalies, or volume thresholds are detected.
    """

    def __init__(
        self,
        ge_context_root: Path,
        expectation_suite_name: str = "raw_ingestion_suite",
        datasource_name: str = "pandas_datasource",
        data_asset_name: str = "raw_batch_asset",
        min_row_count: int = 100,
        max_row_count: int = 10_000_000,
    ) -> None:
        """
        Initialize the ingestion pipeline.

        Args:
            ge_context_root: Path to Great Expectations project root.
            expectation_suite_name: Name of the ExpectationSuite to apply.
            datasource_name: GX datasource identifier.
            data_asset_name: GX data asset identifier.
            min_row_count: Minimum acceptable batch volume.
            max_row_count: Maximum acceptable batch volume.
        """
        self.ge_context_root = Path(ge_context_root)
        self.expectation_suite_name = expectation_suite_name
        self.datasource_name = datasource_name
        self.data_asset_name = data_asset_name
        self.min_row_count = min_row_count
        self.max_row_count = max_row_count
        self._context: FileDataContext | None = None

    @property
    def context(self) -> FileDataContext:
        """Lazy-load the Great Expectations FileDataContext."""
        if self._context is None:
            self._context = FileDataContext(context_root_dir=str(self.ge_context_root))
        return self._context

    def _check_volume(self, df: pd.DataFrame) -> None:
        """
        Enforce batch volume bounds before GX validation.

        Args:
            df: Incoming DataFrame to validate.

        Raises:
            DataValidationError: If row count is outside configured bounds.
        """
        row_count = len(df)
        if row_count < self.min_row_count:
            raise DataValidationError(
                f"Volume anomaly: batch has {row_count} rows, "
                f"minimum required is {self.min_row_count}."
            )
        if row_count > self.max_row_count:
            raise DataValidationError(
                f"Volume anomaly: batch has {row_count} rows, "
                f"maximum allowed is {self.max_row_count}."
            )

    def validate(self, df: pd.DataFrame, batch_id: str) -> dict[str, Any]:
        """
        Run the full Great Expectations validation suite against incoming data.

        Args:
            df: Raw incoming DataFrame.
            batch_id: Unique identifier for this ingestion batch.

        Returns:
            Serialized validation result dictionary.

        Raises:
            DataValidationError: If validation fails or volume checks fail.
        """
        self._check_volume(df)

        batch_request = RuntimeBatchRequest(
            datasource_name=self.datasource_name,
            data_connector_name="default_runtime_data_connector",
            data_asset_name=self.data_asset_name,
            batch_identifiers={"batch_id": batch_id},
            runtime_parameters={"batch_data": df},
        )

        validator = self.context.get_validator(
            batch_request=batch_request,
            expectation_suite_name=self.expectation_suite_name,
        )
        result = validator.validate()
        result_dict = result.to_json_dict()

        if not result.success:
            failed = [
                exp["expectation_config"]["expectation_type"]
                for exp in result_dict.get("results", [])
                if not exp.get("success", True)
            ]
            raise DataValidationError(
                f"GX validation failed for batch '{batch_id}'. "
                f"Failed expectations: {failed}",
                validation_result=result_dict,
            )

        logger.info("Batch %s passed all %d expectations.", batch_id, len(result.results))
        return result_dict

    def ingest(
        self,
        df: pd.DataFrame,
        batch_id: str,
        output_path: Path | None = None,
    ) -> IngestionResult:
        """
        Validate and optionally persist validated raw data.

        Args:
            df: Raw incoming DataFrame.
            batch_id: Unique batch identifier.
            output_path: Optional path to write validated Parquet output.

        Returns:
            IngestionResult summarizing the successful run.

        Raises:
            DataValidationError: On any validation failure (pipeline halts).
        """
        self._check_volume(df)
        validation_result = self.validate(df, batch_id)

        if output_path is not None:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(output_path, index=False)
            logger.info("Validated data written to %s", output_path)

        return IngestionResult(
            rows_ingested=len(df),
            batch_id=batch_id,
            validation_success=validation_result.get("success", True),
            output_path=output_path,
        )
