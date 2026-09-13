# chDB SQL API patterns

Choose the API needed by the task. Adapt schemas, paths, and credentials; remote-source examples are not permission to access or copy data. Check the installed version for API availability.

For a focused independent local-file query reference, see [local-query.md](local-query.md).

## chdb.query() — One Line, Any Data

```python
import chdb

chdb.query("SELECT * FROM file('data.parquet', Parquet) WHERE price > 100 LIMIT 10")       # local files
chdb.query("SELECT * FROM mysql('db:3306', 'shop', 'orders', 'root', 'pass')")              # databases
chdb.query("SELECT * FROM s3('s3://bucket/data.parquet', NOSIGN) LIMIT 10")                 # cloud storage
chdb.query("SELECT * FROM deltaLake('s3://bucket/delta/table', NOSIGN) LIMIT 10")           # data lakes

# Cross-source join
chdb.query("""
    SELECT u.name, o.amount FROM mysql('db:3306', 'crm', 'users', 'root', 'pass') AS u
    JOIN file('orders.parquet', Parquet) AS o ON u.id = o.user_id ORDER BY o.amount DESC
""")

data = {"name": ["Alice", "Bob"], "score": [95, 87]}
chdb.query("SELECT * FROM Python(data) ORDER BY score DESC")                                # Python data
df = chdb.query("SELECT * FROM numbers(10)", "DataFrame")                                   # output formats
chdb.query("SELECT toDate({d:String}) + number FROM numbers({n:UInt64})",
    "DataFrame", params={"d": "2025-01-01", "n": 30})                                      # parametrized
```

Table functions → [table-functions.md](table-functions.md) | SQL functions → [sql-functions.md](sql-functions.md) | Full API → [api-reference.md](api-reference.md)

## Session — Stateful Analysis Pipelines

```python
from chdb import session as chs
sess = chs.Session("./analytics_db")   # persistent; Session() for in-memory

sess.query("CREATE TABLE users ENGINE=MergeTree() ORDER BY id AS SELECT * FROM mysql('db:3306','crm','users','root','pass')")
sess.query("CREATE TABLE events ENGINE=MergeTree() ORDER BY (ts,user_id) AS SELECT * FROM s3('s3://logs/events/*.parquet',NOSIGN)")
sess.query("""
    SELECT u.country, count() AS cnt, uniqExact(e.user_id) AS users
    FROM events e JOIN users u ON e.user_id = u.id
    WHERE e.ts >= today() - 7 GROUP BY u.country ORDER BY cnt DESC
""", "Pretty").show()
sess.close()
```

## Connection API (DB-API 2.0)

```python
from chdb import dbapi
conn = dbapi.connect()
cur = conn.cursor()
cur.execute("SELECT * FROM file('data.parquet', Parquet) WHERE value > 100")
print(cur.fetchall())
cur.close()
conn.close()
```
