"""Train XGBoost on the shared processed monthly series."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from xgboost import XGBRegressor

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "modeling" / "data" / "processed" / "cspc_data.csv"
OUTPUT = ROOT / "modeling" / "outputs" / "xgboost-results.json"


def feature_row(history: dict[pd.Timestamp, float], target_date: pd.Timestamp) -> dict[str, float]:
    return {
        "lag_1": history[target_date - pd.offsets.MonthBegin(1)],
        "lag_2": history[target_date - pd.offsets.MonthBegin(2)],
        "lag_3": history[target_date - pd.offsets.MonthBegin(3)],
        "month_number": float(target_date.month),
        "month_sin": float(__import__("math").sin(2 * __import__("math").pi * target_date.month / 12)),
        "month_cos": float(__import__("math").cos(2 * __import__("math").pi * target_date.month / 12)),
    }


def main() -> None:
    data = pd.read_csv(PROCESSED)
    data["date"] = pd.to_datetime(data["month"], format="%Y-%m")
    development = data[data["dataset_role"] == "development"].copy()
    tests = data[data["dataset_role"] == "test"].copy()
    history = dict(zip(development["date"], development["kwh"].astype(float)))

    train_rows = []
    targets = []
    for row_number, row in enumerate(development.itertuples(index=False)):
        if row_number < 3:
            continue
        train_rows.append(feature_row(history, row.date))
        targets.append(float(row.kwh))

    model = XGBRegressor(
        n_estimators=120,
        max_depth=2,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=1,
    )
    model.fit(pd.DataFrame(train_rows), targets)

    predictions = []
    for row in tests.itertuples(index=False):
        features = feature_row(history, row.date)
        prediction = float(model.predict(pd.DataFrame([features]))[0])
        predictions.append({"month": row.month, "prediction": round(prediction, 3)})
        history[row.date] = float(row.kwh)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"model": "XGBoost", "predictions": predictions}, indent=2), encoding="utf-8")
    print(json.dumps(predictions, indent=2))


if __name__ == "__main__":
    main()
