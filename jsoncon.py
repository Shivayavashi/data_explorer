import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import json
import psycopg2
import pandas as pd
from pandastable import Table
import os
import configparser

class PostgresToJSONApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PostgreSQL to JSON Table Converter")
        self.root.geometry("1200x800")
        
        # Create config file if it doesn't exist
        self.config = configparser.ConfigParser()
        self.config_file = "postgres_config.ini"
        if os.path.exists(self.config_file):
            self.config.read(self.config_file)
        else:
            self.create_default_config()
        
        # Setup UI components
        self.create_notebook()
        self.setup_connection_frame()
        self.setup_query_frame()
        self.setup_table_frame()
        self.setup_json_frame()
        self.setup_json_import_frame()
    
    def create_default_config(self):
        self.config["PostgreSQL"] = {
            "host": "localhost",
            "port": "5432",
            "user": "postgres",
            "password": "",
            "database": ""
        }
        with open(self.config_file, 'w') as f:
            self.config.write(f)
    
    def create_notebook(self):
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill='both', expand=True, padx=10, pady=10)
        
    def setup_connection_frame(self):
        self.connection_frame = ttk.Frame(self.notebook)
        self.notebook.add(self.connection_frame, text="PostgreSQL Connection")
        
        # PostgreSQL connection
        self.postgres_frame = ttk.LabelFrame(self.connection_frame, text="Connection Parameters")
        self.postgres_frame.grid(row=0, column=0, columnspan=3, padx=10, pady=10, sticky="ew")
        
        ttk.Label(self.postgres_frame, text="Host:").grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.postgres_host = tk.StringVar(value=self.config.get("PostgreSQL", "host", fallback="localhost"))
        ttk.Entry(self.postgres_frame, textvariable=self.postgres_host).grid(row=0, column=1, padx=10, pady=5, sticky="w")
        
        ttk.Label(self.postgres_frame, text="Port:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
        self.postgres_port = tk.StringVar(value=self.config.get("PostgreSQL", "port", fallback="5432"))
        ttk.Entry(self.postgres_frame, textvariable=self.postgres_port).grid(row=1, column=1, padx=10, pady=5, sticky="w")
        
        ttk.Label(self.postgres_frame, text="Username:").grid(row=2, column=0, padx=10, pady=5, sticky="w")
        self.postgres_user = tk.StringVar(value=self.config.get("PostgreSQL", "user", fallback="postgres"))
        ttk.Entry(self.postgres_frame, textvariable=self.postgres_user).grid(row=2, column=1, padx=10, pady=5, sticky="w")
        
        ttk.Label(self.postgres_frame, text="Password:").grid(row=3, column=0, padx=10, pady=5, sticky="w")
        self.postgres_password = tk.StringVar(value=self.config.get("PostgreSQL", "password", fallback=""))
        ttk.Entry(self.postgres_frame, textvariable=self.postgres_password, show="*").grid(row=3, column=1, padx=10, pady=5, sticky="w")
        
        ttk.Label(self.postgres_frame, text="Database:").grid(row=4, column=0, padx=10, pady=5, sticky="w")
        self.postgres_database = tk.StringVar(value=self.config.get("PostgreSQL", "database", fallback=""))
        ttk.Entry(self.postgres_frame, textvariable=self.postgres_database).grid(row=4, column=1, padx=10, pady=5, sticky="w")
        
        # Connect button
        ttk.Button(self.connection_frame, text="Connect", command=self.connect_database).grid(row=1, column=0, columnspan=3, padx=10, pady=10)
        
        # Connection status
        self.connection_status = ttk.Label(self.connection_frame, text="Status: Not Connected", foreground="red")
        self.connection_status.grid(row=2, column=0, columnspan=3, padx=10, pady=10)
    
    def setup_query_frame(self):
        self.query_frame = ttk.Frame(self.notebook)
        self.notebook.add(self.query_frame, text="Query", state="disabled")
        
        ttk.Label(self.query_frame, text="Tables:").grid(row=0, column=0, padx=10, pady=10, sticky="w")
        self.tables_combobox = ttk.Combobox(self.query_frame, state="readonly", width=30)
        self.tables_combobox.grid(row=0, column=1, padx=10, pady=10, sticky="w")
        self.tables_combobox.bind("<<ComboboxSelected>>", self.load_table_columns)
        ttk.Button(self.query_frame, text="Refresh Tables", command=self.load_tables).grid(row=0, column=2, padx=10, pady=10)
        
        ttk.Label(self.query_frame, text="SQL Query:").grid(row=1, column=0, padx=10, pady=10, sticky="nw")
        self.query_text = scrolledtext.ScrolledText(self.query_frame, height=10)
        self.query_text.grid(row=1, column=1, columnspan=2, padx=10, pady=10, sticky="nsew")
        
        ttk.Button(self.query_frame, text="Execute Query", command=self.execute_query).grid(row=2, column=2, padx=10, pady=10, sticky="e")
    
    def setup_table_frame(self):
        self.table_frame = ttk.Frame(self.notebook)
        self.notebook.add(self.table_frame, text="Table View", state="disabled")
        
        # This frame will hold the pandastable
        self.pt_frame = ttk.Frame(self.table_frame)
        self.pt_frame.pack(fill='both', expand=True)
        
        # Add export button
        self.table_button_frame = ttk.Frame(self.table_frame)
        self.table_button_frame.pack(fill='x', padx=10, pady=5)
        ttk.Button(self.table_button_frame, text="Export to CSV", command=self.export_to_csv).pack(side=tk.RIGHT, padx=5)
    
    def setup_json_frame(self):
        self.json_frame = ttk.Frame(self.notebook)
        self.notebook.add(self.json_frame, text="JSON", state="disabled")
        
        self.json_text = scrolledtext.ScrolledText(self.json_frame, wrap=tk.WORD)
        self.json_text.pack(fill='both', expand=True, padx=10, pady=10)
        
        button_frame = ttk.Frame(self.json_frame)
        button_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Button(button_frame, text="Save JSON", command=self.save_json).pack(side=tk.RIGHT, padx=5)
    
    def setup_json_import_frame(self):
        self.json_import_frame = ttk.Frame(self.notebook)
        self.notebook.add(self.json_import_frame, text="Import JSON")
        
        # Top frame for import controls
        import_ctrl_frame = ttk.Frame(self.json_import_frame)
        import_ctrl_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Button(import_ctrl_frame, text="Load JSON File", command=self.load_json_file).pack(side=tk.LEFT, padx=5)
        ttk.Button(import_ctrl_frame, text="Paste from Clipboard", command=self.paste_json).pack(side=tk.LEFT, padx=5)
        ttk.Button(import_ctrl_frame, text="Convert to Table", command=self.convert_json_to_table).pack(side=tk.RIGHT, padx=5)
        
        # JSON preview
        ttk.Label(self.json_import_frame, text="JSON Content:").pack(anchor="w", padx=10, pady=5)
        self.json_import_text = scrolledtext.ScrolledText(self.json_import_frame, height=10)
        self.json_import_text.pack(fill='both', expand=True, padx=10, pady=5)
        
        # Selection frame for JSON paths
        select_frame = ttk.LabelFrame(self.json_import_frame, text="Select Data Path")
        select_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Label(select_frame, text="JSON Data Path:").grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.json_path = tk.StringVar(value="")
        ttk.Entry(select_frame, textvariable=self.json_path).grid(row=0, column=1, padx=10, pady=5, sticky="ew")
        ttk.Button(select_frame, text="Auto-Detect", command=self.auto_detect_json_path).grid(row=0, column=2, padx=10, pady=5)
        
        ttk.Label(select_frame, text="Examples: blank for root level, 'data' for data array, 'results.items'").grid(
            row=1, column=0, columnspan=3, padx=10, pady=5, sticky="w")
    
    def connect_database(self):
        try:
            host = self.postgres_host.get()
            port = self.postgres_port.get()
            user = self.postgres_user.get()
            password = self.postgres_password.get()
            database = self.postgres_database.get()
            
            if not all([host, port, user, database]):
                messagebox.showerror("Error", "Please fill in all required PostgreSQL connection fields")
                return
            
            self.connection = psycopg2.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                database=database
            )
            
            # Save configuration
            self.config["PostgreSQL"]["host"] = host
            self.config["PostgreSQL"]["port"] = port
            self.config["PostgreSQL"]["user"] = user
            self.config["PostgreSQL"]["password"] = password
            self.config["PostgreSQL"]["database"] = database
            
            with open(self.config_file, 'w') as f:
                self.config.write(f)
            
            # Enable query tab
            self.notebook.tab(1, state="normal")
            self.notebook.select(1)
            
            # Update status
            self.connection_status.config(text="Status: Connected", foreground="green")
            
            # Load tables
            self.load_tables()
            
            messagebox.showinfo("Success", "Connected to PostgreSQL database successfully!")
            
        except Exception as e:
            self.connection_status.config(text=f"Status: Error - {str(e)}", foreground="red")
            messagebox.showerror("Connection Error", str(e))
    
    def load_tables(self):
        cursor = self.connection.cursor()
        
        # PostgreSQL specific query to get all tables
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """)
        
        tables = [table[0] for table in cursor.fetchall()]
        cursor.close()
        
        self.tables_combobox['values'] = tables
        if tables:
            self.tables_combobox.current(0)
            self.load_table_columns(None)
    
    def load_table_columns(self, event):
        selected_table = self.tables_combobox.get()
        if selected_table:
            self.query_text.delete(1.0, tk.END)
            self.query_text.insert(tk.END, f"SELECT * FROM {selected_table}")
    
    def execute_query(self):
        try:
            query = self.query_text.get(1.0, tk.END).strip()
            if not query:
                messagebox.showerror("Error", "Please enter an SQL query")
                return
            
            # Execute query and get results
            df = pd.read_sql_query(query, self.connection)
            
            if df.empty:
                messagebox.showinfo("Query Result", "Query executed successfully but returned no data")
                return
            
            # Update table view
            self.update_table_view(df)
            
            # Convert to JSON and update JSON view
            self.update_json_view(df)
            
            # Enable table and JSON tabs
            self.notebook.tab(2, state="normal")
            self.notebook.tab(3, state="normal")
            self.notebook.select(2)  # Switch to table view
            
        except Exception as e:
            messagebox.showerror("Query Error", str(e))
    
    def update_table_view(self, df):
        # Clear any existing table
        for widget in self.pt_frame.winfo_children():
            widget.destroy()
        
        # Create the pandastable
        self.table = Table(self.pt_frame, dataframe=df, showtoolbar=True, showstatusbar=True)
        self.table.show()
        
        # Store the dataframe
        self.current_df = df
    
    def update_json_view(self, df):
        # Convert DataFrame to JSON
        json_data = df.to_json(orient='records', indent=4)
        
        # Store the JSON data for later use
        self.json_data = json_data
        
        # Display pretty JSON
        self.json_text.delete(1.0, tk.END)
        self.json_text.insert(tk.END, json_data)
    
    def save_json(self):
        if not hasattr(self, 'json_data'):
            messagebox.showerror("Error", "No JSON data to save")
            return
        
        filename = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        
        if filename:
            try:
                with open(filename, 'w') as f:
                    f.write(self.json_data)
                messagebox.showinfo("Success", f"JSON data saved to {filename}")
            except Exception as e:
                messagebox.showerror("Save Error", str(e))
    
    def export_to_csv(self):
        if not hasattr(self, 'current_df'):
            messagebox.showerror("Error", "No data to export")
            return
            
        filename = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
        )
        
        if filename:
            try:
                self.current_df.to_csv(filename, index=False)
                messagebox.showinfo("Success", f"Data exported to {filename}")
            except Exception as e:
                messagebox.showerror("Export Error", str(e))
    
    def load_json_file(self):
        filename = filedialog.askopenfilename(
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        
        if filename:
            try:
                with open(filename, 'r') as f:
                    json_data = f.read()
                
                self.json_import_text.delete(1.0, tk.END)
                self.json_import_text.insert(tk.END, json_data)
                
                # Auto-detect JSON structure
                self.auto_detect_json_path()
                
            except Exception as e:
                messagebox.showerror("Load Error", str(e))
    
    def paste_json(self):
        try:
            # Get clipboard content
            clipboard_content = self.root.clipboard_get()
            
            # Validate JSON
            try:
                json.loads(clipboard_content)
                self.json_import_text.delete(1.0, tk.END)
                self.json_import_text.insert(tk.END, clipboard_content)
                
                # Auto-detect JSON structure
                self.auto_detect_json_path()
                
            except json.JSONDecodeError:
                messagebox.showerror("Error", "Clipboard content is not valid JSON")
                
        except tk.TclError:
            messagebox.showerror("Error", "Clipboard is empty or contains non-text data")
    
    def auto_detect_json_path(self):
        try:
            json_text = self.json_import_text.get(1.0, tk.END).strip()
            if not json_text:
                return
                
            data = json.loads(json_text)
            
            # Check if root is a list of objects
            if isinstance(data, list) and data and isinstance(data[0], dict):
                self.json_path.set("")
                return
                
            # Check for common data fields
            for field in ["data", "results", "items", "records"]:
                if field in data and isinstance(data[field], list) and data[field] and isinstance(data[field][0], dict):
                    self.json_path.set(field)
                    return
                    
            # Check for nested structures
            for key, value in data.items():
                if isinstance(value, dict):
                    for subkey, subvalue in value.items():
                        if isinstance(subvalue, list) and subvalue and isinstance(subvalue[0], dict):
                            self.json_path.set(f"{key}.{subkey}")
                            return
            
            # Default fallback
            self.json_path.set("")
            
        except Exception as e:
            self.json_path.set("")
    
    def convert_json_to_table(self):
        try:
            json_text = self.json_import_text.get(1.0, tk.END).strip()
            if not json_text:
                messagebox.showerror("Error", "No JSON data to convert")
                return
                
            data = json.loads(json_text)
            json_path = self.json_path.get().strip()
            
            # Extract data based on path
            if json_path:
                path_parts = json_path.split('.')
                for part in path_parts:
                    if part in data:
                        data = data[part]
                    else:
                        raise KeyError(f"Path part '{part}' not found in JSON")
            
            # Convert to dataframe
            if isinstance(data, list):
                df = pd.json_normalize(data)
            else:
                # Handle single object
                df = pd.json_normalize([data])
            
            if df.empty:
                messagebox.showinfo("Result", "JSON parsed successfully but contains no data")
                return
            
            # Update table view
            self.update_table_view(df)
            
            # Enable and switch to table tab
            self.notebook.tab(2, state="normal")
            self.notebook.select(2)
            
        except json.JSONDecodeError:
            messagebox.showerror("Error", "Invalid JSON format")
        except KeyError as e:
            messagebox.showerror("Error", str(e))
        except Exception as e:
            messagebox.showerror("Conversion Error", str(e))

if __name__ == "__main__":
    root = tk.Tk()
    app = PostgresToJSONApp(root)
    root.mainloop()