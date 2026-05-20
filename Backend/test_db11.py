from database.connection import get_db_connection
import pandas as pd

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("EXEC sp_GetMeterStatus")
columns = [col[0] for col in cursor.description]
results = []
for row in cursor.fetchall():
    results.append(dict(zip(columns, row)))
print(pd.DataFrame(results))
