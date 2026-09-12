# DataStore patterns

Adapt these examples to the installed chDB version and actual source schema. They illustrate supported operations, not guaranteed compatibility with every pandas program.

## Connect to Any Data Source — One Pattern

```python
from datastore import DataStore

# Local file (auto-detects .parquet, .csv, .json, .arrow, .orc, .avro, .tsv, .xml)
ds = DataStore.from_file("sales.parquet")

# Database
ds = DataStore.from_mysql(host="db:3306", database="shop", table="orders", user="root", password="pass")

# Cloud storage
ds = DataStore.from_s3("s3://bucket/data.parquet", nosign=True)

# URI shorthand — auto-detects source type
ds = DataStore.uri("mysql://root:pass@db:3306/shop/orders")
```

All 16+ sources and URI schemes → [connectors.md](connectors.md)

## DataFrame operations

```python
result = ds[ds["age"] > 25]                                          # filter
result = ds[["name", "city"]]                                        # select columns
result = ds.sort_values("revenue", ascending=False)                  # sort
result = ds.groupby("dept")["salary"].mean()                         # groupby
result = ds.assign(margin=lambda x: x["profit"] / x["revenue"])     # computed column
ds["name"].str.upper()                                               # string accessor
ds["date"].dt.year                                                   # datetime accessor
result = ds1.join(ds2, on="id")                                      # join
result = ds.head(10)                                                 # preview
print(ds.to_sql())                                                   # see generated SQL
```

Supported method signatures → [api-reference.md](api-reference.md)

## Cross-source joins

```python
from datastore import DataStore

customers = DataStore.from_mysql(host="db:3306", database="crm", table="customers", user="root", password="pass")
orders = DataStore.from_file("orders.parquet")

result = (orders
    .join(customers, left_on="customer_id", right_on="id")
    .groupby("country")
    .agg({"amount": "sum", "rating": "mean"})
    .sort_values("sum", ascending=False))
print(result)
```

More join examples → [examples.md](../examples/examples.md)

## Writing Data

```python
source = DataStore.from_mysql(host="db:3306", database="shop", table="orders", user="root", password="pass")
target = DataStore("file", path="summary.parquet", format="Parquet")

target.insert_into("category", "total", "count").select_from(
    source.groupby("category").select("category", "sum(amount) AS total", "count() AS count")
).execute()
```
