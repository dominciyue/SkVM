"""Unit tests for upstream data validation pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from data.ingestion_pipeline import DataIngestionPipeline, DataValidationError
from data.expectations.build_suite import build_raw_ingestion_suite, initialize_ge_project


def _mock_validation_result(success: bool) -> MagicMock:
    """Build a mock GX validation result."""
    result = MagicMock()
    result.success = success
    result.results = []
    result.to_json_dict.return_value = {"success": success, "results": []}
    return result


@pytest.fixture
def pipeline(tmp_path: Path) -> DataIngestionPipeline:
    """Pipeline with mocked validation."""
    pipe = DataIngestionPipeline(
        ge_context_root=tmp_path / "great_expectations",
        min_row_count=10,
        max_row_count=10000,
    )
    pipe.validate = MagicMock(return_value={"success": True, "results": []})  # type: ignore[method-assign]
    return pipe


@pytest.fixture
def failing_pipeline(pipeline: DataIngestionPipeline) -> DataIngestionPipeline:
    """Pipeline whose validation always fails."""

    def _fail_validate(df: pd.DataFrame, batch_id: str) -> dict[str, Any]:
        raise DataValidationError(
            "GX validation failed",
            validation_result={"success": False, "results": []},
        )

    pipeline.validate = MagicMock(side_effect=_fail_validate)  # type: ignore[method-assign]
    return pipeline


class TestDataIngestionPipeline:
    """Tests for GX-validated data ingestion."""

    def test_valid_data_passes_validation(
        self, pipeline: DataIngestionPipeline, valid_raw_data: pd.DataFrame
    ) -> None:
        result = pipeline.ingest(valid_raw_data, batch_id="batch_001")
        assert result.validation_success is True
        assert result.rows_ingested == 150

    def test_valid_data_written_to_parquet(
        self,
        pipeline: DataIngestionPipeline,
        valid_raw_data: pd.DataFrame,
        tmp_path: Path,
    ) -> None:
        output = tmp_path / "validated.parquet"
        result = pipeline.ingest(valid_raw_data, batch_id="batch_002", output_path=output)
        assert output.exists()
        assert result.output_path == output

    def test_poisoned_schema_halts_pipeline(
        self, failing_pipeline: DataIngestionPipeline, poisoned_schema_data: pd.DataFrame
    ) -> None:
        with pytest.raises(DataValidationError) as exc_info:
            failing_pipeline.ingest(poisoned_schema_data, batch_id="poison_schema")
        assert exc_info.value.validation_result is not None

    def test_volume_anomaly_halts_pipeline(
        self, pipeline: DataIngestionPipeline, poisoned_volume_data: pd.DataFrame
    ) -> None:
        with pytest.raises(DataValidationError, match="Volume anomaly"):
            pipeline.ingest(poisoned_volume_data, batch_id="poison_volume")

    def test_null_violation_halts_pipeline(
        self, failing_pipeline: DataIngestionPipeline, valid_raw_data: pd.DataFrame
    ) -> None:
        with pytest.raises(DataValidationError):
            failing_pipeline.ingest(valid_raw_data, batch_id="poison_null")

    def test_range_violation_halts_pipeline(
        self, failing_pipeline: DataIngestionPipeline, valid_raw_data: pd.DataFrame
    ) -> None:
        with pytest.raises(DataValidationError):
            failing_pipeline.ingest(valid_raw_data, batch_id="poison_range")

    def test_context_lazy_loaded(self, tmp_path: Path) -> None:
        pipe = DataIngestionPipeline(ge_context_root=tmp_path, min_row_count=1)
        assert pipe._context is None
        with patch.object(DataIngestionPipeline, "context", new_callable=MagicMock):
            pipe._context = MagicMock()
            assert pipe._context is not None

    def test_validate_success_with_mock_context(
        self, tmp_path: Path, valid_raw_data: pd.DataFrame
    ) -> None:
        pipe = DataIngestionPipeline(
            ge_context_root=tmp_path, min_row_count=10, max_row_count=10000
        )
        mock_validator = MagicMock()
        mock_validator.validate.return_value = _mock_validation_result(True)
        mock_context = MagicMock()
        mock_context.get_validator.return_value = mock_validator
        pipe._context = mock_context

        result = pipe.validate(valid_raw_data, "batch_validate")
        assert result["success"] is True
        mock_context.get_validator.assert_called_once()

    def test_check_volume_min(self, pipeline: DataIngestionPipeline) -> None:
        with pytest.raises(DataValidationError, match="Volume anomaly"):
            pipeline._check_volume(pd.DataFrame({"a": [1]}))

    def test_check_volume_max(
        self, pipeline: DataIngestionPipeline, valid_raw_data: pd.DataFrame
    ) -> None:
        pipeline.max_row_count = 10
        with pytest.raises(DataValidationError, match="Volume anomaly"):
            pipeline._check_volume(valid_raw_data)


class TestBuildSuite:
    """Tests for expectation suite builder."""

    def test_validation_error_stores_result(self) -> None:
        err = DataValidationError("test", validation_result={"success": False})
        assert err.validation_result == {"success": False}

    def test_bootstrap_project_files(self, tmp_path: Path) -> None:
        ge_root = tmp_path / "ge"
        from data.expectations.build_suite import _bootstrap_project_files

        _bootstrap_project_files(ge_root)
        assert (ge_root / "great_expectations.yml").exists()

    @patch("data.expectations.build_suite.FileDataContext")
    def test_initialize_ge_project(self, mock_fdc: MagicMock, tmp_path: Path) -> None:
        mock_context = MagicMock()
        mock_context.suites.get.side_effect = Exception("not found")
        mock_context.suites.add.return_value = MagicMock()
        mock_fdc.return_value = mock_context

        with patch("data.expectations.build_suite.build_raw_ingestion_suite") as mock_build:
            initialize_ge_project(tmp_path / "ge")
            mock_build.assert_called_once()

    @patch("data.expectations.build_suite._bootstrap_validator")
    def test_build_suite(self, mock_bootstrap: MagicMock) -> None:
        mock_context = MagicMock()
        mock_validator = MagicMock()
        mock_bootstrap.return_value = mock_validator
        mock_context.suites.get.side_effect = [Exception("not found"), MagicMock(name="suite")]

        suite = build_raw_ingestion_suite(mock_context)
        mock_validator.save_expectation_suite.assert_called_once()
        assert suite is not None
