# CSPC Forecast Modeling Pipeline

The raw workbook is evidence only. Modeling reads the curated CSV at `src/imports/cspc_data.csv`.

## Sequence

1. Review `modeling/data/verification-table.csv` and resolve the four duplicate/decimal-sensitive source rows.
2. Run `py -3.13 modeling/prepare_data.py`.
3. Run `py -3.13 modeling/train_xgboost.py`.
4. Run `py -3.13 modeling/train_lstm.py`.
5. Run `py -3.13 modeling/compare.py` to write provisional results.
6. After adviser approval and source review, run `py -3.13 modeling/compare.py --verified`.

The React app reads `src/data/model-results.json` and displays charts/metrics only when `verified` is `true`.

## Missing data

The current preparation method is time-based linear interpolation for the nine development-period gaps. This is provisional and is recorded in `modeling/data/missing-data-log.csv`. It must be approved before results are treated as final.

## LSTM runtime

The script uses TensorFlow, with the scaler fit only on development data and a three-month lookback. On native Windows, TensorFlow may require WSL2 or another supported Python runtime if the native import crashes.
