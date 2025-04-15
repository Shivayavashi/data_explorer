import sys
import os
import json
import logging
from datetime import datetime
import pandas as pd
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                            QLabel, QLineEdit, QPushButton, QTextEdit, QComboBox, 
                            QFileDialog, QProgressBar, QTabWidget, QTableWidget, QTableWidgetItem,
                            QCheckBox, QGroupBox, QFormLayout, QMessageBox, QSpinBox)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
import pyodbc
import psycopg2
from psycopg2 import sql
import sqlalchemy

# Set up logging 
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler('migration.log'), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

class MigrationWorker(QThread):
    update_progress = pyqtSignal(int, str)
    finished_signal = pyqtSignal(bool, str)
    table_data_signal = pyqtSignal(str, list)
    
    def __init__(self, source_config, target_config, selected_tables, batch_size=1000):
        super().__init__()
        self.source_config = source_config
        self.target_config = target_config
        self.selected_tables = selected_tables
        self.batch_size = batch_size
        self.cancel_flag = False
        
    def run(self):
        try:
            # Connect to source database (SQL Server)
            source_conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={self.source_config['server']};DATABASE={self.source_config['database']};UID={self.source_config['username']};PWD={self.source_config['password']}"
            source_conn = pyodbc.connect(source_conn_str)
            source_cursor = source_conn.cursor()
            
            # Connect to target database (PostgreSQL)
            target_conn = psycopg2.connect(
                host=self.target_config['server'],
                database=self.target_config['database'],
                user=self.target_config['username'],
                password=self.target_config['password'],
                port=self.target_config['port']
            )
            target_cursor = target_conn.cursor()
            
            # Create SQLAlchemy engines for pandas
            source_engine = sqlalchemy.create_engine(
                f"mssql+pyodbc:///?odbc_connect={source_conn_str}"
            )
            target_engine = sqlalchemy.create_engine(
                f"postgresql://{self.target_config['username']}:{self.target_config['password']}@{self.target_config['server']}:{self.target_config['port']}/{self.target_config['database']}"
            )
            
            total_tables = len(self.selected_tables)
            for i, table_name in enumerate(self.selected_tables):
                if self.cancel_flag:
                    self.finished_signal.emit(False, "Migration cancelled by user")
                    return
                
                self.update_progress(int((i / total_tables) * 100), f"Processing table: {table_name}")
                
                try:
                    # Get table schema
                    source_cursor.execute(f"SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table_name}'")
                    columns = source_cursor.fetchall()
                    
                    # Create table in PostgreSQL
                    create_table_sql = self.generate_create_table_sql(table_name, columns)
                    target_cursor.execute(create_table_sql)
                    
                    # Get total row count
                    source_cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                    total_rows = source_cursor.fetchone()[0]
                    
                    # Fetch sample data for preview
                    sample_df = pd.read_sql(f"SELECT TOP 10 * FROM {table_name}", source_engine)
                    self.table_data_signal.emit(table_name, sample_df.values.tolist())
                    
                    # Process data in batches
                    for offset in range(0, total_rows, self.batch_size):
                        if self.cancel_flag:
                            self.finished_signal.emit(False, "Migration cancelled by user")
                            return
                        
                        batch_percent = min(100, int(offset / total_rows * 100))
                        self.update_progress(int((i / total_tables) * 100 + (batch_percent / total_tables)), 
                                            f"Migrating {table_name}: {offset}/{total_rows} rows")
                        
                        query = f"SELECT * FROM {table_name} ORDER BY (SELECT NULL) OFFSET {offset} ROWS FETCH NEXT {self.batch_size} ROWS ONLY"
                        df = pd.read_sql(query, source_engine)
                        
                        if not df.empty:
                            # Clean data (handle NaN, etc.)
                            df = df.where(pd.notnull(df), None)
                            
                            # Write to PostgreSQL
                            df.to_sql(table_name, target_engine, if_exists='append', index=False)
                    
                    target_conn.commit()
                    self.update_progress(int(((i + 1) / total_tables) * 100), f"Finished migrating {table_name}")
                    
                except Exception as e:
                    logger.error(f"Error migrating table {table_name}: {str(e)}")
                    self.finished_signal.emit(False, f"Error migrating table {table_name}: {str(e)}")
                    return
            
            source_conn.close()
            target_conn.close()
            
            self.finished_signal.emit(True, "Migration completed successfully")
            
        except Exception as e:
            logger.error(f"Migration failed: {str(e)}")
            self.finished_signal.emit(False, f"Migration failed: {str(e)}")
    
    def generate_create_table_sql(self, table_name, columns):
        """Generate PostgreSQL CREATE TABLE statement from SQL Server schema"""
        type_mapping = {
            'int': 'integer',
            'bigint': 'bigint',
            'smallint': 'smallint',
            'tinyint': 'smallint',
            'bit': 'boolean',
            'decimal': 'numeric',
            'numeric': 'numeric',
            'float': 'double precision',
            'real': 'real',
            'datetime': 'timestamp',
            'datetime2': 'timestamp',
            'date': 'date',
            'time': 'time',
            'char': 'char',
            'varchar': 'varchar',
            'nvarchar': 'varchar',
            'nchar': 'char',
            'text': 'text',
            'ntext': 'text',
            'binary': 'bytea',
            'varbinary': 'bytea',
            'image': 'bytea',
            'uniqueidentifier': 'uuid',
            'xml': 'xml',
            'money': 'money',
            'smallmoney': 'money',
        }
        
        column_defs = []
        for col_name, col_type in columns:
            pg_type = type_mapping.get(col_type.lower(), 'text')
            column_defs.append(f'"{col_name}" {pg_type}')
        
        create_sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" (\n'
        create_sql += ',\n'.join(column_defs)
        create_sql += '\n);'
        
        return create_sql
    
    def cancel(self):
        self.cancel_flag = True

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SQL Server to PostgreSQL Data Migration Tool")
        self.setGeometry(100, 100, 1000, 700)
        self.setStyleSheet("""
            QMainWindow {
                background-color: #f5f5f5;
            }
            QTabWidget {
                background-color: #ffffff;
            }
            QPushButton {
                background-color: #4CAF50;
                color: white;
                border: none;
                padding: 8px 16px;
                text-align: center;
                font-size: 14px;
                margin: 4px 2px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
            QPushButton:disabled {
                background-color: #cccccc;
                color: #666666;
            }
            QLabel {
                font-size: 14px;
            }
            QLineEdit, QTextEdit, QComboBox {
                padding: 6px;
                border: 1px solid #cccccc;
                border-radius: 4px;
            }
            QGroupBox {
                font-weight: bold;
                border: 1px solid #cccccc;
                border-radius: 6px;
                margin-top: 12px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top left;
                padding: 0 5px;
            }
            QProgressBar {
                border: 1px solid #cccccc;
                border-radius: 5px;
                text-align: center;
                background-color: #f0f0f0;
            }
            QProgressBar::chunk {
                background-color: #4CAF50;
                width: 10px;
                margin: 0.5px;
            }
        """)
        
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        
        self.connection_tab = QWidget()
        self.table_selection_tab = QWidget()
        self.migration_tab = QWidget()
        
        self.tabs.addTab(self.connection_tab, "Database Connections")
        self.tabs.addTab(self.table_selection_tab, "Table Selection")
        self.tabs.addTab(self.migration_tab, "Migration")
        
        self.setup_connection_tab()
        self.setup_table_selection_tab()
        self.setup_migration_tab()
        
        self.source_tables = []
        self.selected_tables = []
        self.table_data_preview = {}
        self.migration_worker = None
        
        # Disable tabs initially
        self.tabs.setTabEnabled(1, False)
        self.tabs.setTabEnabled(2, False)
        
        # Load saved connections if available
        self.load_saved_connections()
    
    def setup_connection_tab(self):
        layout = QVBoxLayout()
        
        # Source connection group
        source_group = QGroupBox("Source SQL Server")
        source_layout = QFormLayout()
        
        self.source_server = QLineEdit()
        self.source_database = QLineEdit()
        self.source_username = QLineEdit()
        self.source_password = QLineEdit()
        self.source_password.setEchoMode(QLineEdit.Password)
        
        source_layout.addRow("Server:", self.source_server)
        source_layout.addRow("Database:", self.source_database)
        source_layout.addRow("Username:", self.source_username)
        source_layout.addRow("Password:", self.source_password)
        
        source_group.setLayout(source_layout)
        
        # Target connection group
        target_group = QGroupBox("Target PostgreSQL")
        target_layout = QFormLayout()
        
        self.target_server = QLineEdit()
        self.target_port = QSpinBox()
        self.target_port.setRange(1, 65535)
        self.target_port.setValue(5432)
        self.target_database = QLineEdit()
        self.target_username = QLineEdit()
        self.target_password = QLineEdit()
        self.target_password.setEchoMode(QLineEdit.Password)
        
        target_layout.addRow("Server:", self.target_server)
        target_layout.addRow("Port:", self.target_port)
        target_layout.addRow("Database:", self.target_database)
        target_layout.addRow("Username:", self.target_username)
        target_layout.addRow("Password:", self.target_password)
        
        target_group.setLayout(target_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        self.save_conn_button = QPushButton("Save Connections")
        self.save_conn_button.clicked.connect(self.save_connections)
        
        self.test_conn_button = QPushButton("Test Connections")
        self.test_conn_button.clicked.connect(self.test_connections)
        
        self.next_button = QPushButton("Next")
        self.next_button.clicked.connect(self.load_tables)
        
        button_layout.addWidget(self.save_conn_button)
        button_layout.addWidget(self.test_conn_button)
        button_layout.addWidget(self.next_button)
        
        layout.addWidget(source_group)
        layout.addWidget(target_group)
        layout.addLayout(button_layout)
        
        self.connection_tab.setLayout(layout)
    
    def setup_table_selection_tab(self):
        layout = QVBoxLayout()
        
        # Table selection area
        self.table_list = QTableWidget()
        self.table_list.setColumnCount(2)
        self.table_list.setHorizontalHeaderLabels(["Table Name", "Select"])
        self.table_list.horizontalHeader().setStretchLastSection(True)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        self.select_all_button = QPushButton("Select All")
        self.select_all_button.clicked.connect(self.select_all_tables)
        
        self.deselect_all_button = QPushButton("Deselect All")
        self.deselect_all_button.clicked.connect(self.deselect_all_tables)
        
        self.back_button1 = QPushButton("Back")
        self.back_button1.clicked.connect(lambda: self.tabs.setCurrentIndex(0))
        
        self.next_button2 = QPushButton("Next")
        self.next_button2.clicked.connect(self.prepare_migration)
        
        button_layout.addWidget(self.select_all_button)
        button_layout.addWidget(self.deselect_all_button)
        button_layout.addWidget(self.back_button1)
        button_layout.addWidget(self.next_button2)
        
        layout.addWidget(QLabel("Select tables to migrate:"))
        layout.addWidget(self.table_list)
        layout.addLayout(button_layout)
        
        self.table_selection_tab.setLayout(layout)
    
    def setup_migration_tab(self):
        layout = QVBoxLayout()
        
        # Migration options
        options_group = QGroupBox("Migration Options")
        options_layout = QFormLayout()
        
        self.batch_size = QSpinBox()
        self.batch_size.setRange(100, 10000)
        self.batch_size.setValue(1000)
        self.batch_size.setSingleStep(100)
        
        options_layout.addRow("Batch Size:", self.batch_size)
        options_group.setLayout(options_layout)
        
        # Preview area
        preview_group = QGroupBox("Data Preview")
        preview_layout = QVBoxLayout()
        
        self.preview_table_selector = QComboBox()
        self.preview_table_selector.currentTextChanged.connect(self.update_preview)
        
        self.preview_table = QTableWidget()
        
        preview_layout.addWidget(QLabel("Select table to preview:"))
        preview_layout.addWidget(self.preview_table_selector)
        preview_layout.addWidget(self.preview_table)
        
        preview_group.setLayout(preview_layout)
        
        # Progress area
        progress_group = QGroupBox("Migration Progress")
        progress_layout = QVBoxLayout()
        
        self.progress_bar = QProgressBar()
        self.progress_label = QLabel("Ready to start migration")
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        
        progress_layout.addWidget(self.progress_bar)
        progress_layout.addWidget(self.progress_label)
        progress_layout.addWidget(QLabel("Log:"))
        progress_layout.addWidget(self.log_text)
        
        progress_group.setLayout(progress_layout)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        self.back_button2 = QPushButton("Back")
        self.back_button2.clicked.connect(lambda: self.tabs.setCurrentIndex(1))
        
        self.start_button = QPushButton("Start Migration")
        self.start_button.clicked.connect(self.start_migration)
        
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.cancel_migration)
        self.cancel_button.setEnabled(False)
        
        button_layout.addWidget(self.back_button2)
        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.cancel_button)
        
        layout.addWidget(options_group)
        layout.addWidget(preview_group)
        layout.addWidget(progress_group)
        layout.addLayout(button_layout)
        
        self.migration_tab.setLayout(layout)
    
    def load_saved_connections(self):
        try:
            if os.path.exists('connections.json'):
                with open('connections.json', 'r') as f:
                    connections = json.load(f)
                    
                    # Load source connection
                    if 'source' in connections:
                        self.source_server.setText(connections['source'].get('server', ''))
                        self.source_database.setText(connections['source'].get('database', ''))
                        self.source_username.setText(connections['source'].get('username', ''))
                        self.source_password.setText(connections['source'].get('password', ''))
                    
                    # Load target connection
                    if 'target' in connections:
                        self.target_server.setText(connections['target'].get('server', ''))
                        self.target_port.setValue(int(connections['target'].get('port', 5432)))
                        self.target_database.setText(connections['target'].get('database', ''))
                        self.target_username.setText(connections['target'].get('username', ''))
                        self.target_password.setText(connections['target'].get('password', ''))
        except Exception as e:
            logger.error(f"Error loading saved connections: {str(e)}")
    
    def save_connections(self):
        try:
            connections = {
                'source': {
                    'server': self.source_server.text(),
                    'database': self.source_database.text(),
                    'username': self.source_username.text(),
                    'password': self.source_password.text()
                },
                'target': {
                    'server': self.target_server.text(),
                    'port': self.target_port.value(),
                    'database': self.target_database.text(),
                    'username': self.target_username.text(),
                    'password': self.target_password.text()
                }
            }
            
            with open('connections.json', 'w') as f:
                json.dump(connections, f)
            
            QMessageBox.information(self, "Success", "Connections saved successfully!")
        except Exception as e:
            logger.error(f"Error saving connections: {str(e)}")
            QMessageBox.critical(self, "Error", f"Failed to save connections: {str(e)}")
    
    def test_connections(self):
        try:
            # Test SQL Server connection
            source_conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={self.source_server.text()};DATABASE={self.source_database.text()};UID={self.source_username.text()};PWD={self.source_password.text()}"
            source_conn = pyodbc.connect(source_conn_str)
            source_conn.close()
            
            # Test PostgreSQL connection
            target_conn = psycopg2.connect(
                host=self.target_server.text(),
                database=self.target_database.text(),
                user=self.target_username.text(),
                password=self.target_password.text(),
                port=self.target_port.value()
            )
            target_conn.close()
            
            QMessageBox.information(self, "Success", "Both connections tested successfully!")
        except Exception as e:
            logger.error(f"Connection test failed: {str(e)}")
            QMessageBox.critical(self, "Error", f"Connection test failed: {str(e)}")
    
    def load_tables(self):
        try:
            # Connect to SQL Server
            source_conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={self.source_server.text()};DATABASE={self.source_database.text()};UID={self.source_username.text()};PWD={self.source_password.text()}"
            source_conn = pyodbc.connect(source_conn_str)
            source_cursor = source_conn.cursor()
            
            # Get table list
            source_cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = ? ORDER BY TABLE_NAME", self.source_database.text())
            self.source_tables = [row[0] for row in source_cursor.fetchall()]
            
            source_conn.close()
            
            # Update table list widget
            self.table_list.setRowCount(len(self.source_tables))
            for i, table_name in enumerate(self.source_tables):
                self.table_list.setItem(i, 0, QTableWidgetItem(table_name))
                checkbox = QCheckBox()
                self.table_list.setCellWidget(i, 1, checkbox)
            
            # Enable next tab
            self.tabs.setTabEnabled(1, True)
            self.tabs.setCurrentIndex(1)
        except Exception as e:
            logger.error(f"Error loading tables: {str(e)}")
            QMessageBox.critical(self, "Error", f"Failed to load tables: {str(e)}")
    
    def select_all_tables(self):
        for i in range(self.table_list.rowCount()):
            checkbox = self.table_list.cellWidget(i, 1)
            if checkbox:
                checkbox.setChecked(True)
    
    def deselect_all_tables(self):
        for i in range(self.table_list.rowCount()):
            checkbox = self.table_list.cellWidget(i, 1)
            if checkbox:
                checkbox.setChecked(False)
    
    def prepare_migration(self):
        self.selected_tables = []
        
        # Get selected tables
        for i in range(self.table_list.rowCount()):
            checkbox = self.table_list.cellWidget(i, 1)
            if checkbox and checkbox.isChecked():
                table_name = self.table_list.item(i, 0).text()
                self.selected_tables.append(table_name)
        
        if not self.selected_tables:
            QMessageBox.warning(self, "Warning", "No tables selected. Please select at least one table.")
            return
        
        # Update preview table selector
        self.preview_table_selector.clear()
        self.preview_table_selector.addItems(self.selected_tables)
        
        # Enable next tab
        self.tabs.setTabEnabled(2, True)
        self.tabs.setCurrentIndex(2)
    
    def update_preview(self, table_name):
        if not table_name:
            return
        
        # Check if we already have the preview data
        if table_name in self.table_data_preview:
            self.display_preview_data(table_name, self.table_data_preview[table_name])
            return
        
        try:
            # Connect to SQL Server
            source_conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={self.source_server.text()};DATABASE={self.source_database.text()};UID={self.source_username.text()};PWD={self.source_password.text()}"
            source_conn = pyodbc.connect(source_conn_str)
            source_cursor = source_conn.cursor()
            
            # Get column names
            source_cursor.execute(f"SELECT TOP 1 * FROM {table_name}")
            columns = [column[0] for column in source_cursor.description]
            
            # Get sample data
            source_cursor.execute(f"SELECT TOP 10 * FROM {table_name}")
            rows = source_cursor.fetchall()
            
            source_conn.close()
            
            # Store preview data
            self.table_data_preview[table_name] = {
                'columns': columns,
                'rows': rows
            }
            
            # Display preview data
            self.display_preview_data(table_name, self.table_data_preview[table_name])
        except Exception as e:
            logger.error(f"Error generating preview for {table_name}: {str(e)}")
            QMessageBox.critical(self, "Error", f"Failed to generate preview: {str(e)}")
    
    def display_preview_data(self, table_name, data):
        columns = data['columns']
        rows = data['rows']
        
        self.preview_table.setColumnCount(len(columns))
        self.preview_table.setHorizontalHeaderLabels(columns)
        
        self.preview_table.setRowCount(len(rows))
        for i, row in enumerate(rows):
            for j, value in enumerate(row):
                item = QTableWidgetItem(str(value) if value is not None else "NULL")
                self.preview_table.setItem(i, j, item)
    
    def start_migration(self):
        if not self.selected_tables:
            QMessageBox.warning(self, "Warning", "No tables selected. Please select at least one table.")
            return
        
        # Confirm migration
        confirm = QMessageBox.question(self, "Confirm Migration", 
                                       f"Are you sure you want to migrate {len(self.selected_tables)} tables?",
                                       QMessageBox.Yes | QMessageBox.No)
        if confirm != QMessageBox.Yes:
            return
        
        # Prepare configurations
        source_config = {
            'server': self.source_server.text(),
            'database': self.source_database.text(),
            'username': self.source_username.text(),
            'password': self.source_password.text()
        }
        
        target_config = {
            'server': self.target_server.text(),
            'port': self.target_port.value(),
            'database': self.target_database.text(),
            'username': self.target_username.text(),
            'password': self.target_password.text()
        }
        
        # Start migration worker
        self.migration_worker = MigrationWorker(source_config, target_config, self.selected_tables, self.batch_size.value())
        self.migration_worker.update_progress.connect(self.update_progress)
        self.migration_worker.finished_signal.connect(self.migration_finished)
        self.migration_worker.table_data_signal.connect(self.receive_table_data)
        
        # Update UI
        self.progress_bar.setValue(0)
        self.progress_label.setText("Migration started...")
        self.log_text.clear()
        self.log_text.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Migration started")
        
        self.start_button.setEnabled(False)
        self.back_button2.setEnabled(False)
        self.cancel_button.setEnabled(True)
        
        # Start migration
        self.migration_worker.start()
    
    def cancel_migration(self):
        if self.migration_worker and self.migration_worker.isRunning():
            confirm = QMessageBox.question(self, "Confirm Cancellation", 
                                          "Are you sure you want to cancel the migration?",
                                          QMessageBox.Yes | QMessageBox.No)
            if confirm == QMessageBox.Yes:
                self.migration_worker.cancel()
                self.log_text.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Cancellation requested...")
    
    def update_progress(self, value, message):
        self.progress_bar.setValue(value)
        self.progress_label.setText(message)
        self.log_text.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")
    
    def migration_finished(self, success, message):
        self.progress_label.setText(message)
        self.log_text.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")
        
        self.start_button.setEnabled(True)
        self.back_button2.setEnabled(True)
        self.cancel_button.setEnabled(False)
        
        if success:
            QMessageBox.information(self, "Success", "Migration completed successfully!")
        else:
            QMessageBox.critical(self, "Error", f"Migration failed: {message}")
    
    def receive_table_data(self, table_name, data):
        if table_name not in self.table_data_preview:
            self.table_data_preview[table_name] = {'rows': data}
        else:
            self.table_data_preview[table_name]['rows'] = data
        
        # Update preview if this is the currently selected table
        if self.preview_table_selector.currentText() == table_name:
            self.display_preview_data(table_name, self.table_data_preview[table_name])

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec_())