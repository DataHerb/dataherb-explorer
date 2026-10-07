---
id: airpassenger
repo: DataHerb/dataset-airpassenger
inline: true
name: Air passengers (1949-1960)
description: Monthly totals of international airline passengers from 1949 to 1960,
  the classic Box and Jenkins time series.
tags:
- transport
- time-series
owner:
  team: DataHerb
update_frequency: static
datapackage:
  resources:
  - name: airpassengers
    path: dataset/AirPassengers.csv
    format: csv
    bytes: 1746
    description: Monthly international airline passengers.
    rows: 144
    schema:
      fields:
      - name: Month
        type: string
        description: Month (YYYY-MM)
      - name: '#Passengers'
        type: integer
        description: Passengers (thousands)
---

## Source

[Air Passengers on Kaggle](https://www.kaggle.com/datasets/rakannimer/air-passengers), originally from
Box, Jenkins and Reinsel, *Time Series Analysis: Forecasting and Control*.

## Notes

- Passenger counts are in thousands.
- A common benchmark for seasonal forecasting: strong trend plus multiplicative yearly seasonality.
