from django.urls import path
from .views import home, get_tables, get_columns, generate_data, export_excel,get_unique_values,import_excel

urlpatterns = [
    path('', home, name='home'),
    path('get_tables/', get_tables, name='get_tables'),
    path('get_columns/', get_columns, name='get_columns'),
    path('api/unique-values/<str:table_name>/<str:column_name>/', 
         get_unique_values, 
         name='get_unique_values'),
    path('generate_data/', generate_data, name='generate_data'),
    path('export_excel/', export_excel, name='export_excel'),
    path('import_excel/', import_excel, name='import_excel'),  # New URL for Excel import


]
