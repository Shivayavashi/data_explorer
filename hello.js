let selectedTables = new Set();
let selectedColumns = new Set();
let filters = [];
let aggregations = [];
let groupByColumns = new Set();
let columnTypes = {};
let allColumns = new Set();
let havingConditions = [];
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' or 'desc'

const sidebar = document.querySelector('.sidebar');

function adjustScrollToElement(element, behavior = 'smooth', block = 'nearest') {
    if (!element || !sidebar) return;
    requestAnimationFrame(() => {
        element.scrollIntoView({ behavior, block });
    });
}

function preserveScrollPosition(callback) {
    if (!sidebar) return callback();
    const currentScroll = sidebar.scrollTop;
    callback();
    requestAnimationFrame(() => {
        sidebar.scrollTop = currentScroll;
    });
}

function initializeSelect2() {
    $('#tables-select').select2({
        width: '100%',
        placeholder: 'Search tables...',
        closeOnSelect: false,
        allowClear: true,
        dropdownParent: $('.sidebar'),
        templateResult: formatTableOption,
        templateSelection: formatTableSelection,
        dropdownCssClass: 'tables-dropdown',
        selectionCssClass: 'tables-selection'
    }).on('select2:selecting', function(e) {
        e.preventDefault();
        const table = e.params.args.data.id;
        toggleTableSelection(table);
        $(this).select2('close').select2('open');
    });

    $('#columns-select').select2({
        width: '100%',
        placeholder: 'Search or select columns...',
        closeOnSelect: false,
        allowClear: true,
        dropdownParent: $('.sidebar'),
        templateResult: formatColumnOption,
        templateSelection: formatColumnSelection,
        dropdownCssClass: 'columns-dropdown',
        selectionCssClass: 'columns-selection',
        searchInputPlaceholder: 'Type to search columns...',
        matcher: matchCustom,
        sorter: data => data,
        sortResults: false,
    }).on('select2:selecting', function(e) {
        e.preventDefault();
        const column = e.params.args.data.id;
        toggleColumnSelection(column);
        $(this).select2('close').select2('open');
    });
}

function formatTableOption(option) {
    if (!option.id) return option.text;
    
    const table = option.id;
    
    return $('<div>').addClass('table-option').html(`
        <div class="flex items-center p-2 hover:bg-blue-50 transition-colors rounded ${selectedTables.has(table) ? 'selected' : ''}">
            <div class="flex-grow">
                <div class="font-medium text-gray-800">${table}</div>
            </div>
            <div class="flex items-center">
                <div class="select-status ${selectedTables.has(table) ? 'selected' : ''}">
                    ${selectedTables.has(table) ? '✓' : ''}
                </div>
            </div>
        </div>
    `);
}

function formatColumnOption(option) {
    if (!option.id) return option.text;
    
    const column = option.id;
    const [table, columnName] = column.split('.');
    
    return $('<div>').addClass('column-option').html(`
        <div class="flex items-center p-0 hover:bg-blue-50 transition-colors rounded ${selectedColumns.has(column) ? 'selected' : ''}">
            <div class="flex-grow">
                <div class="font-medium text-gray-800 leading-tight">${columnName}</div>
                <div class="text-sm text-gray-500 leading-tight">${table}</div>
            </div>
            <div class="flex items-center">
                <div class="select-status ${selectedColumns.has(column) ? 'selected' : ''}">
                    ${selectedColumns.has(column) ? '✓' : ''}
                </div>
            </div>
        </div>
    `);
}

function formatTableSelection(option) {
    if (!option.id) return option.text;
    return $('<span>').addClass('selected-table').text(option.id);
}

function updateSelectedColumnsDisplay() {
    const container = $('#selected-columns');
    container.empty();
    
    if (selectedColumns.size === 0) {
        return;
    }
    
    container.append(`<div class="section-label">Selected Columns (${selectedColumns.size})</div>`);

    selectedColumns.forEach(column => {
        const [table, columnName] = column.split('.');
        const isGrouped = groupByColumns.has(column);
        
        const itemDiv = $('<div>')
            .addClass('selected-item')
            .addClass(isGrouped ? 'is-grouped' : '')
            .html(`
                <span class="item-name">${columnName}</span>
                <span class="table-name">(${table})</span>
                ${isGrouped ? '<span class="grouped-badge" title="Used in Group By">Grouped</span>' : ''}
                <span class="remove-item" title="Remove column">×</span>
            `);
        
        itemDiv.find('.remove-item').on('click', () => {
            selectedColumns.delete(column);
            if (groupByColumns.has(column)) {
                groupByColumns.delete(column);
            }
            updateSelectedColumnsDisplay();
            updateGroupByDropdown();
        });
        
        container.append(itemDiv);
    });
    if (aggregations.length > 0) {
        updateGroupByDropdown();
    }
}


