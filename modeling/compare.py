"""Compare the two model outputs on the held-out January and February 2025 records."""

from __future__ import annotations

import json
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "modeling" / "data" / "processed" / "cspc_data.csv"
XGB_OUTPUT = ROOT / "modeling" / "outputs" / "xgboost-results.json"
LSTM_OUTPUT = ROOT / "modeling" / "outputs" / "lstm-results.json"
OUTPUTS = [ROOT / "modeling" / "outputs" / "model-results.json", ROOT / "src" / "data" / "model-results.json"]


def metric_values(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    error = actual - predicted
    return {
        "mae": round(float(np.mean(np.abs(error))), 3),
        "rmse": round(float(np.sqrt(np.mean(error**2))), 3),
        "mape": round(float(np.mean(np.abs(error / actual)) * 100), 3),
    }


def read_predictions(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {row["month"]: float(row["prediction"]) for row in payload["predictions"]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verified", action="store_true", help="Mark outputs verified only after adviser and record-level review.")
    args = parser.parse_args()
    data = pd.read_csv(PROCESSED)
    tests = data[data["dataset_role"] == "test"].copy()
    actual = {row.month: float(row.kwh) for row in tests.itertuples(index=False)}
    actual_by_month = dict(zip(data["month"], data["kwh"].astype(float)))
    xgb = read_predictions(XGB_OUTPUT)
    lstm = read_predictions(LSTM_OUTPUT)
    months = list(actual)
    predictions = [
        {
            "month": month,
            "actual": actual[month],
            "lstm": lstm[month],
            "xgboost": xgb[month],
            "persistence": actual_by_month[(pd.Period(month, freq="M") - 1).strftime("%Y-%m")],
        }
        for month in months
    ]

    actual_array = np.array([actual[month] for month in months])
    result = {
        "status": "verified" if args.verified else "provisional",
        "verified": args.verified,
        "verification_note": (
            "Verified after adviser approval and record-level source review."
            if args.verified
            else "Generated from the curated CSV with development-period linear interpolation; adviser approval and record-level review are still pending."
        ),
        "dataset": {
            "source": "src/imports/cspc_data.csv",
            "raw_evidence": "data/raw/cspc_data.xlsx",
            "total_records": 17,
            "development_records": 15,
            "test_records": 2,
            "test_months": months,
            "missing_development_months": 9,
        },
        "predictions": predictions,
        "metrics": {
            "lstm": metric_values(actual_array, np.array([lstm[month] for month in months])),
            "xgboost": metric_values(actual_array, np.array([xgb[month] for month in months])),
        },
    }
    result["recommended_model"] = min(result["metrics"], key=lambda model: (
        result["metrics"][model]["mae"], result["metrics"][model]["rmse"], result["metrics"][model]["mape"]
    ))

    for output in OUTPUTS:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
