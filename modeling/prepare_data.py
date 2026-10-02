"""Prepare one validated monthly series for both forecasting models."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "src" / "imports" / "cspc_data.csv"
DEFAULT_OUTPUT = ROOT / "modeling" / "data" / "processed" / "cspc_data.csv"
DEFAULT_LOG = ROOT / "modeling" / "data" / "missing-data-log.csv"

TEST_MONTHS = {"2025-01", "2025-02"}
DEVELOPMENT_END = pd.Timestamp("2024-12-01")
EXPECTED_TEST_VALUES = {"2025-01": 69997.0, "2025-02": 70097.0}


def prepare(source: Path, output: Path, missing_log: Path, method: str) -> pd.DataFrame:
    if method != "linear_interpolation":
        raise ValueError("Only the explicit linear_interpolation method is supported.")

    source_data = pd.read_csv(source)
    if list(source_data.columns) != ["month", "kwh"]:
        raise ValueError("The validated source must contain exactly: month,kwh")
    if source_data["month"].duplicated().any():
        raise ValueError("The validated source contains duplicate month keys.")

    source_data["date"] = pd.to_datetime(source_data["month"], format="%Y-%m")
    source_data["kwh"] = pd.to_numeric(source_data["kwh"], errors="raise")
    source_data = source_data.sort_values("date").set_index("date")

    for month, expected in EXPECTED_TEST_VALUES.items():
        actual = float(source_data.loc[pd.Timestamp(f"{month}-01"), "kwh"])
        if actual != expected:
            raise ValueError(f"Unexpected test value for {month}: {actual} != {expected}")

    complete_index = pd.date_range(source_data.index.min(), source_data.index.max(), freq="MS")
    prepared = source_data.reindex(complete_index)
    prepared.index.name = "date"
    prepared["value_source"] = "observed"

    development_missing = prepared.index <= DEVELOPMENT_END
    missing_mask = prepared["kwh"].isna()
    if (missing_mask & ~development_missing).any():
        raise ValueError("A test-period value is missing; test values must remain observed.")

    prepared.loc[missing_mask & development_missing, "kwh"] = (
        prepared.loc[development_missing, "kwh"].interpolate(method="time")
    )
    prepared.loc[missing_mask & development_missing, "value_source"] = "imputed_linear_interpolation"

    if prepared["kwh"].isna().any():
        raise ValueError("Interpolation did not resolve every development-period gap.")

    prepared["month"] = prepared.index.strftime("%Y-%m")
    prepared["dataset_role"] = prepared.index.map(
        lambda value: "development" if value <= DEVELOPMENT_END else "test"
    )
    prepared = prepared[["month", "kwh", "value_source", "dataset_role"]]

    output.parent.mkdir(parents=True, exist_ok=True)
    prepared.to_csv(output, index=False, float_format="%.6f")

    missing_rows = []
    for row in prepared.itertuples(index=False):
        if row.value_source == "imputed_linear_interpolation":
            missing_rows.append(
                {
                    "missing_month": row.month,
                    "recovered": "No",
                    "imputed": "Yes",
                    "excluded": "No",
                    "reason_or_source": "Development-period linear interpolation; adviser approval pending",
                }
            )
    missing_log.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(missing_rows).to_csv(missing_log, index=False)
    return prepared


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--missing-log", type=Path, default=DEFAULT_LOG)
    parser.add_argument("--method", default="linear_interpolation")
    args = parser.parse_args()
    result = prepare(args.source, args.output, args.missing_log, args.method)
    print(f"Prepared {len(result)} monthly rows: {result['month'].iloc[0]} to {result['month'].iloc[-1]}")
    print(f"Imputed development rows: {(result['value_source'] != 'observed').sum()}")
    print("WARNING: linear interpolation is provisional until adviser approval.")


if __name__ == "__main__":
    main()
