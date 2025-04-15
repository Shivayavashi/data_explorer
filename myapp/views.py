from django.shortcuts import render
from django.db import connection
from django.http import JsonResponse, HttpResponse
import pandas as pd
import json
import datetime
import decimal
import math
from django.conf import settings

# Add this import at the top of your views.py file
from django.views.decorators.csrf import csrf_exempt
import pandas as pd
import os
from django.conf import settings
import traceback
from django.http import JsonResponse
from django.db import connection

    
def home(request):
    return render(request, 'index.html')

def get_tables(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
        tables = [row[0] for row in cursor.fetchall()]
    print("Tables selected:", tables)
    return JsonResponse({'tables': tables})

def get_columns(request):
    table_name = request.GET.get('table')
    if not table_name:
        return JsonResponse({'error': 'No table selected'}, status=400)

    with connection.cursor() as cursor:
        # Get columns with their data types
        cursor.execute("""
            SELECT 
                column_name, 
                data_type,
                CASE 
                    WHEN data_type IN ('integer', 'numeric', 'decimal', 'double precision', 'real') THEN 'number'
                    WHEN data_type IN ('character varying', 'text', 'character') THEN 'text'
                    WHEN data_type IN ('date', 'timestamp', 'time') THEN 'date'
                    ELSE 'other'
                END as data_category
            FROM information_schema.columns 
            WHERE table_name = %s
        """, [table_name])
        
        columns = []
        for row in cursor.fetchall():
            # Skip adding duplicate patient_id columns
            if row[0] == settings.MASTER_PRIMARY_KEY and table_name != settings.MASTER_TABLE:
                continue
            columns.append({
                "name": row[0],
                "type": row[1],
                "category": row[2]
            })
        print(columns)
            
    return JsonResponse({'columns': columns})

def get_unique_values(request, column_name, table_name):
    try:
        with connection.cursor() as cursor:
            # Safely format the table and column names to prevent SQL injection
            query = """
                SELECT DISTINCT %s 
                FROM %s 
                WHERE %s IS NOT NULL 
                ORDER BY %s
            """
            # Execute the query with proper table/column name escaping
            cursor.execute(query % (
                connection.ops.quote_name(column_name),
                connection.ops.quote_name(table_name),
                connection.ops.quote_name(column_name),
                connection.ops.quote_name(column_name)
            ))
            
            # Fetch all unique values
            unique_values = [str(row[0]) for row in cursor.fetchall()]
            print(unique_values)
            print("Total: ",len(unique_values))
            return JsonResponse(unique_values, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

def build_filter_clause(filter_item, filter_values):
    """Helper function to build filter clauses based on operator and data type"""
    column = filter_item['column']
    operator = filter_item['operator']
    value = filter_item.get('value1')
    print("Value:",value)
    value2 = filter_item.get('value2')  # For between operator
   
    print("Value2:",value2)
    values=filter_item.get('values',[])
    print("Values",values)
    column_type = filter_item.get('column_type', 'text')  # Get column type if provided
    print(column_type)
    # Operator mapping
    operator_map = {
        'eq': '=',
        'neq': '!=',
        'gt': '>',
        'gte': '>=',
        'lt': '<',
        'lte': '<=',
        'startswith': 'LIKE',
        'endswith': 'LIKE',
        'contains': 'LIKE',
        'notcontains': 'NOT LIKE',
        'between': 'BETWEEN',
        'in': 'IN',
        'notin': 'NOT IN'
    }
     # Handle date/datetime values
    if column_type == 'time without time zone':
        try:
            # Parse time string to time object
            if value:
                # Handle various time input formats
                if ':' not in value:
                    # If only hours provided, add minutes and seconds
                    value = f"{value}:00:00"
                elif value.count(':') == 1:
                    # If only hours and minutes provided, add seconds
                    value = f"{value}:00"
                
                # Validate time format
                datetime.datetime.strptime(value, '%H:%M:%S')
            
            if value2:
                if ':' not in value2:
                    value2 = f"{value2}:00:00"
                elif value2.count(':') == 1:
                    value2 = f"{value2}:00"
                
                datetime.datetime.strptime(value2, '%H:%M:%S')
                
        except (ValueError, TypeError):
            raise ValueError(f"Invalid time format for column {column}. Use HH:MM:SS format")
    if column_type in ['date', 'datetime']:
        try:
            # Parse date string to datetime object
            if value:
                date_value = datetime.strptime(value, '%Y-%m-%d')
                value = date_value.strftime('%Y-%m-%d')
            if value2:
                date_value2 = datetime.strptime(value2, '%Y-%m-%d')
                value2 = date_value2.strftime('%Y-%m-%d')
                
            # Add time component for more precise datetime filtering if needed
            if column_type == 'datetime':
                if operator in ['eq', 'gte', 'gt']:
                    value = f"{value} 00:00:00"
                elif operator in ['lte', 'lt']:
                    value = f"{value} 23:59:59"
                
                if operator == 'between':
                    value = f"{value} 00:00:00"
                    value2 = f"{value2} 23:59:59"
                    
        except (ValueError, TypeError):
            raise ValueError(f"Invalid date format for column {column}")
    # Format value based on operator
    sql_operator = operator_map[operator]
    print("sql operator",sql_operator)
    if operator in ['in', 'notin']:
        if not isinstance(values, list) or not values:
            raise ValueError(f"Invalid value for '{operator}' operator on column {column}. It must be a non-empty list.")
        placeholders = ', '.join(['%s'] * len(values))
        print("Filter_Values:",filter_values)
        filter_values.extend(values)
        return f"{column} {sql_operator} ({placeholders})"
    
    if operator in ['startswith']:
        filter_values.append(f"{value}%")
    elif operator in ['endswith']:
        filter_values.append(f"%{value}")
    elif operator in ['contains', 'notcontains']:
        filter_values.append(f"%{value}%")
    elif operator == 'between':
        filter_values.extend([value, value2])
        return f"{column} BETWEEN %s AND %s"
    else:
        filter_values.append(value)
    
    return f"{column} {operator_map[operator]} %s"
    
def build_having_clause(having_item, having_values):
    """Helper function to build HAVING clauses based on aggregate function, operator, and value"""
    agg_function = having_item['function']
    print("Build_having_clause Agg function:", agg_function)
    column = having_item['column']
    print("Build_having_clause col:", column)
    operator = having_item['operator']
    print("Build_having_clause op:", operator)
    value = having_item['value']
    print("Build_having_clause value:", value)
    operator_map = {
        'eq': '=',
        'neq': '!=',
        'gt': '>',
        'gte': '>=',
        'lt': '<',
        'lte': '<='
    }
    
    sql_operator = operator_map[operator]
    # Convert value to int if it's a digit string
    if isinstance(value, str) and value.isdigit():
        value = int(value)
    having_values.append(value)
    
    return f"{agg_function}({column}) {sql_operator} %s"

def normalize_sort_column(sort_column):
    if sort_column and '_' in sort_column:
        # Split on the first dot
        parts = sort_column.split('_', 1)
        # Check if the first part is an aggregation function
        aggregation_functions = ['count', 'sum', 'avg', 'min', 'max']
        print(parts[0])
        if parts[0].lower() in aggregation_functions:
            # Replace underscore with dot in the remaining part
            column_part = parts[1].replace('_', '.',1)
            # Reconstruct in the format "function(table.column)"
            return f"{parts[0]}({column_part})"
    # Return unchanged if no reformatting needed
    return sort_column

def generate_data(request):
    try:
        selected_columns = request.GET.getlist('columns[]')
        filters = json.loads(request.GET.get('filters', '[]'))
        print("Received filters:", filters)
        for filter_item in filters:
            print("Filter item:", filter_item)
            print("value1:", filter_item.get('value1'))
            print("value2:", filter_item.get('value2'))
        group_by = request.GET.getlist('groupBy[]')
        aggregations = json.loads(request.GET.get('aggregations', '[]'))
        print("Aggregation: ", aggregations)
        having_conditions = json.loads(request.GET.get('having', '[]'))  # New parameter for having
        print("Having : ", having_conditions)

        sort_column = request.GET.get('sort_column')  # New sorting parameter
        sort_direction = request.GET.get('sort_direction', 'asc')
        print("Sort column",sort_column)
        print("Sort direction",sort_direction)
        is_excel_export = request.GET.get('for_excel', 'false') == 'true'
        print("Filters:", filters)
        if not is_excel_export:
            page = int(request.GET.get('page', 1))
            page_size = int(request.GET.get('page_size', 100))
            offset = (page - 1) * page_size
        
        if not selected_columns:
            return JsonResponse({'error': 'No columns selected'}, status=400)

        # Build the base query
        formatted_columns = []
        tables = set()

        # Handle group by and aggregations
        if group_by:
            formatted_columns.extend(group_by)
            for agg in aggregations:
                formatted_columns.append(
                    f"{agg['function']}({agg['column']}) as {agg['function']}_{agg['column'].replace('.', '_')}"
                )
            print("\nFormat", formatted_columns)
        else:
            formatted_columns = selected_columns

        print("Formatted columns",formatted_columns)
        # Extract tables from columns and handle duplicates
        for column in selected_columns + ([] if not group_by else group_by):
            if '.' in column:
                table, col = column.split('.')
                tables.add(table)
        print("Tables:", tables)
        query = f"SELECT {', '.join(formatted_columns)} FROM {settings.MASTER_TABLE}"

        print("Query : ", query)
        # Add joins
        print(tables)
        for table in tables:
            if table != settings.MASTER_TABLE:
                query += f" INNER JOIN {table} ON {table}.{settings.MASTER_PRIMARY_KEY} = {settings.MASTER_TABLE}.{settings.MASTER_PRIMARY_KEY}"
        print("Query after join : ", query)
        
        # Add WHERE clause for filters with proper type casting
        where_clauses = []
        filter_values = []
            
        if filters:
            for f in filters:
                try:
                    where_clause = build_filter_clause(f, filter_values)
                    if where_clause:
                        where_clauses.append(where_clause)
                except Exception as e:
                    return JsonResponse({'error': f'Error building filter: {str(e)}'}, status=400)
                
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)
        
        if group_by:
            query += f" GROUP BY {', '.join(group_by)}"
          
        having_clauses = []
        having_values = []
        if having_conditions:
            for h in having_conditions:
                having_clause = build_having_clause(h, having_values)
                if having_clause:
                    having_clauses.append(having_clause)
        
        if having_clauses:
            query += " HAVING " + " AND ".join(having_clauses)
        
        if sort_column:  # Don't apply sorting for Excel export
            # Validate that sort_column is one of the selected columns or aggregation results
            valid_sort_columns = set(selected_columns + [f"{agg['function'].lower()}_{agg['column'].replace('.', '_')}" 
                                                       for agg in aggregations])
            print("Valid sort columns",valid_sort_columns)
            if sort_column in valid_sort_columns:
                   sort_column=normalize_sort_column(sort_column)
                   print("Formatted sort col :",sort_column)
                   direction = 'ASC' if sort_direction.lower() == 'asc' else 'DESC'
                   query += f" ORDER BY {sort_column} {direction}"
            else:
                print(f"Warning: Invalid sort column {sort_column} requested")

        # Combine all parameter values for query execution
        all_params = filter_values + having_values if filter_values or having_values else None

        print("Final Query:", query)
        print("Parameters:", all_params)
        
        # Create count query
        count_query = f"SELECT COUNT(*) FROM ({query}) AS count_query"
        
        with connection.cursor() as cursor:
            cursor.execute(count_query, all_params)
            total_count = cursor.fetchone()[0]
        
        responsequery = query
        # Add pagination
        if not is_excel_export:
            query += f" LIMIT {page_size} OFFSET {offset}"

        print(f"Executing paginated query: {query}")
                
        with connection.cursor() as cursor:
            cursor.execute(query, all_params)
            columns = [desc[0] for desc in cursor.description]
            for desc in cursor.description:
                print(desc)
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                result_dict = {}
                for i, col in enumerate(columns):
                    value = row[i]
                    if isinstance(value, (datetime.date, datetime.datetime)):
                        value = value.isoformat()
                    elif isinstance(value, decimal.Decimal):
                        value = float(value)
                    result_dict[col] = value
                results.append(result_dict)
            
            response_data = {
                'columns': columns,
                'data': results,
                'sql_query': responsequery
            }
            if all_params:
                display_query = responsequery
                for param in all_params:
                    # Format the parameter based on its type
                    if param is None:
                        param_str = 'NULL'
                    elif isinstance(param, str):
                        # Escape quotes and wrap in quotes
                        param_str = f"'{param.replace('\'', '\'\'')}'"
                    elif isinstance(param, (int, float)):
                        param_str = str(param)
                    elif isinstance(param, bool):
                        param_str = 'TRUE' if param else 'FALSE'
                    elif isinstance(param, (datetime.date, datetime.datetime)):
                        param_str = f"'{param.isoformat()}'"
                    else:
                        param_str = f"'{str(param)}'"
                    
                    # Replace the first occurrence of %s with the formatted parameter
                    display_query = display_query.replace('%s', param_str, 1)
                
                # Update the response with the display query containing actual values
                response_data['sql_query'] = display_query
            print("response columns",columns)
            if not is_excel_export:
                response_data.update({
                    'total_count': total_count,
                    'page': page,
                    'page_size': page_size,
                    'total_pages': math.ceil(total_count / page_size),
                    'sort_column': sort_column,
                    'sort_direction': sort_direction
                })

            return JsonResponse(response_data)
    
    except Exception as e:
        print(f"Error executing query: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


def export_excel(request):
    # Remove pagination parameters for Excel export
    request_get = request.GET.copy()
    request_get['for_excel'] = 'true'
    
    # Create a new request object with modified GET parameters
    class ModifiedRequest:
        def __init__(self, original_request, new_get):
            self.GET = new_get
            self.method = original_request.method
            self.headers = original_request.headers
            
    modified_request = ModifiedRequest(request, request_get)
    
    # Get all data without pagination
    response_data = generate_data(modified_request)
    
    if isinstance(response_data, JsonResponse):
        data = response_data.content
        json_data = json.loads(data)
        
        if 'error' in json_data:
            return response_data
        
        df = pd.DataFrame(json_data['data'])
        current_date = datetime.datetime.now().strftime('%d-%m-%Y')
        filename = f"Generated_data_{current_date}.xlsx"
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        # Write to Excel without the index
        df.to_excel(response, index=False)
        return response
    
    return JsonResponse({'error': 'Failed to generate data'}, status=500)


@csrf_exempt
def import_excel(request):
    """
    Import data from an Excel file to a user-specified table.
    Ensures the Excel file has a 'patient_id' column.
    Creates the table with appropriate data types based on Excel column content.
    """
    if request.method != 'POST' or not request.FILES.get('excel_file'):
        return JsonResponse({'success': False, 'error': 'No file uploaded'}, status=400)
    
    try:
        excel_file = request.FILES['excel_file']
        
        # Get table name from request, default to "source_data" if not provided
        table_name = request.POST.get('table_name')
        
        # Validate table name (basic validation to prevent SQL injection)
        if not table_name.isalnum() and not all(c.isalnum() or c == '_' for c in table_name):
            return JsonResponse({
                'success': False, 
                'error': 'Invalid table name. Use only letters, numbers, and underscores.'
            }, status=400)
        
        # Check file extension
        file_ext = os.path.splitext(excel_file.name)[1].lower()
        if file_ext not in ['.xlsx', '.xls']:
            return JsonResponse({
                'success': False, 
                'error': 'Invalid file format. Please upload an Excel file (.xlsx or .xls)'
            }, status=400)
        
        # Read Excel file
        try:
            df = pd.read_excel(excel_file)
        except Exception as e:
            return JsonResponse({
                'success': False, 
                'error': f'Error reading Excel file: {str(e)}'
            }, status=400)
        
        # Validate that patient_id column exists
        if 'patient_id' not in df.columns:
            return JsonResponse({
                'success': False, 
                'error': 'Excel file must contain a "patient_id" column'
            }, status=400)
        
        # Clean up data - handle NaN values
        df = df.fillna('')
        
        # Determine appropriate SQL data types based on pandas dtypes
        sql_data_types = {}
        for col in df.columns:
            dtype = df[col].dtype
            if col == 'patient_id':
                sql_data_types[col] = "INTEGER"
            elif pd.api.types.is_integer_dtype(dtype):
                sql_data_types[col] = "INTEGER"
            elif pd.api.types.is_float_dtype(dtype):
                sql_data_types[col] = "NUMERIC"
            elif pd.api.types.is_datetime64_any_dtype(dtype):
                sql_data_types[col] = "TIMESTAMP"
            elif pd.api.types.is_bool_dtype(dtype):
                sql_data_types[col] = "BOOLEAN"
            else:
                # For object, string, categorical, etc.
                sql_data_types[col] = "TEXT"
        
        # Create the table with appropriate data types
        with connection.cursor() as cursor:
            # Build column definitions
            columns = [f"{col} {sql_data_types[col]}" for col in df.columns]
            
            # Create table with detected data types
            create_table_sql = f"""
                CREATE TABLE {table_name} (
                    {', '.join(columns)},
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
                );
            """
            cursor.execute(create_table_sql)
            
            # Insert data into table
            rows_added = 0
            for _, row in df.iterrows():
                # Build insert query with proper type handling
                columns = [col for col in df.columns]
                placeholders = ["%s"] * len(columns)
                
                # Convert values based on detected types
                values = []
                for col in columns:
                    val = row[col]
                    if val == '':
                        values.append(None)
                    elif sql_data_types[col] == "BOOLEAN":
                        values.append(bool(val))
                    elif sql_data_types[col] == "INTEGER":
                        values.append(int(val))
                    elif sql_data_types[col] == "NUMERIC":
                        values.append(float(val))
                    else:
                        values.append(str(val))
                
                insert_sql = f"""
                    INSERT INTO {table_name} ({', '.join(columns)})
                    VALUES ({', '.join(placeholders)});
                """
                cursor.execute(insert_sql, values)
                rows_added += 1
        
        return JsonResponse({
            'success': True,
            'rows_added': rows_added,
            'table_name': table_name,
            'message': f'Successfully imported {rows_added} rows into {table_name} table'
        })
    
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Error importing Excel file: {error_details}")
        return JsonResponse({
            'success': False,
            'error': f'Error processing Excel file: {str(e)}'
        }, status=500)
    
# @csrf_exempt
# def import_excel(request):
#     """
#     Import data from an Excel file to a user-specified table.
#     Ensures the Excel file has a 'p_id' column.
#     """
#     if request.method != 'POST' or not request.FILES.get('excel_file'):
#         return JsonResponse({'success': False, 'error': 'No file uploaded'}, status=400)
    
#     try:
#         excel_file = request.FILES['excel_file']
        
#         # Get table name from request, default to "source_data" if not provided
#         table_name = request.POST.get('table_name')
        
#         # Validate table name (basic validation to prevent SQL injection)
#         if not table_name.isalnum() and not all(c.isalnum() or c == '_' for c in table_name):
#             return JsonResponse({
#                 'success': False, 
#                 'error': 'Invalid table name. Use only letters, numbers, and underscores.'
#             }, status=400)
        
#         # Check file extension
#         file_ext = os.path.splitext(excel_file.name)[1].lower()
#         if file_ext not in ['.xlsx', '.xls']:
#             return JsonResponse({
#                 'success': False, 
#                 'error': 'Invalid file format. Please upload an Excel file (.xlsx or .xls)'
#             }, status=400)
        
#         # Read Excel file
#         try:
#             df = pd.read_excel(excel_file)
#         except Exception as e:
#             return JsonResponse({
#                 'success': False, 
#                 'error': f'Error reading Excel file: {str(e)}'
#             }, status=400)
        
#         # Validate that p_id column exists
#         if 'patient_id' not in df.columns:
#             return JsonResponse({
#                 'success': False, 
#                 'error': 'Excel file must contain a "patient_id" column'
#             }, status=400)
        
#         # Clean up data - handle NaN values
#         df = df.fillna('')
        
#         # Create the table if it doesn't exist
#         with connection.cursor() as cursor:
#             # Check if table exists
#             cursor.execute("""
#                 SELECT EXISTS (
#                     SELECT FROM information_schema.tables 
#                     WHERE table_schema = 'public' 
#                     AND table_name = %s
#                 );
#             """, [table_name])
#             table_exists = cursor.fetchone()[0]
            
#             if not table_exists:
#                 # Create table with dynamic columns based on the Excel file
#                 columns = []
#                 for col in df.columns:
#                     if col == 'p_id':
#                         columns.append(f"{col} VARCHAR(255) NOT NULL")
#                     else:
#                         columns.append(f"{col} TEXT")
                
#                 create_table_sql = f"""
#                     CREATE TABLE {table_name} (
#                         id SERIAL PRIMARY KEY,
#                         {', '.join(columns)},
#                         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
#                         FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
#                     );
#                 """
#                 cursor.execute(create_table_sql)
#             else:
#                 # Check existing columns and add any new ones from the Excel file
#                 cursor.execute("""
#                     SELECT column_name FROM information_schema.columns 
#                     WHERE table_name = %s AND table_schema = 'public';
#                 """, [table_name])
#                 existing_columns = [row[0] for row in cursor.fetchall()]
                
#                 for col in df.columns:
#                     if col.lower() not in [c.lower() for c in existing_columns] and col != 'id' and col != 'created_at':
#                         cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col} TEXT;")
            
#             # Insert data into table
#             rows_added = 0
#             for _, row in df.iterrows():
#                 # Build insert query
#                 columns = [col for col in df.columns]
#                 placeholders = ["%s"] * len(columns)
#                 values = [str(row[col]) if row[col] != '' else None for col in columns]
                
#                 insert_sql = f"""
#                     INSERT INTO {table_name} ({', '.join(columns)})
#                     VALUES ({', '.join(placeholders)});
#                 """
#                 cursor.execute(insert_sql, values)
#                 rows_added += 1
        
#         return JsonResponse({
#             'success': True,
#             'rows_added': rows_added,
#             'table_name': table_name,
#             'message': f'Successfully imported {rows_added} rows into {table_name} table'
#         })
    
#     except Exception as e:
#         error_details = traceback.format_exc()
#         print(f"Error importing Excel file: {error_details}")
#         return JsonResponse({
#             'success': False,
#             'error': f'Error processing Excel file: {str(e)}'
#         }, status=500)