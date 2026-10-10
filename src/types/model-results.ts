export type ModelMetrics = {
  mae: number;
  rmse: number;
  mape: number;
};

export type TestResult = {
  month: string;
  label: string;
  actualKwh: number;
  lstmKwh: number;
  xgboostKwh: number;
  persistenceKwh: number;
};

export type ModelResults = {
  status: "verified" | "pending" | "failed";
  generatedAt: string;
  unit: "kWh";
  forecastHorizon: "one-month-ahead";
  evaluationProtocol: string;
  dataset?: {
    availableRecords?: number;
    observedDevelopmentRecords?: number;
    interpolatedTrainingMonths?: number;
    testRecords?: number;
    testPeriod?: string;
  };
  testResults: TestResult[];
  metrics: {
    lstm: ModelMetrics;
    xgboost: ModelMetrics;
    persistence: ModelMetrics;
  };
};
