"""Train a small LSTM on the shared processed monthly series."""

from __future__ import annotations

import json
import os
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.preprocessing import MinMaxScaler

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "modeling" / "data" / "processed" / "cspc_data.csv"
OUTPUT = ROOT / "modeling" / "outputs" / "lstm-results.json"


def main() -> None:
    np.random.seed(42)
    tf.random.set_seed(42)
    data = pd.read_csv(PROCESSED)
    development = data[data["dataset_role"] == "development"]
    tests = data[data["dataset_role"] == "test"]

    values = development["kwh"].to_numpy(dtype=np.float32).reshape(-1, 1)
    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(values)
    lookback = 3
    x_train = np.array([scaled[i - lookback:i] for i in range(lookback, len(scaled))])
    y_train = np.array([scaled[i] for i in range(lookback, len(scaled))])

    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(lookback, 1)),
        tf.keras.layers.LSTM(16),
        tf.keras.layers.Dense(1),
    ])
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.01), loss="mse")
    model.fit(x_train, y_train, epochs=250, batch_size=4, verbose=0, shuffle=False)

    history = list(scaled.reshape(-1))
    predictions = []
    for row in tests.itertuples(index=False):
        window = np.array(history[-lookback:], dtype=np.float32).reshape(1, lookback, 1)
        predicted_scaled = float(model.predict(window, verbose=0)[0, 0])
        prediction = float(scaler.inverse_transform([[predicted_scaled]])[0, 0])
        predictions.append({"month": row.month, "prediction": round(prediction, 3)})
        actual_scaled = float(scaler.transform([[float(row.kwh)]])[0, 0])
        history.append(actual_scaled)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"model": "LSTM", "lookback_months": lookback, "predictions": predictions}, indent=2), encoding="utf-8")
    print(json.dumps(predictions, indent=2))


if __name__ == "__main__":
    main()