function toggleTableSelection(table) {
    if (selectedTables.has(table)) {
        // Store the table being removed for the warning message
        const removedTable = table;
        console.log(`Removing table: ${removedTable}`);
        // Remove the table from selectedTables
        selectedTables.delete(table);
        
        // Remove all columns, selected columns, group by columns, and filters related to this table
        const tablePrefix = `${table}.`;
        const affectedColumns = Array.from(allColumns).filter(col => col.startsWith(tablePrefix));
        console.log(`Affected columns from ${removedTable}:`, affectedColumns);
        // Remove from allColumns
        affectedColumns.forEach(col => allColumns.delete(col));
        
        // Remove from selectedColumns
        affectedColumns.forEach(col => selectedColumns.delete(col));
        
        // Remove from groupByColumns
        affectedColumns.forEach(col => groupByColumns.delete(col));
        
        const initialAggCount = aggregations.length;
        const affectedAggregations = aggregations.filter(agg => affectedColumns.includes(agg.column));
        if (affectedAggregations.length > 0) {
            console.log(`Found ${affectedAggregations.length} aggregations to remove for table ${removedTable}:`, affectedAggregations);
            affectedAggregations.forEach(agg => {
                $(`#${agg.id}`).remove(); // Remove from DOM
            });
            aggregations = aggregations.filter(agg => !affectedColumns.includes(agg.column));
            renumberAggregations(); // Renumber remaining aggregations
            showMessage(`Aggregations using columns from ${removedTable} have been removed.`, 'warning');
            console.log(`Removed ${affectedAggregations.length} aggregations. Remaining:`, aggregations);
        }

        // Remove filters that use columns from this table
        const initialFilterCount = filters.length;
        const affectedFilters = filters.filter(f => affectedColumns.includes(f.column));
        if (affectedFilters.length > 0) {
            console.log(`Found ${affectedFilters.length} filters to remove for table ${removedTable}:`, affectedFilters);
            // Remove each affected filter from the DOM and filters array
            affectedFilters.forEach(filter => {
                $(`#${filter.id}`).remove();  // Remove the filter element from DOM
            });
            
            // Update filters array by filtering out affected filters
            filters = filters.filter(f => !affectedColumns.includes(f.column));
            
            // Renumber remaining filters for display consistency
            renumberFilters();
            
            // Show warning message
            showMessage(`Filters using columns from ${removedTable} have been removed because the table was deleted.`, 'warning');
            console.log(`Removed ${affectedFilters.length} filters due to table ${removedTable} removal. Remaining filters:`, filters);
        }
    } else {
        selectedTables.add(table);
    }
    
    $('#tables-select').trigger('change.select2');
    updateSelectedColumnsDisplay();
    fetchColumnsForTables();
    
    if (aggregations.length === 0) {
        const groupBySection = document.getElementById('group-by-section');
        if (groupBySection) {
            groupBySection.style.display = 'none';
            groupByColumns.clear();
            renderGroupBySelections();
        }
        const havingSection = document.getElementById('having-section');
        if (havingSection) {
            havingSection.remove();
            havingConditions = [];
        }
    } else {
        updateHavingAggregationOptions();
    }
}


function toggleColumnSelection(column) {
    if (!isColumnAvailable(column)) {
        showMessage(`Column ${column} is no longer available`, 'warning');
        return;
    }
    if (selectedColumns.has(column)) {
        selectedColumns.delete(column);
        // If column was in Group By, remove it
        if (groupByColumns.has(column)) {
            groupByColumns.delete(column);
        }
    } else {
        selectedColumns.add(column);
    }
    
    $('#columns-select').trigger('change.select2');
    updateSelectedColumnsDisplay();
     // If aggregations exist, update the Group By dropdown with new column selection
     if (aggregations.length > 0) {
        updateGroupByDropdown();
    }
}



function formatColumnSelection(option) {
    if (!option.id) return option.text;
    const [table, columnName] = option.id.split('.');
    return $('<span>').addClass('selected-column').text(`${columnName} (${table})`);
}

// New helper function to update just the content of the selected tables list
function updateSelectedTablesContent() {
    const tablesList = $('#selected-tables-list');
    
    tablesList.empty();
    
    if (selectedTables.size === 0) {
        tablesList.append('<div class="text-gray-500 italic">No tables selected</div>');
        return;
    }
    
    tablesList.append(`<div class="section-label">Selected Tables (${selectedTables.size})</div>`);
    
    selectedTables.forEach(table => {
        tablesList.append(`<div class="selected-item">${table}</div>`);
    });
}


function isColumnAvailable(column) {
    return allColumns.has(column);
}

// Fetch tables from server
function fetchTables() {
    $.get('/get_tables/', response => {
        const tablesSelect = $('#tables-select');
        tablesSelect.empty();
        
        // Add placeholder option
        tablesSelect.append(new Option('Search tables...', '', true, true));
        
        response.tables.forEach(table => {
            tablesSelect.append(new Option(table, table));
        });
        
        // Initialize Select2
        initializeSelect2();
        updateSelectedTablesDisplay();
    }).fail(error => {
        showMessage('Failed to fetch tables', 'error');
        console.error('Error fetching tables:', error);
    });
}


// Fetch columns for selected tables
function fetchColumnsForTables() {
    if (selectedTables.size === 0) {
        const columnsSelect = $('#columns-select');
        columnsSelect.empty();
        columnsSelect.append(new Option('Search columns...', '', true, true));
        columnsSelect.trigger('change');
        allColumns.clear();
        return;
    }

    const promises = Array.from(selectedTables).map(table => 
        $.get(`/get_columns/?table=${table}`)
            .catch(error => {
                console.error(`Error fetching columns for ${table}:`, error);
                return { columns: [] };
            })
    );

    Promise.all(promises)
        .then(responses => {
            const columnsSelect = $('#columns-select');
            columnsSelect.empty();
            columnsSelect.append(new Option('Search columns...', '', true, true));
            allColumns.clear();
            responses.forEach((response, index) => {
                const tableName = Array.from(selectedTables)[index];
                if (response.columns) {
                    response.columns.forEach(col => {
                        const columnValue = `${tableName}.${col.name}`;
                        const columnLabel = `${col.name} (${tableName})`;
                        columnTypes[columnValue] = col.type;
                        columnsSelect.append(new Option(columnLabel, columnValue));
                        allColumns.add(columnValue);
                    });
                }
            });

            columnsSelect.trigger('change');
            refreshAllFilterDropdowns();
            refreshAllAggregationDropdowns();
        })
        .catch(error => {
            console.error('Error in fetchColumnsForTables:', error);
            showMessage('Failed to fetch columns', 'error');
        });
}