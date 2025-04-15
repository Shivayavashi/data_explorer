import psycopg2
from psycopg2 import sql

def load_csv_to_table(connection, table_name, csv_file_path):
    try:
        cursor = connection.cursor()
        # Construct the COPY command
        copy_sql = sql.SQL("""
            COPY {table_name} FROM STDIN WITH CSV HEADER DELIMITER ',';
        """).format(table_name=sql.Identifier(table_name))

        # Open the CSV file and execute the COPY command
        with open(csv_file_path, 'r') as file:
            cursor.copy_expert(copy_sql, file)
        
        # Commit the transaction
        connection.commit()
        print(f"Data loaded successfully into table '{table_name}'")
    
    except Exception as e:
        print(f"Error loading data into table '{table_name}': {e}")
        connection.rollback()
    
    finally:
        cursor.close()

# Database connection parameters
db_params = {
    "dbname": "source_data",
    "user": "postgres",
    "password": "admin",
    "host": "localhost",  # Change if using a remote server
    "port": 5432          # Default PostgreSQL port
}

# File-to-table mapping
csv_files = {
    "treatment_plan":"C:/Users/TRAINING40/Downloads/treatment_plan.csv"
    # "lifestyle":"C:/Users/TRAINING40/Downloads/lifestyle.csv"
    # "patients":"C:/Users/TRAINING40/Downloads/patients.csv",
    # "eye_examination":"C:/Users/TRAINING40/Downloads/eye_examination.csv",
    # "ophthalmic_history":"C:/Users/TRAINING40/Downloads/ophthalmic_history.csv",
    # "insurance":"C:/Users/TRAINING40/Downloads/insurance.csv",
    # "diagnosis":"C:/Users/TRAINING40/Downloads/diagnosis.csv",
    # "appointments":"C:/Users/TRAINING40/Downloads/appointments.csv"
}

if __name__ == "__main__":
    try:
        # Connect to the database
        conn = psycopg2.connect(**db_params)
        print("Connected to the database")
        
        # Load CSV files into respective tables
        for table, file_path in csv_files.items():
            load_csv_to_table(conn, table, file_path)
    
    except Exception as e:
        print(f"Database connection failed: {e}")
    
    finally:
        if conn:
            conn.close()
            print("Database connection closed")