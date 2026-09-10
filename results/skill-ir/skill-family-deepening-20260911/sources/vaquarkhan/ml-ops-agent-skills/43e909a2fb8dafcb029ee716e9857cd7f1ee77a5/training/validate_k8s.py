"""Kubernetes manifest dry-run validation for Volcano scheduling resources."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

K8S_MANIFEST_DIR = Path(__file__).resolve().parent.parent / "k8s" / "volcano"


@dataclass
class ValidationResult:
    """Result of a Kubernetes manifest validation check."""

    manifest: str
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class VolcanoConfigValidator:
    """
    Dry-run validator for Volcano PodGroup and Queue configurations.

    Validates YAML structure, required fields, gang scheduling constraints,
    and fractional GPU resource specifications without requiring a live cluster.
    """

    manifest_dir: Path = K8S_MANIFEST_DIR

    REQUIRED_PODGROUP_FIELDS = {"minMember", "queue"}
    REQUIRED_QUEUE_FIELDS = {"weight", "capability"}
    REQUIRED_GPU_KEYS = {"nvidia.com/gpu", "nvidia.com/mig-1g.10gb"}

    def load_manifest(self, filename: str) -> dict[str, Any]:
        """Load and parse a YAML manifest file."""
        path = self.manifest_dir / filename
        if not path.exists():
            raise FileNotFoundError(f"Manifest not found: {path}")
        with path.open("r", encoding="utf-8") as fh:
            return yaml.safe_load(fh)

    def validate_podgroup(self, manifest: dict[str, Any] | None = None) -> ValidationResult:
        """
        Validate PodGroup CRD configuration for gang scheduling.

        Ensures minMember is set and queue reference is present.
        """
        errors: list[str] = []
        warnings: list[str] = []

        if manifest is None:
            manifest = self.load_manifest("podgroup.yaml")

        spec = manifest.get("spec", {})
        missing = self.REQUIRED_PODGROUP_FIELDS - set(spec.keys())
        if missing:
            errors.append(f"PodGroup missing required spec fields: {missing}")

        min_member = spec.get("minMember")
        if min_member is not None and min_member < 2:
            warnings.append(f"minMember={min_member} may not enable effective gang scheduling.")

        if not spec.get("queue"):
            errors.append("PodGroup must specify a queue for Volcano scheduling.")

        min_resources = spec.get("minResources", {})
        if not min_resources.get("nvidia.com/gpu"):
            errors.append("PodGroup minResources must include nvidia.com/gpu.")

        return ValidationResult(
            manifest="podgroup.yaml",
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    def validate_queue(self, manifest: dict[str, Any] | None = None) -> ValidationResult:
        """Validate Volcano Queue resource configuration."""
        errors: list[str] = []
        warnings: list[str] = []

        if manifest is None:
            manifest = self.load_manifest("queue.yaml")

        spec = manifest.get("spec", {})
        missing = self.REQUIRED_QUEUE_FIELDS - set(spec.keys())
        if missing:
            errors.append(f"Queue missing required spec fields: {missing}")

        capability = spec.get("capability", {})
        if not capability.get("nvidia.com/gpu"):
            errors.append("Queue capability must declare nvidia.com/gpu quota.")

        return ValidationResult(
            manifest="queue.yaml",
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    def validate_training_job(self, manifest: dict[str, Any] | None = None) -> ValidationResult:
        """Validate Volcano Job manifest for fractional GPU and gang scheduling."""
        errors: list[str] = []
        warnings: list[str] = []

        if manifest is None:
            manifest = self.load_manifest("training-job.yaml")

        spec = manifest.get("spec", {})
        if spec.get("schedulerName") != "volcano":
            errors.append("Job must use schedulerName: volcano.")

        if spec.get("minAvailable", 0) < 2:
            errors.append("Job minAvailable must be >= 2 for gang scheduling.")

        tasks = spec.get("tasks", [])
        for task in tasks:
            containers = task.get("template", {}).get("spec", {}).get("containers", [])
            for container in containers:
                resources = container.get("resources", {})
                requests = resources.get("requests", {})
                if not self.REQUIRED_GPU_KEYS.intersection(requests.keys()):
                    errors.append(
                        f"Container '{container.get('name')}' missing fractional GPU requests."
                    )

        return ValidationResult(
            manifest="training-job.yaml",
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    def validate_all(self) -> list[ValidationResult]:
        """Run all manifest validations and return aggregated results."""
        results = [
            self.validate_queue(),
            self.validate_podgroup(),
            self.validate_training_job(),
        ]
        for result in results:
            status = "PASS" if result.valid else "FAIL"
            logger.info("[%s] %s", status, result.manifest)
            for err in result.errors:
                logger.error("  ERROR: %s", err)
            for warn in result.warnings:
                logger.warning("  WARN: %s", warn)
        return results


def main() -> int:
    """CLI entry point for manifest validation."""
    logging.basicConfig(level=logging.INFO)
    validator = VolcanoConfigValidator()
    results = validator.validate_all()
    return 0 if all(r.valid for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
