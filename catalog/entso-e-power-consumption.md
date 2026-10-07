---
id: entso-e-power-consumption
repo: DataHerb/dataset-ENTSO-E-power-comsumption
inline: true
name: ENTSO-E power consumption by country
description: Actual total electricity load per country from the ENTSO-E Transparency
  Platform, 2015 to August 2020 at 15-minute or hourly resolution, one CSV per country
  (ISO 3166 alpha-2 codes).
tags:
- energy
- time-series
owner:
  team: DataHerb
datapackage:
  resources:
  - name: at
    path: dataset/at.csv
    format: csv
    bytes: 11552109
    description: Electricity load for AT, one row per interval.
    rows: 195744
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: be
    path: dataset/be.csv
    format: csv
    bytes: 11639920
    description: Electricity load for BE, one row per interval.
    rows: 195744
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: ch
    path: dataset/ch.csv
    format: csv
    bytes: 2887293
    description: Electricity load for CH, one row per interval.
    rows: 48936
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: de
    path: dataset/de.csv
    format: csv
    bytes: 11923226
    description: Electricity load for DE, one row per interval.
    rows: 198721
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: dk
    path: dataset/dk.csv
    format: csv
    bytes: 2887121
    description: Electricity load for DK, one row per interval.
    rows: 48934
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: es
    path: dataset/es.csv
    format: csv
    bytes: 2934135
    description: Electricity load for ES, one row per interval.
    rows: 48902
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: fr
    path: dataset/fr.csv
    format: csv
    bytes: 2932216
    description: Electricity load for FR, one row per interval.
    rows: 48870
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: gb
    path: dataset/gb.csv
    format: csv
    bytes: 5868673
    description: Electricity load for GB, one row per interval.
    rows: 97814
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: ie
    path: dataset/ie.csv
    format: csv
    bytes: 5731747
    description: Electricity load for IE, one row per interval.
    rows: 97148
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: it
    path: dataset/it.csv
    format: csv
    bytes: 2936175
    description: Electricity load for IT, one row per interval.
    rows: 48936
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: lu
    path: dataset/lu.csv
    format: csv
    bytes: 11517595
    description: Electricity load for LU, one row per interval.
    rows: 198721
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: nl
    path: dataset/nl.csv
    format: csv
    bytes: 11720458
    description: Electricity load for NL, one row per interval.
    rows: 195744
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: 'no'
    path: dataset/no.csv
    format: csv
    bytes: 2928499
    description: Electricity load for NO, one row per interval.
    rows: 48819
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: pt
    path: dataset/pt.csv
    format: csv
    bytes: 2887239
    description: Electricity load for PT, one row per interval.
    rows: 48936
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
  - name: se
    path: dataset/se.csv
    format: csv
    bytes: 2931936
    description: Electricity load for SE, one row per interval.
    rows: 48887
    schema:
      fields:
      - name: start
        type: datetime
        description: Interval start (UTC)
      - name: end
        type: datetime
        description: Interval end (UTC)
      - name: load
        type: number
        description: Actual total load (MW)
---

## Source

[ENTSO-E Transparency Platform](https://transparency.entsoe.eu/), "Actual Total Load" per bidding zone.

## Files

One CSV per country, named by ISO 3166 alpha-2 code:

| File | Country | File | Country |
| --- | --- | --- | --- |
| `at.csv` | Austria | `gb.csv` | Great Britain |
| `be.csv` | Belgium | `ie.csv` | Ireland |
| `ch.csv` | Switzerland | `it.csv` | Italy |
| `de.csv` | Germany | `lu.csv` | Luxembourg |
| `dk.csv` | Denmark | `nl.csv` | Netherlands |
| `es.csv` | Spain | `no.csv` | Norway |
| `fr.csv` | France | `pt.csv` | Portugal |
| | | `se.csv` | Sweden |

## Notes

- Resolution differs by country: 15 minutes for some (e.g. DE, NL, AT, BE, LU), hourly for others.
- Timestamps are UTC.
