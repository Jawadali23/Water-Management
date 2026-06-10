import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database.connection import get_db_connection

def main():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        with open("cols_inspect.txt", "w", encoding="utf-8") as f:
            cursor.execute("SELECT * FROM manual_reading")
            cols = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            
            f.write("=== Column Status (Non-null count out of 100 rows) ===\n")
            non_null_counts = {col: 0 for col in cols}
            non_empty_counts = {col: 0 for col in cols}
            
            for row in rows:
                for col_name, val in zip(cols, row):
                    if val is not None:
                        non_null_counts[col_name] += 1
                        if str(val).strip() != "":
                            non_empty_counts[col_name] += 1
                            
            for col in cols:
                f.write(f"{col}: non-null={non_null_counts[col]}, non-empty={non_empty_counts[col]}\n")
                
            # Let's search if there's any row in the entire table where these columns are not null or empty
            f.write("\n=== Checking entire table for any non-empty values ===\n")
            for col in cols:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM manual_reading WHERE [{col}] IS NOT NULL AND RTRIM(LTRIM(CAST([{col}] AS VARCHAR))) <> ''")
                    cnt = cursor.fetchone()[0]
                    f.write(f"Total non-empty in [{col}]: {cnt}\n")
                except Exception as err:
                    f.write(f"Error checking [{col}]: {err}\n")
                    
        print("Done writing cols_inspect.txt")
        conn.close()
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
