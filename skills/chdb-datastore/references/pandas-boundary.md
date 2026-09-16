# Preserving pandas behavior at a DataStore boundary

Use this guide when migrating an existing pandas function or returning pandas
objects with a specified contract. A pandas-style API is not a blanket guarantee
of identical behavior for every workload or installed version.

## Alignment, computation and representation

Keep the reference's label-matching semantics. An existing pandas `reindex` or
alignment step on in-memory inputs can remain at the boundary; translating it
into a join is not automatically equivalent. Do not coerce label types merely
to make a join work. Duplicate labels and grouped results require their own
matching contract, rather than assuming one output row per input row.

Give DataStore the columns needed for meaningful filtering, arithmetic or
aggregation. A passthrough conversion followed by an entirely pandas calculation
does not accomplish a requested DataStore migration. Prefer supported DataStore
operations over reconstructing pandas semantics in custom SQL. DataStore may
use pandas for some operations; forcing a physical SQL backend is a separate
requirement, not inherent in using its API.

When exact output metadata matters, retain unchanged index/column metadata and
values outside unnecessary conversions. Casting a returned column to `object`
cannot recover distinctions already lost in its values. If rows are filtered or
reordered, carry a reliable row identity and restore the corresponding original
rows; do not attach metadata in the original order after sorting. Aggregation
needs an explicit group-to-output mapping instead of this row-preserving recipe.

## Materialization and order

Use `.to_df()` (or its alias `.to_pandas()`) when an actual pandas DataFrame is
needed. For large or remote sources, keep useful filtering, projection and
aggregation lazy before materializing; boundary preservation is not a reason
to load the whole source eagerly.

For pandas ordering semantics, use supported options such as
`.sort_values(..., kind="stable", na_position="last")` and compare results on the
installed version. A bounded pandas finishing step is also valid when needed
for the contract. Raw SQL ordering needs explicit treatment of ties and missing
values; SQL NULL and arithmetic NaN need not behave like pandas missing values.

For example, this row-preserving calculation keeps a sensor frame's original
index and descriptive columns while DataStore converts and ranks its finite
float64 Celsius readings:

```python
from chdb.datastore import DataStore

def rank_readings(readings):
    ds = DataStore({
        "_row": list(range(len(readings))),
        "celsius": readings["celsius"].to_numpy(),
    })
    ds["fahrenheit"] = ds["celsius"] * 1.8 + 32.0
    ranked = ds.sort_values(
        "fahrenheit", kind="stable", na_position="last"
    ).to_df()
    result = readings.iloc[ranked["_row"].to_numpy(dtype="int64")].copy()
    result["fahrenheit"] = ranked["fahrenheit"].to_numpy(dtype="float64")
    return result
```

Compare representative outputs and input preservation against the pandas
reference, including required labels, ordering, missing values and dtypes.
Inspect `.explain()` when backend placement matters: a `.to_sql()` string alone
does not describe every stage of a mixed pipeline. Measure speed separately
from correctness; small compatibility examples are not performance benchmarks.

Sources: [execution and materialization](https://clickhouse.com/docs/chdb/datastore/execution-model),
[pandas differences](https://clickhouse.com/docs/chdb/guides/pandas-differences),
and [plan inspection](https://clickhouse.com/docs/chdb/debugging/explain).
