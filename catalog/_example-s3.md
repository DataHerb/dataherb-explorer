---
# Files starting with "_" are ignored. Copy this to add an S3 dataset.
#
# id: orders-daily
# store: datalake            # a store of type s3 in dataherb.config.yml
# prefix: datasets/orders/   # folder holding dataherb.yml and the data files
#
# Or skip catalog entries entirely and let the builder discover every
# dataherb.{json,yml} under a prefix: see catalog.discover in the config.
---

Anything below the front matter is Markdown shown on the dataset page, above
the dataset's own documentation: caveats, how to join it, who uses it.
