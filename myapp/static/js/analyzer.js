let selectedTables = new Set();
let selectedColumns = new Set();
let filters = [];
let aggregations = [];
let groupByColumns = new Set();
let columnTypes = {};
let allColumns = new Set();
let havingConditions = [];
// Add near other global variables at the top
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' or 'desc'

const sidebar = document.querySelector('.sidebar'); // Define globally if not already

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
        
        // Save dropdown scroll position
        const dropdown = $(this).data('select2').$dropdown;
        const scrollContainer = dropdown.find('.select2-results__options');
        const scrollTop = scrollContainer.scrollTop();
        
        // Toggle the table selection
        toggleTableSelection(table);
        
        // Reopen the dropdown and restore scroll position
        setTimeout(() => {
            $(this).select2('close');
            $(this).select2('open');
            
            // Need to wait for dropdown to fully open
            setTimeout(() => {
                const newScrollContainer = $(this).data('select2').$dropdown.find('.select2-results__options');
                newScrollContainer.scrollTop(scrollTop);
            }, 10);
        }, 0);
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
        
        // Save dropdown scroll position
        const dropdown = $(this).data('select2').$dropdown;
        const scrollContainer = dropdown.find('.select2-results__options');
        const scrollTop = scrollContainer.scrollTop();
        
        // Toggle the column selection
        toggleColumnSelection(column);
        
        // Reopen the dropdown and restore scroll position
        setTimeout(() => {
            $(this).select2('close');
            $(this).select2('open');
            
            // Need to wait for dropdown to fully open
            setTimeout(() => {
                const newScrollContainer = $(this).data('select2').$dropdown.find('.select2-results__options');
                newScrollContainer.scrollTop(scrollTop);
            }, 10);
        }, 0);
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
            refreshAllAggregationDropdowns();
            updateGroupByDropdown();
        });
        
        container.append(itemDiv);
    });
    if (aggregations.length > 0) {
        updateGroupByDropdown();
    }
}

function toggleTableSelection(table) {
    // Store the scroll position before modifications
    preserveScrollPosition(() => {
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
        refreshAllAggregationDropdowns();
        
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
    });
}

function toggleColumnSelection(column) {
    // Store the scroll position before modifications
    preserveScrollPosition(() => {
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
            sortColumn = null;
            sortDirection = 'asc';
        }
        
        $('#columns-select').trigger('change.select2');
        updateSelectedColumnsDisplay();
        refreshAllAggregationDropdowns();
        // If aggregations exist, update the Group By dropdown with new column selection
        if (aggregations.length > 0) {
            updateGroupByDropdown();
        }
    });
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

function refreshAllFilterDropdowns() {
    filters.forEach(filter => {
        const selectElement = $(`#column-select-${filter.id}`);
        if (selectElement.length) {
            // Store the current selected value
            const currentValue = filter.column;
            selectElement.empty().append('<option value="">Select a column</option>');
            Array.from(allColumns).forEach(col => {
                selectElement.append(new Option(col, col));
            });
    
            // Restore the current value if it still exists in allColumns
            if (currentValue && allColumns.has(currentValue)) {
                selectElement.val(currentValue);
            }
    
        }
    });
}

function refreshAllAggregationDropdowns() {
    aggregations.forEach(agg => {
        const columnSelect = $(`#column-select-${agg.id}`); // The column dropdown in aggregation
        if (columnSelect.length) {
            const currentValue = agg.column; // Preserve current selection if still valid
            columnSelect.empty();
            
            columnSelect.append(new Option('Select Column', '', true, true));
            Array.from(selectedColumns).forEach(col => {
                columnSelect.append(new Option(col, col));
            });
            if (currentValue && selectedColumns.has(currentValue)) {
                columnSelect.val(currentValue);
            }else {
                // Reset the aggregation column if it's no longer selected
                agg.column = '';
            }
            columnSelect.trigger('change');
        }
    });
}


function addFilter() {
    const timestamp = new Date().getTime();
    const filterId = `filter-${timestamp}`;
    sortColumn = null;
    sortDirection = 'asc';
    // Get the next sequential number for display purposes
    const filterNumber = filters.length + 1;
    filters.push({
        id: filterId,
        number: filterNumber,
        column: '',
        operator: '',
        value1: '',
        value2: '',
        values: [],
        isValid: false  // Flag to track if filter is completely filled
    });
    console.log("Adding filter with ID:", filterId, "Number:", filterNumber, "Filters array:", filters);
    
    const filterHtml = `
        <div id="${filterId}" class="filter-item mb-3">
            <div class="filter-header flex justify-between items-center p-2 bg-gray-200 rounded">
                <button onclick="toggleFilter('${filterId}')" class="toggle-filter">&#9650;</button>
                <span id="filter-title-${filterId}" class="ml-2">Filter ${filters.length}</span>
                <button onclick="removeFilter('${filterId}')" class="remove-filter">❌</button>
            </div>
            <div id="filter-body-${filterId}" class="filter-body p-2 bg-white rounded shadow">
                <div class="filter-controls">
                    <div class="column-select-container mb-2">
                        <select id="column-select-${filterId}" class="filter-select w-full" 
                                onchange="updateFilterColumn('${filterId}', this.value)">
                            <option value="">Select column</option>
                            ${Array.from(allColumns).map(col => 
                                `<option value="${col}">${col}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div id="operator-container-${filterId}"></div>
                    <div id="value-container-${filterId}"></div>
                </div>
                <div class="filter-actions flex justify-end mt-2">
                    <button onclick="applyFilter('${filterId}')" class="apply-btn bg-blue-500 text-white px-4 py-1 rounded">Apply</button>
                </div>
            </div>
        </div>
    `;
    
    $('#filters-list').append(filterHtml);

    // Initialize Select2 for searchable dropdown
    $(`#column-select-${filterId}`).select2({
        width: '100%',
        placeholder: 'Search and select column',
        allowClear: true,
        matcher: matchCustom  // Using the existing matchCustom function from your code
    });
}


// New function to search columns in the dropdown
function searchColumns(filterId) {
    const searchInput = document.getElementById(`column-search-${filterId}`);
    const select = document.getElementById(`column-select-${filterId}`);
    const searchText = searchInput.value.toLowerCase();
    
    // Loop through all options (skip the first one which is the placeholder)
    for (let i = 1; i < select.options.length; i++) {
        const option = select.options[i];
        const text = option.text.toLowerCase();
        
        // Show/hide options based on search text
        if (text.includes(searchText)) {
            option.style.display = '';
        } else {
            option.style.display = 'none';
        }
    }
}

function toggleFilter(filterId) {
    const filterBody = document.getElementById(`filter-body-${filterId}`);
    const toggleButton = document.querySelector(`#${filterId} .toggle-filter`);
    console.log("Toggling filter with ID:", filterId);
    if (!filterBody || !toggleButton) return;

    if (filterBody.style.display === "none") {
        filterBody.style.display = "block";
        toggleButton.innerHTML = "&#9650;";
    } else {
        filterBody.style.display = "none";
        toggleButton.innerHTML = "&#9660;";
    }
    preserveScrollPosition(() => {});
}

async function updateFilterColumn(filterId, column) {
    const filter = filters.find(f => f.id === filterId);
    console.log("updateFiltercolumn",filterId,column);
    sortColumn = null;
    sortDirection = 'asc';
    if (filter) {
        filter.column = column;
        filter.isValid = false; 
        // Reset the filter header styling
        const headerElement = document.querySelector(`#${filterId} .filter-header`);
        if (headerElement) {
            headerElement.classList.remove('bg-green-200');
            headerElement.classList.remove('bg-yellow-200');
            headerElement.classList.add('bg-gray-200');
        }
        if (column) {
            updateOperators(filterId, columnTypes[column]);
            const columnType = columnTypes[column];
            if (columnType === 'text' || columnType === 'varchar') {
                await fetchUniqueValues(filterId, column);
            }
        } else {
            // Clear operators and values if column is cleared
            $(`#operator-container-${filterId}`).empty();
            $(`#value-container-${filterId}`).empty();
        }
        refreshFilterColumnDropdown(filterId);
    }
}

// New function to refresh the column dropdown for a specific filter

async function fetchUniqueValues(filterId, columnValue) {
    try {
        const filter = filters.find(f => f.id === filterId);
        const [tableName, columnName] = columnValue.split('.');
        const response = await fetch(`/api/unique-values/${tableName}/${columnName}/`);
        const uniqueValues = await response.json();
        if(filter)
        {
        filter.uniqueValues = uniqueValues;
        }
    } catch (error) {
        console.error('Error fetching unique values:', error);
        filter.uniqueValues = [];
    }
}

function removeFilter(filterId) {
    try {
        // Destroy Select2 instance for the specific filter’s column dropdown
        const selectElement = $(`#column-select-${filterId}`);
        if (selectElement.length) {
            selectElement.select2('destroy');
        }
    } catch (e) {
        console.log("Select2 destroy error for filter", filterId, ":", e);
    }
    
    // Remove the filter from the filters array
    console.log("Removing filter with ID:", filterId, "Before removal, Filters array:", filters);
    filters = filters.filter(f => f.id !== filterId);
    
    // Remove the filter element from the DOM
    const filterElement = document.getElementById(filterId);
    if (filterElement) {
        filterElement.remove();
    }

    // Renumber remaining filters for display consistency
    renumberFilters();
}

// New function to renumber filters
function renumberFilters() {
    filters.forEach((filter, index) => {
        filter.number = index + 1;
        
        // Update the displayed title in the DOM if it hasn’t been customized
        const titleElement = document.getElementById(`filter-title-${filter.id}`);
        if (titleElement && titleElement.textContent.startsWith('Filter ')) {
            titleElement.textContent = `Filter ${filter.number}`;
        }
    });
    console.log("After removal, Filters array:", filters);
}

function updateOperators(filterId, columnType) {
    let operators;

    switch(columnType) {
        case 'number':
        case 'integer':
        case 'decimal':
        case 'float':
            operators = [
                { value: 'eq', label: 'Equal to' },
                { value: 'neq', label: 'Not equal to' },
                { value: 'gt', label: 'Greater than' },
                { value: 'gte', label: 'Greater than or equal to' },
                { value: 'lt', label: 'Less than' },
                { value: 'lte', label: 'Less than or equal to' },
                { value: 'between', label: 'Between' },
                { value: 'in', label: 'In List' },
                { value: 'notin', label: 'Not In List' }
            ];
            break;

        case 'date':
        case 'datetime':
            operators = [
                { value: 'eq', label: 'On' },
                { value: 'neq', label: 'Not on' },
                { value: 'gt', label: 'After' },
                { value: 'gte', label: 'On or after' },
                { value: 'lt', label: 'Before' },
                { value: 'lte', label: 'On or before' },
                { value: 'between', label: 'Between' }
            ];
            break;

        default: // text, varchar, etc.
            operators = [
                { value: 'eq', label: 'Equal to' },
                { value: 'neq', label: 'Not equal to' },
                { value: 'startswith', label: 'Starts with' },
                { value: 'endswith', label: 'Ends with' },
                { value: 'contains', label: 'Contains' },
                { value: 'notcontains', label: 'Does not contain' },
                { value: 'in', label: 'In List' },
                { value: 'notin', label: 'Not In List' }
            ];
    }

    const operatorHtml = `
        <select onchange="updateFilterOperator('${filterId}', this.value)" class="filter-select">
            <option value="">Select Operator</option>
            ${operators.map(op => 
                `<option value="${op.value}">${op.label}</option>`
            ).join('')}
        </select>
    `;

    $(`#operator-container-${filterId}`).html(operatorHtml);
    $(`#value-container-${filterId}`).empty();
}


function updateFilterOperator(filterId, operator) {
    const filter = filters.find(f => f.id === filterId);
    if (filter) {
        filter.operator = operator;
        filter.isValid = false; 
         // Reset filter header to default
         const headerElement = document.querySelector(`#${filterId} .filter-header`);
         if (headerElement) {
             headerElement.classList.remove('bg-green-200');
             headerElement.classList.remove('bg-yellow-200');
             headerElement.classList.add('bg-gray-200');
         }
        if (operator === 'in' || operator === 'notin') {
            filter.values = []; // Initialize as an array for multiple selections
        } 
        else {
            filter.value1 = ''; // Default to a string for single-value filters
            filter.value2 = ''; // Reset second value when not needed
        }
        
        const columnType = columnTypes[filter.column];
        updateValueInput(filterId, columnType, operator);
    }
}






function updateValueInput(filterId, columnType, operator) {
    let valueHtml = '';
    const filter = filters.find(f => f.id === filterId);

    if (!filter) return;

    // Common select2 configuration
    const select2Config = {
        width: '100%',
        allowClear: true,
        matcher: matchCustom,
        dropdownCssClass: 'columns-dropdown',
        selectionCssClass: 'columns-selection',
        templateResult: formatDropdownOption,
        templateSelection: formatDropdownSelection
    };
    
    if (operator === 'in' || operator === 'notin') {
        // Check if there are too many unique values
        if ((filter.uniqueValues && filter.uniqueValues.length > 300) || (columnType === 'number' || columnType === 'integer' || columnType === 'decimal' || columnType === 'float')) {
            // Text input for large datasets without separate apply button
            valueHtml = `
                <div class="large-value-input">
                    <textarea id="value-textarea-${filterId}" class="filter-input w-full" 
                        placeholder="Enter values separated by commas..."
                        onchange="handleTextareaChange('${filterId}')"></textarea>
                </div>
            `;
            // valueHtml = `<input type="number" class="filter-input w-full" 
            //                 onchange="updateFilterValue('${filterId}', 'value1', this.value)">`;
            
            // Initialize after adding to DOM
            setTimeout(() => {
                // Set initial values if they exist
                if (filter.values?.length > 0) {
                    $(`#value-textarea-${filterId}`).val(filter.values.join(', '));
                }
            }, 0);
        } else {
            // Original multiple selection dropdown for smaller datasets
            valueHtml = `
                <select id="value-select-${filterId}" class="filter-select" multiple>
                    <option value="">Select values...</option>
                    ${filter.uniqueValues?.map(value => `
                        <option value="${value}">${value}</option>
                    `).join('')}
                </select>
            `;
    
            // Initialize after adding to DOM
            setTimeout(() => {
                $(`#value-select-${filterId}`).select2({
                    ...select2Config,
                    closeOnSelect: false,
                    multiple: true,
                    placeholder: 'Select multiple values...',
                }).on('select2:select select2:unselect', function(e) {
                    updateFilterValue(filterId, 'values', $(this).val() || []);
                });
    
                // Set initial values if they exist
                if (filter.values?.length > 0) {
                    $(`#value-select-${filterId}`).val(filter.values).trigger('change');
                }
            }, 0);
        }
    }
    // Rest of your existing code for other operators...
    else if (operator === 'between') {
        // Special case for between operator
        if (columnType === 'date' || columnType === 'datetime') {
            valueHtml = `
                <div class="flex flex-col gap-2">
                    <input type="date" class="filter-input" 
                        onchange="updateFilterValue('${filterId}', 'value1', this.value)">
                    <div class="text-center">
                        <span>and</span>
                    </div>
                    <input type="date" class="filter-input" 
                        onchange="updateFilterValue('${filterId}', 'value2', this.value)">
                </div>
            `;
        } else {
            valueHtml = `
                <div class="flex items-center gap-2">
                    <input type="number" class="filter-input flex-1" placeholder="From" 
                           onchange="updateFilterValue('${filterId}', 'value1', this.value)">
                    <span class="mx-2">and</span>
                    <input type="number" class="filter-input flex-1" placeholder="To" 
                           onchange="updateFilterValue('${filterId}', 'value2', this.value)">
                </div>
            `;
        }
    } else {
        // Single selection dropdown for text fields with unique values
        if (columnType === 'text' && (operator=== 'eq' || operator === 'neq') && filter.uniqueValues?.length <= 200) {
            valueHtml = `
                <select id="value-select-${filterId}" class="filter-select">
                    <option value="">Select a value...</option>
                    ${filter.uniqueValues?.map(value => `
                        <option value="${value}">${value}</option>
                    `).join('')}
                </select>
            `;

            // Initialize after adding to DOM
            setTimeout(() => {
                $(`#value-select-${filterId}`).select2({
                    ...select2Config,
                    closeOnSelect: true,
                    placeholder: 'Select a value...',
                }).on('select2:select', function(e) {
                    updateFilterValue(filterId, 'value1', e.params.data.id);
                });

                // Set initial value if it exists
                if (filter.value1) {
                    $(`#value-select-${filterId}`).val(filter.value1).trigger('change');
                }
            }, 0);
        } else {
            // Standard input for other types
            if (columnType === 'date' || columnType === 'datetime') {
                valueHtml = `<input type="date" class="filter-input w-full" 
                            onchange="updateFilterValue('${filterId}', 'value1', this.value)">`;
            } else if (columnType === 'number' || columnType === 'integer' || columnType === 'decimal' || columnType === 'float') {
                valueHtml = `<input type="number" class="filter-input w-full" 
                            onchange="updateFilterValue('${filterId}', 'value1', this.value)">`;
            } else {
                valueHtml = `<input type="text" class="filter-input w-full" 
                            onchange="updateFilterValue('${filterId}', 'value1', this.value)">`;
            }
        }
    }
    
    $(`#value-container-${filterId}`).html(valueHtml);
}

// Add this new function to process textarea input when your main Apply button is clicked
function handleTextareaChange(filterId) {
    const textareaElement = document.getElementById(`value-textarea-${filterId}`);
    if (textareaElement) {
        const textValues = textareaElement.value;
        const valueArray = textValues.split(',')
            .map(item => item.trim())
            .filter(item => item !== '');
        
        updateFilterValue(filterId, 'values', valueArray);
    }
}

// Modify your applyFilter function to handle textarea values
function applyFilter(filterId) {
    const filter = filters.find(f => f.id === filterId);
    sortColumn = null;
    sortDirection = 'asc';
    console.log("Applying filter with ID:", filterId, "Filter object:", filters.find(f => f.id === filterId));
    if (!filter) return;
    // Process textarea values before continuing with filter application
    if ((filter.operator === 'in' || filter.operator === 'notin') && 
        document.getElementById(`value-textarea-${filterId}`)) {
        handleTextareaChange(filterId);
    }
    
    
    console.log(filter.values);
    if (!filter.column || !filter.operator) {
        showMessage('Please fill in all filter fields', 'warning');
        return;
    }
    
    // between selected without one value 
    if (filter.operator === 'between' && (!filter.value1 || !filter.value2)) {
        showMessage('Please enter both values for between operator', 'error');
        return;
    }
    
    // Additional validation for in/notin operators
    if ((filter.operator === 'in' || filter.operator === 'notin') && 
        (!filter.values || filter.values.length === 0)) {
        showMessage('Please select or enter at least one value', 'warning');
        return;
    }
    if (!['between', 'in', 'notin'].includes(filter.operator) && !filter.value1) {
        showMessage('Please enter a value for this filter', 'warning');
        filter.isValid = false;
        return;
    }
    filter.isValid = true;
    // Update header style to indicate applied filter
    const headerElement = document.querySelector(`#${filterId} .filter-header`);
    if (headerElement) {
        headerElement.classList.remove('bg-yellow-200');
        headerElement.classList.remove('bg-gray-200');
        headerElement.classList.add('bg-green-200');
    }
    document.getElementById(`filter-title-${filterId}`).textContent = `Filter: ${filter.column}`;
    toggleFilter(filterId);
    showMessage('Filter applied successfully', 'success');
}


function formatDropdownOption(option) {
    if (!option.id) return option.text;
    
    return $('<div>').addClass('column-option').html(`
        <div class="flex items-center p-2 hover:bg-blue-50 transition-colors rounded">
            <div class="flex-grow">
                <div class="font-medium text-gray-800">${option.text}</div>
            </div>
            ${option.selected ? '<div class="text-blue-500">✓</div>' : ''}
        </div>
    `);
}

function formatDropdownSelection(option) {
    if (!option.id) return option.text;
    return $('<span>').addClass('selected-value').text(option.text);
}

// Update the styles
const dropdownStyles = `
    .select2-container--default .select2-selection--single,
    .select2-container--default .select2-selection--multiple {
        border-color: #e2e8f0;
        border-radius: 0.375rem;
        min-height: 38px;
    }

    .select2-container--default .select2-selection--multiple .select2-selection__choice {
        background-color: #edf2f7;
        border: 1px solid #e2e8f0;
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        margin: 0.25rem;
    }

    .columns-dropdown .column-option {
        padding: 0.5rem;
    }

    .columns-dropdown .column-option:hover {
        background-color: #f7fafc;
    }

    .selected-value {
        font-size: 0.875rem;
        color: #2d3748;
    }
`;

// Add styles to document
$('<style>').text(dropdownStyles).appendTo('head');

function filterDropdownOptions(filterId, searchValue) {
    let selectElement = document.getElementById(`select-${filterId}`);
    let options = selectElement.options;
    
    for (let i = 1; i < options.length; i++) { // Skip first option (default "Select a value")
        let text = options[i].text.toLowerCase();
        options[i].style.display = text.includes(searchValue.toLowerCase()) ? "" : "none";
    }
}

function filterSingleSelectOptions(filterId, searchText) {
    const select = document.getElementById(`select-${filterId}`);
    const filter = searchText.toLowerCase();
    
    // Get all options except the first one (placeholder)
    const options = Array.from(select.options).slice(1);
    
    options.forEach(option => {
        const txtValue = option.text.toLowerCase();
        if (txtValue.indexOf(filter) > -1) {
            option.style.display = "";
        } else {
            option.style.display = "none";
        }
    });
}


function generateFilterOptions(filter) {
    if (!filter.uniqueValues || filter.uniqueValues.length === 0) {
        return '<div class="no-results">No options available</div>';
    }
    
    return filter.uniqueValues.map(value => `
        <div class="filter-option" data-value="${value}" onclick="toggleFilterValue('${filter.id}', '${value}')">
            <input type="checkbox" ${filter.values?.includes(value) ? 'checked' : ''}>
            <span>${value}</span>
        </div>
    `).join('');
}


function toggleFilterValue(filterId, value) {
    const filter = filters.find(f => f.id === filterId);
    if (!filter.values) {
        filter.values = [];
    }
    
    const index = filter.values.indexOf(value);
    if (index === -1) {
        filter.values.push(value);
    } else {
        filter.values.splice(index, 1);
    }
    
    // Update checkbox state
    const checkbox = $(`#value-container-${filterId} .filter-option[data-value="${value}"] input[type="checkbox"]`);
    checkbox.prop('checked', index === -1);
    
    // Update selected count
    updateSelectedCount(filterId);
}
function updateSelectedCount(filterId) {
    const filter = filters.find(f => f.id === filterId);
    const count = filter.values?.length || 0;
    $(`#selected-count-${filterId}`).text(count);
}


// Update filter value
function updateFilterValue(filterId, field, value) {
    const filter = filters.find(f => f.id === filterId);
    if (filter) {
        console.log(`Updating filter ${filterId}:`, {field, value, operator: filter.operator});
        if (field === 'values' && Array.isArray(value)) {
            filter[field] = value; // Store selected values for "in"/"notin"
            console.log(filter[field]);
        } else {
            filter[field] = value;
            console.log("Updatefiltervalue",field, filter[field]);
        }
        filter.isValid = false;
        const headerElement = document.querySelector(`#${filterId} .filter-header`);
        if (headerElement && headerElement.classList.contains('bg-green-200')) {
            headerElement.classList.remove('bg-green-200');
            headerElement.classList.add('bg-gray-200');
        }
    }
}


$(document).ready(function() {
    $('head').append(`
        <style>
            .bg-yellow-200 {
                background-color: #fefcbf;
            }
            .bg-green-200 {
                background-color:rgb(119, 241, 157);
            }
            .select-with-search {
                position: relative;
            }
            .message.warning {
                background-color: #fbd38d;
                color: #744210;
            }
            .message.error {
                background-color: #feb2b2;
                color: #822727;
            }
            .message.success {
                background-color: #9ae6b4;
                color: #22543d;
            }
            .message.info {
                background-color: #bee3f8;
                color: #2c5282;
            }
        </style>
    `);
});


function addAggregation() {
    // Generate a unique ID using timestamp to avoid duplicate IDs
    const timestamp = new Date().getTime();
    const aggId = `agg-${timestamp}`;
    sortColumn = null;
    sortDirection = 'asc';
    // Get the next sequential number for display purposes
    const aggNumber = aggregations.length + 1;
    
    aggregations.push({
        id: aggId,
        number: aggNumber,
        function: '',
        column: '',
        isComplete: false // Flag to track if aggregation is completely filled
    });

    const aggHtml = `
        <div id="${aggId}" class="filter-item mb-3">
            <div class="filter-header flex justify-between items-center p-2 bg-gray-200 rounded">
                <button onclick="toggleAggregation('${aggId}')" class="toggle-filter">&#9650;</button>
                <span id="agg-title-${aggId}" class="ml-2">Aggregation ${aggNumber}</span>
                <button onclick="removeAggregation('${aggId}')" class="remove-filter">❌</button>
            </div>
            <div id="agg-body-${aggId}" class="filter-body p-2 bg-white rounded shadow">
                <div class="filter-controls">
                        <select id="function-select-${aggId}" class="filter-select w-full" 
                                onchange="updateAggregation('${aggId}', 'function', this.value)">
                            <option value="">Select Function</option>
                            <option value="COUNT">Count</option>
                            <option value="SUM">Sum</option>
                            <option value="AVG">Average</option>
                            <option value="MIN">Minimum</option>
                            <option value="MAX">Maximum</option>
                        </select>
                    <div class="column-select-container mb-2">
                        <select id="column-select-${aggId}" class="filter-select w-full" 
                                onchange="updateAggregation('${aggId}', 'column', this.value)">
                            <option value="">Search or select column</option>
                            ${Array.from(selectedColumns).map(col => 
                                `<option value="${col}">${col}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#aggregations-list').append(aggHtml);
    
    $(`#column-select-${aggId}`).select2({
        width: '100%',
        placeholder: 'Search and select column',
        allowClear: true,
        matcher: matchCustom
    });
    
    // Always show group by section when there's at least one aggregation
    showGroupBySection();
    

    const groupByBody = document.getElementById('group-by-body');
    const toggleButton = document.getElementById('toggle-group-by-btn');
    if (groupByBody && toggleButton) {
        groupByBody.style.display = "block";
        toggleButton.innerHTML = "&#9650;";
    }

    // Update having dropdowns with the new aggregation after it's applied
    updateHavingAggregationOptions();
    
    const newAggElement = document.getElementById(aggId);
    if (newAggElement && sidebar) {
        adjustScrollToElement(newAggElement); // Use centralized scroll utility
    }
}


function toggleAggregation(aggId) {
    const aggBody = document.getElementById(`agg-body-${aggId}`);
    const toggleButton = document.querySelector(`#${aggId} .toggle-filter`);
    
    if (!aggBody || !toggleButton) return;
    
    if (aggBody.style.display === "none") {
        aggBody.style.display = "block";
        toggleButton.innerHTML = "&#9650;";
    } else {
        aggBody.style.display = "none";
        toggleButton.innerHTML = "&#9660;";
    }
    preserveScrollPosition(() => {});
}


function updateAggregation(aggId, field, value) {
    const agg = aggregations.find(a => a.id === aggId);
    sortColumn = null;
    sortDirection = 'asc';
    if (agg) {
        const oldFunction = agg.function;
        const oldColumn = agg.column;
        
        agg[field] = value;
        agg.isComplete = false; // Reset completeness when values change
        
        // Reset the aggregation header styling to default
        const headerElement = document.querySelector(`#${aggId} .filter-header`);
        if (headerElement) {
            headerElement.classList.remove('bg-green-200');
            headerElement.classList.remove('bg-yellow-200');
            headerElement.classList.add('bg-gray-200');
        }
        
        // If this is a complete aggregation (has both function and column)
        // and it was previously complete, update any having conditions that use it
        if (agg.function && agg.column && oldFunction && oldColumn) {
            const oldIdentifier = `${oldFunction}_${oldColumn}`;
            const newIdentifier = `${agg.function}_${agg.column}`;
            
            // Update having conditions that were using this aggregation
            havingConditions.forEach(having => {
                if (`${having.function}_${having.column}` === oldIdentifier) {
                    having.function = agg.function;
                    having.column = agg.column;
                    
                    // Update the dropdown display if it exists
                    const selectElement = $(`#agg-select-${having.id}`);
                    if (selectElement.length) {
                        selectElement.val(newIdentifier).trigger('change');
                    }
                    
                    // Update the having title
                    const titleElement = document.getElementById(`having-title-${having.id}`);
                    if (titleElement) {
                        titleElement.textContent = `Having: ${having.function}(${having.column})`;
                    }
                }
            });
        }
        showGroupBySection();
        const groupByBody = document.getElementById('group-by-body');
        const toggleButton = document.getElementById('toggle-group-by-btn');
        if (groupByBody && toggleButton) {
            groupByBody.style.display = 'block';
            toggleButton.innerHTML = '▲';
        }
    }
}


function removeAggregation(aggId) {
    // Get the aggregation before removing it
    const aggregationToRemove = aggregations.find(a => a.id === aggId);
    
    // Remove the aggregation from the array
    aggregations = aggregations.filter(a => a.id !== aggId);
    
    // Remove the aggregation element from DOM
    document.getElementById(aggId).remove();
    
    // Renumber remaining aggregations
    renumberAggregations();
    
    // Remove any having conditions that use this aggregation
    if (aggregationToRemove) {
        const aggIdentifier = `${aggregationToRemove.function}_${aggregationToRemove.column}`;
        
        // Find having conditions that use this aggregation
        const havingsToRemove = havingConditions.filter(h => 
            `${h.function}_${h.column}` === aggIdentifier
        );
        
        // Remove those having conditions
        havingsToRemove.forEach(having => {
            $(`#agg-select-${having.id}`).select2('destroy');
            $(`#${having.id}`).remove();
        });
        
        // Filter out the removed having conditions
        havingConditions = havingConditions.filter(h => 
            `${h.function}_${h.column}` !== aggIdentifier
        );
    }
    
    // Only hide and clear group by if ALL aggregations are removed
    if (aggregations.length === 0) {
        // Remove Having section entirely when no aggregations exist
        const havingSection = document.getElementById('having-section');
        if (havingSection) {
            havingSection.remove();
            havingConditions = []; // Clear all having conditions
        }
        
        const groupBySection = document.getElementById('group-by-section');
        if (groupBySection) {
            groupBySection.style.display = 'none';
            // Clear group by selections
            groupByColumns.clear();
            renderGroupBySelections();
        }
    } else {
        // Update having dropdowns to remove the deleted aggregation
        updateHavingAggregationOptions();
    }
}


// New function to renumber aggregations
function renumberAggregations() {
    // Update the number property in the aggregations array
    aggregations.forEach((agg, index) => {
        agg.number = index + 1;
        
        // Update the displayed title in the DOM
        const titleElement = document.getElementById(`agg-title-${agg.id}`);
        if (titleElement) {
            titleElement.textContent = `Aggregation ${agg.number}`;
        }
    });
}


// New function to update having condition dropdowns when aggregations change
function updateHavingAggregationOptions() {
    havingConditions.forEach(having => {
        const selectId = `agg-select-${having.id}`;
        const select = $(`#${selectId}`);
        
        if (select.length) {
            // Store current value
            const currentValue = select.val();
            
            // Destroy and rebuild with new options
            select.select2('destroy');
            
            // Update options
            select.empty().append('<option value="">Select Aggregate</option>');
            aggregations.forEach(agg => {
                const value = `${agg.function}_${agg.column}`;
                const option = new Option(`${agg.function}(${agg.column})`, value);
                select.append(option);
            });
            
            // Restore value if it still exists
            if (aggregations.some(agg => 
                `${agg.function}_${agg.column}` === currentValue
            )) {
                select.val(currentValue);
            }
            
            // Reinitialize select2
            initializeHavingSelect(having.id);
        }
    });
}


function showGroupBySection() {
    const existingSection = document.getElementById('group-by-section');
    console.log("showGroupBySection called");
    if (!existingSection) {
        const groupByHtml = `
            <div id="group-by-section" class="sidebar-section">
                <div class="section-header flex justify-between items-center">
                    <h2><i class="fas fa-layer-group w-4 h-4"></i> &nbsp;Group By</h2>
                    <button id="toggle-group-by-btn" class="toggle-section" onclick="toggleGroupBySection()">&#9650;</button>
                </div>
                <div id="group-by-body" class="p-2 bg-white rounded shadow">
                    <select id="group-by-dropdown" 
                            class="filter-select w-full mb-2" 
                            onchange="addGroupByColumn(this.value)"
                            onkeyup="handleDropdownSearch(event)">
                        <option value="">Search or select column...</option>
                    </select>
                    <div id="group-by-selections" class="flex flex-wrap gap-2 mt-2">
                    </div>
                      <div class="text-center my-3" id="apply-all-container">
                    <button onclick="applyAggregations()" class="apply-all-btn bg-blue-500 text-white px-6 py-2 rounded font-medium">Apply All Aggregations</button>
                    </div>
                </div>
                <!-- Apply All button is now part of the Group By section -->
            </div>
        `;
        $('#aggregations-list').after(groupByHtml);
        
        // Initialize select2 on the dropdown
        $('#group-by-dropdown').select2({
            placeholder: 'Search or select column...',
            width: '100%',
            allowClear: true,
            matcher: matchCustom
        });
    } else {
        existingSection.style.display = 'block';
    }
    
    updateGroupByDropdown();
    showHavingSection();
}


// New function to toggle group by section visibility
function toggleGroupBySection() {
    const groupByBody = document.getElementById('group-by-body');
    const toggleButton = document.getElementById('toggle-group-by-btn');
    
    if (!groupByBody || !toggleButton) return;
    
    if (groupByBody.style.display === "none") {
        groupByBody.style.display = "block";
        toggleButton.innerHTML = "&#9650;";
    } else {
        groupByBody.style.display = "none";
        toggleButton.innerHTML = "&#9660;";
    }
    preserveScrollPosition(() => {});
}

function applyAggregations() {
    console.log("Current aggregations state:", JSON.parse(JSON.stringify(aggregations)));
    sortColumn = null;
    sortDirection = 'asc';
    // First ensure all aggregations with both function and column get properly marked as complete
    aggregations.forEach(agg => {
        if (agg.function && agg.column) {
            agg.isComplete = true;
        }
        // else {
        //     agg.isComplete = false;
        // }
    });
    
    // Find aggregations that have only one part filled (function or column but not both)
    const partiallyFilledAggregations = aggregations.filter(a => 
        (a.function && !a.column) || (!a.function && a.column)
    );
    
    // Find completely empty aggregations
    const emptyAggregations = aggregations.filter(a => !a.function && !a.column);
    
    // Find complete aggregations
    const completeAggregations = aggregations.filter(a => a.function && a.column);
    
    console.log("Partially filled:", partiallyFilledAggregations);
    console.log("Empty:", emptyAggregations);
    console.log("Complete:", completeAggregations);
    
    // Check if any aggregations are partially filled
    if (partiallyFilledAggregations.length > 0) {
        showMessage('Please complete all highlighted aggregations (both function AND column required)', 'warning');
        
        // Highlight partially filled aggregations
        partiallyFilledAggregations.forEach(agg => {
            const aggElement = document.getElementById(agg.id);
            if (aggElement) {
                const headerElement = aggElement.querySelector('.filter-header');
                headerElement.classList.remove('bg-gray-200');
                headerElement.classList.remove('bg-green-200');
                headerElement.classList.add('bg-yellow-200');
                
                // Expand to show what's missing
                document.getElementById(`agg-body-${agg.id}`).style.display = 'block';
                document.querySelector(`#${agg.id} .toggle-filter`).innerHTML = "&#9650;";
                
                // Show detailed message about what's missing
                console.log(`Aggregation ${agg.id} is missing: ${!agg.function ? 'function' : 'column'}`);
            }
        });
        return;
    }
    
    // Check if there are complete aggregations and if group by is selected
    if (completeAggregations.length > 0 && groupByColumns.size === 0) {
        showMessage('At least one Group By column is required with aggregations', 'warning');
        return;
    }
    
    // Apply all valid aggregations
    let validAggCount = 0;
    
    completeAggregations.forEach(agg => {
        // Mark as complete (should already be true but ensure it)
        agg.isComplete = true;
        
        // Update header style
        const headerElement = document.querySelector(`#${agg.id} .filter-header`);
        if (headerElement) {
            headerElement.classList.remove('bg-yellow-200');
            headerElement.classList.remove('bg-gray-200');
            headerElement.classList.add('bg-green-200');
        }
        
        // Update the title
        const titleElement = document.getElementById(`agg-title-${agg.id}`);
        if (titleElement) {
            titleElement.textContent = `${agg.function}(${agg.column})`;
        }
        
        // Collapse the aggregation
        const aggBody = document.getElementById(`agg-body-${agg.id}`);
        const toggleButton = document.querySelector(`#${agg.id} .toggle-filter`);
        if (aggBody) {
            aggBody.style.display = "none";
            if (toggleButton) toggleButton.innerHTML = "&#9660;";
        }
        
        validAggCount++;
    });
    
    if (validAggCount > 0) {
        showMessage(`${validAggCount} aggregation(s) applied successfully`, 'success');
        
         // Collapse any open Having conditions
        havingConditions.forEach(having => {
            const havingBody = document.getElementById(`having-body-${having.id}`);
            const havingToggleButton = document.querySelector(`#${having.id} .toggle-having`);
            if (havingBody && havingToggleButton) {
                havingBody.style.display = "none";
                havingToggleButton.innerHTML = "&#9660;";
            }
        });
        
        toggleGroupBySection();
        // Update Having section visibility after applying aggregations
        showHavingSection();
        
        // Update having dropdowns
        updateHavingAggregationOptions();
        
        console.log("Final aggregations state after applying:", JSON.parse(JSON.stringify(aggregations)));
    } else if (aggregations.length > 0 && emptyAggregations.length === aggregations.length) {
        showMessage('Please fill in at least one aggregation', 'warning');
    } else if (aggregations.length === 0) {
        showMessage('No aggregations to apply', 'info');
    }
}


// Custom matcher function for select2
function matchCustom(params, data) {
    // If there are no search terms, return all of the data
    if ($.trim(params.term) === '') {
        return data;
    }

    // Do not display the item if there is no 'text' property
    if (typeof data.text === 'undefined') {
        return null;
    }

    // `params.term` should be the term that is used for searching
    // `data.text` is the text that is displayed for the data object
    if (data.text.toLowerCase().indexOf(params.term.toLowerCase()) > -1) {
        return data;
    }

    // Return `null` if the term should not be displayed
    return null;
}

function updateGroupByDropdown() {
    const $dropdown = $('#group-by-dropdown');
    // Destroy existing select2 if it exists
    // Clear and add default option
    $dropdown.empty().append('<option value="">Search or select column...</option>');
    
    // Add columns that aren't already selected for grouping
    const availableColumns = Array.from(selectedColumns)
        .filter(col => !groupByColumns.has(col))
        .sort((a, b) => {
            // Sort by table name first, then column name
            const [tableA, colA] = a.split('.');
            const [tableB, colB] = b.split('.');
            return tableA === tableB ? colA.localeCompare(colB) : tableA.localeCompare(tableB);
        });

    availableColumns.forEach(col => {
        const option = new Option(col, col);
        $dropdown.append(option);
    });

    // Reinitialize select2
    $dropdown.trigger('change');
}

function addGroupByColumn(column) {
    console.log("addGroupByColumn called with column:", column);
    sortColumn = null;
        sortDirection = 'asc';
    if (!column) return;
    if (!groupByColumns.has(column)) {
        groupByColumns.add(column);
        renderGroupBySelections();
        updateGroupByDropdown();
        updateSelectedColumnsDisplay();
        showGroupBySection();
    }
}

function removeGroupByColumn(column) {
    
    
    // If no group by columns left and aggregations exist, show warning
    if (groupByColumns.size === 0 && aggregations.length > 0) {
        showMessage('At least one Group By column is required with aggregations', 'warning');
        return;
    }
    groupByColumns.delete(column);
    renderGroupBySelections();
    updateGroupByDropdown();
    updateSelectedColumnsDisplay();
    if (groupByColumns.size > 0 && aggregations.length > 0) {
        showHavingSection();
    } else {
        hideHavingSection();
    }
}

function renderGroupBySelections() {
    const container = document.getElementById('group-by-selections');
    if (!container) return;
    
    container.innerHTML = '';
    container.style.maxHeight = '200px'; // Adjust as needed
    container.style.overflowY = 'auto';
    
    // Remove the check for aggregations.length as group by should persist
    groupByColumns.forEach(column => {
        const [table, columnName] = column.split('.');
        const pill = document.createElement('div');
        pill.className = 'bg-gray-200 rounded-full px-3 py-1 flex items-center';
        pill.innerHTML = `
            <span class="mr-1">${columnName}</span>
            <span class="text-gray-500">(${table})</span>
            <button onclick="removeGroupByColumn('${column}')" class="ml-2 text-gray-500 hover:text-gray-700">✕</button>
        `;
        container.appendChild(pill);
    });
}




function showMessage(message, type = 'info') {
    const messageDiv = $('<div>')
        .addClass(`message fixed top-4 right-4 p-4 rounded shadow-lg z-50 ${type}`)
        .text(message);

    $('.message').remove();
    $('body').append(messageDiv);

    setTimeout(() => messageDiv.remove(), 3000);
}

// Get message CSS class based on type
function getMessageClass(type) {
    const classes = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    return `${classes[type] || classes.info} text-white`;
}

// Modified showHavingSection to only show when there are aggregations
function showHavingSection() {
    console.log("showHavingSection called, groupByColumns.size:", groupByColumns.size);
    const existingSection = document.getElementById('having-section');
    console.log("Existing section:", existingSection);
    console.log("Showhaving");
    const groupBySection = document.getElementById('group-by-section');
    
    if (!groupBySection) {
        console.error("Group By section not found in DOM");
        showGroupBySection();  // Ensure it exists first
        return;
    }

    // Only show Having if there are both Group By columns AND aggregations
    if (!existingSection && groupByColumns.size > 0 && aggregations.length > 0) {
        const havingHtml = `
            <div id="having-section" class="sidebar-section">
                <div class="section-header">
                    <h2><i class="fas fa-filter w-4 h-4"></i> &nbsp;Having</h2>
                    <button onclick="addHavingCondition()" class="add-button">+</button>
                </div>
                <div id="having-list">
                    <!-- Having conditions will be added here -->
                </div>
            </div>
        `;
        $('#group-by-section').after(havingHtml);
    } else if (existingSection) {
        // Only show the Having section if there are aggregations
        if (groupByColumns.size > 0 && aggregations.length > 0) {
            existingSection.style.display = 'block';
        } else {
            existingSection.style.display = 'none';
            // If no aggregations, completely remove the Having section
            if (aggregations.length === 0) {
                existingSection.remove();
                havingConditions = []; // Clear all having conditions
            }
        }
    }
}


function hideHavingSection() {
    const havingSection = document.getElementById('having-section');
    if (havingSection) {
        // Remove Having section entirely when no Group By columns OR no aggregations
        if (groupByColumns.size === 0 || aggregations.length === 0) {
            havingSection.remove();
            havingConditions = [];  // Clear having conditions
            $('#having-list').empty();
        } else {
            havingSection.style.display = 'none';
        }
    }
}


// Modified addHavingCondition to use unique IDs
function addHavingCondition() {
    // Generate a unique ID using timestamp
    const timestamp = new Date().getTime();
    const havingId = `having-${timestamp}`;
    
    // Get the next sequential number for display
    const havingNumber = havingConditions.length + 1;
    
    havingConditions.push({
        id: havingId,
        number: havingNumber,
        function: '',
        column: '',
        operator: '',
        value: ''
    });

    const havingHtml = `
        <div id="${havingId}" class="having-item">
            <div class="having-header flex justify-between items-center p-2 bg-gray-200 rounded">
                <button onclick="toggleHaving('${havingId}')" class="toggle-having">&#9650;</button>
                <span id="having-title-${havingId}" class="ml-2">Having ${havingNumber}</span>
                <button onclick="removeHaving('${havingId}')" class="remove-having">❌</button>
            </div>
            <div id="having-body-${havingId}" class="having-body p-2 bg-white rounded shadow">
                <div class="having-controls">
                    <select id="agg-select-${havingId}" class="having-select" onchange="updateHavingAgg('${havingId}', this.value)">
                        <option value="">Select Aggregate</option>
                        ${aggregations.map(agg => 
                            `<option value="${agg.function}_${agg.column}">${agg.function}(${agg.column})</option>`
                        ).join('')}
                    </select>
                    <div id="operator-container-${havingId}"></div>
                    <div id="value-container-${havingId}"></div>
                </div>
                <div class="having-actions flex justify-end">
                    <button onclick="applyHaving('${havingId}')" class="apply-btn">Apply</button>
                </div>
            </div>
        </div>
    `;
    $('#having-list').append(havingHtml);
    initializeHavingSelect(havingId);
}


function initializeHavingSelect(havingId) {
    $(`#agg-select-${havingId}`).select2({
        placeholder: 'Select aggregate...',
        width: '100%',
        allowClear: true,
        matcher: matchCustom,
        dropdownParent: $(`#${havingId}`) // Match filter dropdown setup    
});
}

// Fixed toggleHaving function to only toggle the specified having condition
function toggleHaving(havingId) {
    const havingBody = document.getElementById(`having-body-${havingId}`);
    const toggleButton = document.querySelector(`#${havingId} .toggle-having`);
    
    if (!havingBody || !toggleButton) return;
    
    if (havingBody.style.display === "none") {
        havingBody.style.display = "block";
        toggleButton.innerHTML = "&#9650;";
        initializeHavingSelect(havingId);
    } else {
        havingBody.style.display = "none";
        toggleButton.innerHTML = "&#9660;";
    }
}






// Update Having aggregate selection
function updateHavingAgg(havingId, aggValue) {
    const having = havingConditions.find(h => h.id === havingId);
    if (having) {
        if (aggValue) {
            console.log("Agg Value in updateHaving",aggValue);
            // const [func,col] = aggValue.split('_',2);  // Split into function and column
            const [func, col] = aggValue.match(/^([A-Z]+)_(.+)$/).slice(1);
            console.log("Update Having full :",having);
            having.function = func;
            console.log("Function:",func);
            console.log("Column:",col);
            having.column = col // Revert underscore to dot
            console.log(`Updated ${havingId}: function=${func}, column=${having.column}`);  // Log the update
            updateHavingOperators(havingId);
        } else {
            having.function = '';
            having.column = '';
            $(`#operator-container-${havingId}`).empty();
            $(`#value-container-${havingId}`).empty();
        }
    }
    
}
// Update Having operators
function updateHavingOperators(havingId) {
    const operators = [
        { value: 'eq', label: 'Equal to' },
        { value: 'neq', label: 'Not equal to' },
        { value: 'gt', label: 'Greater than' },
        { value: 'gte', label: 'Greater than or equal to' },
        { value: 'lt', label: 'Less than' },
        { value: 'lte', label: 'Less than or equal to' }
    ];

    const operatorHtml = `
        <select onchange="updateHavingOperator('${havingId}', this.value)" class="having-select">
            <option value="">Select Operator</option>
            ${operators.map(op => `<option value="${op.value}">${op.label}</option>`).join('')}
        </select>
    `;

    $(`#operator-container-${havingId}`).html(operatorHtml);
    $(`#value-container-${havingId}`).empty();
}

// Update Having operator selection
function updateHavingOperator(havingId, operator) {
    const having = havingConditions.find(h => h.id === havingId);
    if (having) {
        having.operator = operator;
        having.value = '';
        updateHavingValueInput(havingId);
    }
}

// Update Having value input
function updateHavingValueInput(havingId) {
    const having = havingConditions.find(h => h.id === havingId);
    const valueHtml = `<input type="number" class="having-input" onchange="updateHavingValue('${havingId}', this.value)">`;
    $(`#value-container-${havingId}`).html(valueHtml);
}

// Update Having value
function updateHavingValue(havingId, value) {
    const having = havingConditions.find(h => h.id === havingId);
    if (having) {
        having.value = value;
    }
}


// Fixed applyHaving function to only toggle the specific having condition
function applyHaving(havingId) {
    const having = havingConditions.find(h => h.id === havingId);
    if (!having) return;
    
    if (!having.function || !having.operator || !having.value) {
        showMessage('Please fill in all having fields', 'warning');
        return;
    }
    
    document.getElementById(`having-title-${havingId}`).textContent = `Having: ${having.function}(${having.column})`;
    
    // Only toggle this specific having condition
    toggleHaving(havingId);
    
    showMessage('Having condition applied successfully', 'success');
}

// Fixed removeHaving function with proper renumbering
function removeHaving(havingId) {
    try {
        $(`#agg-select-${havingId}`).select2('destroy');
    } catch (e) {
        console.log("Select2 destroy error:", e);
    }
    
    havingConditions = havingConditions.filter(h => h.id !== havingId);
    $(`#${havingId}`).remove();
    
    // Renumber remaining having conditions
    renumberHavingConditions();
}

// New function to renumber having conditions
function renumberHavingConditions() {
    // Update the number property in the havingConditions array
    havingConditions.forEach((having, index) => {
        having.number = index + 1;
        
        // Update the displayed title in the DOM if it hasn't been customized
        const titleElement = document.getElementById(`having-title-${having.id}`);
        if (titleElement && titleElement.textContent.startsWith('Having ')) {
            titleElement.textContent = `Having ${having.number}`;
        }
    });
}

// Add these variables at the top of analyzer.js with other global variables



// Visualization functionality to integrate with existing generateData function
let visualizationState = {
    currentData: null,
    currentColumns: null,
    chart: null
};


function initializeVisualization() {
    // Event listeners for visualization controls
    document.getElementById('close-visualization-btn').addEventListener('click', toggleSection);
    document.getElementById('chart-type').addEventListener('change', updateVisualization);
    document.getElementById('x-axis-field').addEventListener('change', updateVisualization);
    document.getElementById('y-axis-field').addEventListener('change', updateVisualization);
}

function toggleSection() {
    const tableDisplay = document.getElementById('table-display');
    const vizContainer = document.getElementById('visualization-container');
    const toggleBtn = document.getElementById('toggle-section-btn');

    if (tableDisplay.classList.contains('hidden')) {
        // Switch to table view
        tableDisplay.classList.remove('hidden');
        vizContainer.classList.add('hidden');
        toggleBtn.textContent = 'Show Visualization';
    } else {
        // Switch to visualization view
        tableDisplay.classList.add('hidden');
        vizContainer.classList.remove('hidden');
        toggleBtn.textContent = 'Show Table';
        
        // If data exists, prepare visualization
        if (visualizationState.currentData && visualizationState.currentColumns) {
            prepareVisualizationControls(visualizationState.currentColumns);
            updateVisualization();
        } else {
            captureTableData();
        }
    }
}

// Toggle visualization panel visibility
function toggleVisualization() {
    const vizContainer = document.getElementById('visualization-container');
    if (vizContainer.classList.contains('hidden')) {
        vizContainer.classList.remove('hidden');
        
        // If we have data already, prepare visualization
        if (visualizationState.currentData && visualizationState.currentColumns) {
            prepareVisualizationControls(visualizationState.currentColumns);
            updateVisualization();
        } else {
            // Try to get data from the table
            captureTableData();
        }
    } else {
        vizContainer.classList.add('hidden');
    }
}

// Capture data from the generated table
function captureTableData() {
    const table = document.getElementById('data-table');
    if (!table) {
        showMessage('No data table found. Generate data first.', 'error');
        return;
    }
    
    // Get headers
    const headers = [];
    const headerCells = table.querySelectorAll('thead th');
    headerCells.forEach(cell => {
        headers.push(cell.textContent.trim().replace(/[↑↓\s]+$/, ''));
    });
    
    // Get data
    const data = [];
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const rowData = {};
        row.querySelectorAll('td').forEach((cell, index) => {
            rowData[headers[index]] = cell.textContent.trim();
        });
        data.push(rowData);
    });
    
    if (data.length === 0) {
        showMessage('No data available for visualization', 'error');
        return;
    }
    
    // Store captured data
    visualizationState.currentData = data;
    visualizationState.currentColumns = headers;
    
    // Prepare controls
    prepareVisualizationControls(headers);
}

// Store data from the generateData response for visualization
function storeDataForVisualization(columns, data) {
    visualizationState.currentData = data;
    visualizationState.currentColumns = columns;
    
    // If visualization is already visible, update the controls
    const vizContainer = document.getElementById('visualization-container');
    if (vizContainer && !vizContainer.classList.contains('hidden')) {
        prepareVisualizationControls(columns);
        updateVisualization();
    }
}

// Prepare visualization controls with column options
function prepareVisualizationControls(columns) {
    const xAxisSelect = document.getElementById('x-axis-field');
    const yAxisSelect = document.getElementById('y-axis-field');
    
    // Clear existing options
    xAxisSelect.innerHTML = '<option value="">Select a field</option>';
    yAxisSelect.innerHTML = '<option value="">Select a field</option>';
    
    // Add column options
    columns.forEach(column => {
        xAxisSelect.innerHTML += `<option value="${column}">${column}</option>`;
        yAxisSelect.innerHTML += `<option value="${column}">${column}</option>`;
    });
    
    // Select first column for X-axis by default
    if (columns.length > 0) {
        xAxisSelect.value = columns[0];
        
        // Try to find a numeric column for Y-axis
        const numericColumn = findNumericColumn();
        if (numericColumn) {
            yAxisSelect.value = numericColumn;
        } else if (columns.length > 1) {
            yAxisSelect.value = columns[1];
        } else {
            yAxisSelect.value = columns[0]; // Fallback to first column
        }
    }
}

// Find a numeric column for the Y-axis
function findNumericColumn() {
    if (!visualizationState.currentData || visualizationState.currentData.length === 0) return null;
    
    const firstRow = visualizationState.currentData[0];
    
    for (const column of visualizationState.currentColumns) {
        const value = firstRow[column];
        // Check if value is a number or can be converted to a number
        if (!isNaN(Number(value)) && value !== '') {
            return column;
        }
    }
    
    return null;
}

// Update visualization based on selected options
function updateVisualization() {
    const chartType = document.getElementById('chart-type').value;
    const xField = document.getElementById('x-axis-field').value;
    const yField = document.getElementById('y-axis-field').value;
    
    if (!xField || !yField) {
        return; // Don't proceed without fields selected
    }
    
    const ctx = document.getElementById('visualization-chart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (visualizationState.chart) {
        visualizationState.chart.destroy();
    }
    
    // Prepare data for the chart
    switch (chartType) {
        case 'bar':
            renderBarChart(ctx, xField, yField);
            break;
        case 'pie':
            renderPieChart(ctx, xField, yField);
            break;
        case 'line':
            renderLineChart(ctx, xField, yField);
            break;
        case 'scatter':
            renderScatterChart(ctx, xField, yField);
            break;
    }
}

// Render a bar chart
function renderBarChart(ctx, xField, yField) {
    // Group and aggregate data
    const aggregatedData = aggregateData(xField, yField);
    
    visualizationState.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: aggregatedData.labels,
            datasets: [{
                label: yField,
                data: aggregatedData.values,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: yField
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: xField
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${yField} by ${xField}`
                }
            }
        }
    });
}

// Render a pie chart
function renderPieChart(ctx, xField, yField) {
    // Group and aggregate data
    const aggregatedData = aggregateData(xField, yField);
    
    // Generate colors
    const colors = generateColors(aggregatedData.labels.length);
    
    visualizationState.chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: aggregatedData.labels,
            datasets: [{
                data: aggregatedData.values,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${yField} by ${xField}`
                },
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

// Render a line chart
function renderLineChart(ctx, xField, yField) {
    // Group and aggregate data
    const aggregatedData = aggregateData(xField, yField);
    
    visualizationState.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: aggregatedData.labels,
            datasets: [{
                label: yField,
                data: aggregatedData.values,
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: yField
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: xField
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${yField} by ${xField}`
                }
            }
        }
    });
}

// Render a scatter chart
function renderScatterChart(ctx, xField, yField) {
    const data = visualizationState.currentData;
    const dataPoints = [];
    
    // Get each individual data point for scatter plot
    data.forEach(row => {
        const xValue = Number(row[xField]);
        const yValue = Number(row[yField]);
        
        // Only add valid numeric points
        if (!isNaN(xValue) && !isNaN(yValue)) {
            dataPoints.push({
                x: xValue,
                y: yValue
            });
        }
    });
    
    visualizationState.chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: `${xField} vs ${yField}`,
                data: dataPoints,
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: xField
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: yField
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${xField} vs ${yField} Scatter Plot`
                }
            }
        }
    });
}

// Helper function to aggregate data for charts
function aggregateData(xField, yField) {
    const data = visualizationState.currentData;
    const aggregates = {};
    const counts = {};
    
    // Group data by xField
    data.forEach(row => {
        const xValue = row[xField];
        const yValue = Number(row[yField]);
        
        if (xValue && !isNaN(yValue)) {
            if (!aggregates[xValue]) {
                aggregates[xValue] = 0;
                counts[xValue] = 0;
            }
            
            aggregates[xValue] += yValue;
            counts[xValue]++;
        }
    });
    
    // Convert to arrays for Chart.js
    const labels = Object.keys(aggregates);
    
    // Calculate average if needed
    const values = labels.map(label => aggregates[label]);
    
    return { labels, values };
}

// Generate colors for charts
function generateColors(count) {
    const baseColors = [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)',
        'rgba(83, 102, 255, 0.7)',
        'rgba(40, 159, 64, 0.7)',
        'rgba(210, 199, 199, 0.7)'
    ];
    
    // If we need more colors than in our base set
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    
    return colors;
}

// Extend the existing generateData function to store data for visualization
const originalGenerateData = window.generateData || function(){};

window.generateData = function(page = 1, resetSort = false) {
    // Call the original function
    originalGenerateData(page, resetSort);
    
    // Modify the success callback to capture data for visualization
    const originalSuccess = $.ajax.success;
    $.ajax.success = function(response) {
        // Original success handler
        originalSuccess(response);
        
        // Capture data for visualization
        if (response && response.columns && response.data) {
            storeDataForVisualization(response.columns, response.data);
        }
    };
    
    // Initialize visualization components if not already
    initializeVisualization();
};

// Initialize visualization when the document is ready


let currentPage = 1;
let totalPages = 1;
let pageSize = 100;

function generateData(page = 1,resetSort = true) {
    if (resetSort) {
        sortColumn = null;
        sortDirection = 'asc';
        console.log("reset Sortcolumn",sortColumn);
    }
    console.log("gen Sortcolumn",sortColumn);
    if (selectedColumns.size === 0) {
        showMessage('Please select at least one column', 'error');
        return;
    }
    
    if (aggregations.length > 0 && groupByColumns.size === 0) {
        showMessage('Select Group By', 'error');
        return;
    }
      // Find filters that have some data entered but are not complete
      const incompleteFilters = filters.filter(f => !f.isValid && (f.column || f.operator || f.value1 || f.value2 || (f.values && f.values.length > 0)));
    
      // Find filters that are completely empty (no data entered at all)
      const emptyFilters = filters.filter(f => !f.column && !f.operator && !f.value1 && !f.value2 && (!f.values || f.values.length === 0));
      
      // Highlight incomplete filters (partially filled)
      if (incompleteFilters.length > 0) {
          incompleteFilters.forEach(filter => {
              const filterElement = document.getElementById(filter.id);
              if (filterElement) {
                  const headerElement = filterElement.querySelector('.filter-header');
                  headerElement.classList.remove('bg-gray-200');
                  headerElement.classList.remove('bg-green-200');
                  headerElement.classList.add('bg-yellow-200');
                  
                  // Expand the filter to show what's missing
                  document.getElementById(`filter-body-${filter.id}`).style.display = 'block';
                  document.querySelector(`#${filter.id} .toggle-filter`).innerHTML = "&#9650;";
              }
          });
          
          showMessage('Please complete highlighted filters before generating data', 'warning');
          return;
      }

       // Find aggregations that have some data entered but are not complete
    const incompleteAggregations = aggregations.filter(a => !a.isComplete && (a.function || a.column));
    
    // Find aggregations that are completely empty (no data entered at all)
    const emptyAggregations = aggregations.filter(a => !a.function && !a.column);
    
    // Check if aggregations exist and if group by is required
    if (aggregations.length > 0 && aggregations.some(a => a.isComplete) && groupByColumns.size === 0) {
        showMessage('At least one Group By column is required with aggregations', 'error');
        return;
    }
    
    // Highlight incomplete aggregations (partially filled)
    if (incompleteAggregations.length > 0) {
        incompleteAggregations.forEach(agg => {
            const aggElement = document.getElementById(agg.id);
            if (aggElement) {
                const headerElement = aggElement.querySelector('.filter-header');
                headerElement.classList.remove('bg-gray-200');
                headerElement.classList.remove('bg-green-200');
                headerElement.classList.add('bg-yellow-200');
                
                // Expand the aggregation to show what's missing
                document.getElementById(`agg-body-${agg.id}`).style.display = 'block';
                document.querySelector(`#${agg.id} .toggle-filter`).innerHTML = "&#9650;";
            }
        });
        
        showMessage('Please complete highlighted aggregations before generating data', 'warning');
        return;
    }
    
    // Display warning for empty aggregations
    if (emptyAggregations.length > 0) {
        // Warn user about empty aggregations
        showMessage('You have empty aggregations. Please fill them in or remove them before generating data.', 'warning');
        
        // Highlight empty aggregations
        emptyAggregations.forEach(agg => {
            const aggElement = document.getElementById(agg.id);
            if (aggElement) {
                const headerElement = aggElement.querySelector('.filter-header');
                headerElement.classList.remove('bg-gray-200');
                headerElement.classList.remove('bg-green-200');
                headerElement.classList.add('bg-yellow-200');
                
                // Expand the aggregation to show it's empty
                document.getElementById(`agg-body-${agg.id}`).style.display = 'block';
                document.querySelector(`#${agg.id} .toggle-filter`).innerHTML = "&#9650;";
            }
        });
        
        return;
    }
      
      // Display warning for empty filters
      if (emptyFilters.length > 0) {
          // Option 1: Remove empty filters automatically
          // emptyFilters.forEach(filter => removeFilter(filter.id));
          
          // Option 2: Warn user about empty filters
          showMessage('You have empty filters. Please fill them in or remove them before generating data.', 'warning');
          
          // Highlight empty filters
          emptyFilters.forEach(filter => {
              const filterElement = document.getElementById(filter.id);
              if (filterElement) {
                  const headerElement = filterElement.querySelector('.filter-header');
                  headerElement.classList.remove('bg-gray-200');
                  headerElement.classList.remove('bg-green-200');
                  headerElement.classList.add('bg-yellow-200');
                  
                  // Expand the filter to show it's empty
                  document.getElementById(`filter-body-${filter.id}`).style.display = 'block';
                  document.querySelector(`#${filter.id} .toggle-filter`).innerHTML = "&#9650;";
              }
          });
          
          return;
      }
  

    showMessage('Generating data...', 'info');
    
    $.ajax({
        url: '/generate_data/',
        method: 'GET',
        data: {
            'columns[]': Array.from(selectedColumns),
            'filters': JSON.stringify(filters.map(f => {
                let filterData = {
                    id: f.id,
                    column: f.column,
                    operator: f.operator,
                    values: Array.isArray(f.values) ? f.values : [],
                };
                if (f.value1 !== undefined && f.value1 !== null && f.value1 !== '') {
                    filterData.value1 = f.value1;
                }
                if (f.value2 !== undefined && f.value2 !== null && f.value2 !== '') {
                    filterData.value2 = f.value2;
                }
                return filterData;
            })),
            'groupBy[]': Array.from(groupByColumns),
            'aggregations': JSON.stringify(aggregations),
            'having': JSON.stringify(havingConditions.map(h => ({
                function: h.function,
                column: h.column,
                operator: h.operator,
                value: h.value
            }))),
            'page': page,
            'page_size': pageSize,
            'sort_column': sortColumn,
            'sort_direction': sortDirection
        },
        traditional: true,
        success: function(response) {
            if (response.error) {
                showMessage(response.error, 'error');
                return;
            }
            
            if (!response.columns || !response.data) {
                showMessage('Invalid response format from server', 'error');
                console.error('Invalid response:', response);
                return;
            }
            if (response.sql_query) {
                // Format the SQL query for better readability
                const formattedQuery = response.sql_query
                $('#sql-query-display').text(formattedQuery);
                $('#sql-query-container').show();
            } else {
                $('#sql-query-container').hide();
            }

            currentPage = response.page;
            totalPages = response.total_pages;

            const tableContainer = document.querySelector('.table-container');
            if (!tableContainer) return;
            console.log("SortColumn:", sortColumn);
            console.log("SortDirection:", sortDirection);
            console.log("SelectedColumns: ",selectedColumns);
            // Map response columns to fully qualified names if needed
            const displayColumns = response.columns.map(col => {
                // If the column is an aggregation (e.g., COUNT_patients_age), keep it as is
                // if (col.includes('_')) return col;
                // Otherwise, find the matching full name from selectedColumns
                return Array.from(selectedColumns).find(fullCol => fullCol.endsWith(`.${col}`)) || col;
            });

            tableContainer.innerHTML = `
                <div class="table-wrapper">
                    <div class="table-header flex justify-between items-center mb-2">
                        <h3 class="text-lg font-medium">Generated Data</h3>
                        <div class="order-by-controls">
                            <select id="order-by-select" class="border rounded p-1 text-sm">
                                <option value="">No Order By</option>
                                ${displayColumns.map(fullCol => {
                                    const colName = fullCol.includes('.') ? fullCol.split('.')[1] : fullCol;
                                    return `
                                        <option value="${fullCol}" ${sortColumn === fullCol ? 'selected' : ''}>
                                            ${colName}${sortColumn === fullCol ? ' (' + (sortDirection === 'asc' ? '↑' : '↓') + ')' : ''}
                                        </option>
                                    `;
                                }).join('')}
                            </select>
                            <button id="toggle-direction" class="ml-2 px-2 py-1 bg-gray-200 rounded text-sm" 
                                    ${sortColumn ? '' : 'disabled'}>
                                ${sortDirection === 'asc' ? '↓ Desc' : '↑ Asc'}
                            </button>
                        </div>
                    </div>
                    <table id="data-table" class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                ${response.columns.map(col => `
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        ${col}
                                        ${sortColumn && sortColumn.endsWith(`.${col}`) || sortColumn === col ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${response.data.map(row => `
                                <tr class="hover:bg-gray-50">
                                    ${response.columns.map(col => `
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            ${row[col] !== null ? row[col] : ''}
                                        </td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            // Add event listeners for sorting controls
            $('#order-by-select').on('change', function() {
                sortColumn = this.value || null;
                console.log("Column in order by :  ",sortColumn);
                if (!sortColumn) {
                    sortDirection = 'asc';
                    $('#toggle-direction').prop('disabled', true);
                } else {
                    $('#toggle-direction').prop('disabled', false);
                }
                console.log("New SortColumn:", sortColumn);
                generateData(currentPage,false);
            });

            $('#toggle-direction').on('click', function() {
                if (sortColumn) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                    console.log("New SortDirection:", sortDirection);
                    generateData(currentPage,false);
                }
            });

            const tableWrapper = tableContainer.querySelector('.table-wrapper');
            const table = tableContainer.querySelector('#data-table');
            
            const columnCount = response.columns.length;
            if (columnCount <= 3) {
                table.style.width = '100%';
                table.style.tableLayout = 'fixed';
                const cells = table.querySelectorAll('th, td');
                cells.forEach(cell => {
                    cell.style.width = `${100 / columnCount}%`;
                });
            } else {
                table.style.width = 'auto';
                table.style.tableLayout = 'auto';
            }
            
            storeDataForVisualization(response.columns, response.data);

            // Update button state if visualization is currently shown
            const vizContainer = document.getElementById('visualization-container');
            if (!vizContainer.classList.contains('hidden')) {
                toggleSection(); // Reset to table view after new data generation
            }

            updatePaginationControls(response.page, response.total_pages, response.total_count);

            const rowCount = response.data.length;
            const startRow = (response.page - 1) * pageSize + 1;
            const endRow = Math.min(startRow + rowCount - 1, response.total_count);
            showMessage(`Showing rows ${startRow}-${endRow} of ${response.total_count}`, 'success');
        },
        error: function(xhr, status, error) {
            console.error('Ajax error:', {xhr, status, error});
            showMessage(`Error: ${error}. Check console for details.`, 'error');
        }
    });
}

$(document).ready(function() {
    // Your existing document.ready code...
    
    // Add clipboard functionality for the SQL query
    $('#copy-sql-btn').click(function() {
        const sqlQuery = $('#sql-query-display').text();
        navigator.clipboard.writeText(sqlQuery).then(function() {
            // Show a temporary success message
            const originalText = $('#copy-sql-btn').html();
            $('#copy-sql-btn').html('<i class="fas fa-check"></i> Copied!');
            setTimeout(function() {
                $('#copy-sql-btn').html(originalText);
            }, 2000);
        });
    });
});

const orderByStyles = `
    .table-header {
        padding: 0.5rem 1rem;
    }
    .order-by-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    #order-by-select {
        min-width: 150px;
    }
    #toggle-direction:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

// Add to document with existing styles
$('<style>').text(dropdownStyles + orderByStyles).appendTo('head');

function updatePaginationControls(currentPage, totalPages, totalCount) {
    const paginationContainer = $('#pagination-controls');
    paginationContainer.empty();

    if (totalPages <= 1) {
        return;
    }

    const paginationHtml = `
        <div class="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
            <div class="flex justify-between flex-1 sm:hidden">
                <button onclick="generateData(${currentPage - 1})" 
                        class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        ${currentPage === 1 ? 'disabled' : ''}>
                    Previous
                </button>
                <button onclick="generateData(${currentPage + 1})"
                        class="relative inline-flex items-center px-4 py-2 ml-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        ${currentPage === totalPages ? 'disabled' : ''}>
                    Next
                </button>
            </div>
            <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                    <p class="text-sm text-gray-700">
                        Showing page <span class="font-medium">${currentPage}</span> of <span class="font-medium">${totalPages}</span>
                    </p>
                </div>
                <div>
                    <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button onclick="generateData(1)"
                                class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                                ${currentPage === 1 ? 'disabled' : ''}>
                            <span class="sr-only">First</span>
                            &laquo;
                        </button>
                        <button onclick="generateData(${currentPage - 1})"
                                class="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                                ${currentPage === 1 ? 'disabled' : ''}>
                            <span class="sr-only">Previous</span>
                            &lsaquo;
                        </button>
                        
                        <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                            Page ${currentPage}
                        </span>
                        
                        <button onclick="generateData(${currentPage + 1})"
                                class="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                                ${currentPage === totalPages ? 'disabled' : ''}>
                            <span class="sr-only">Next</span>
                            &rsaquo;
                        </button>
                        <button onclick="generateData(${totalPages})"
                                class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                                ${currentPage === totalPages ? 'disabled' : ''}>
                            <span class="sr-only">Last</span>
                            &raquo;
                        </button>
                    </nav>
                </div>
            </div>
        </div>
    `;
    
    paginationContainer.html(paginationHtml);
}

function exportExcel() {
    if (selectedColumns.size === 0) {
        showMessage('Please select at least one column', 'error');
        return;
    }

    showMessage('Preparing Excel file for download...', 'info');

    // Build the URL with parameters
    const params = new URLSearchParams();
    Array.from(selectedColumns).forEach(col => params.append('columns[]', col));
    Array.from(groupByColumns).forEach(col => params.append('groupBy[]', col));
    params.append('filters', JSON.stringify(filters));
    params.append('aggregations', JSON.stringify(aggregations));
    params.append('having', JSON.stringify(havingConditions));
    params.append('sort_column',sortColumn);
    params.append('sort_direction',sortDirection);

    // Trigger download
    window.location.href = `/export_excel/?${params.toString()}`;
}

$(document).ready(() => {
    fetchTables();
    initializeVisualization();
    document.getElementById('toggle-section-btn').addEventListener('click', toggleSection);
});

function calculateColumnWidths(columns, data) {
    const widths = {};
    
    columns.forEach(column => {
        // Create a temporary span to measure text width
        const span = document.createElement('span');
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'nowrap';
        document.body.appendChild(span);
        
        // Measure header width
        span.textContent = column;
        let maxWidth = span.offsetWidth;
        
        // Measure content width
        data.forEach(row => {
            const value = row[column]?.toString() || '';
            span.textContent = value;
            maxWidth = Math.max(maxWidth, span.offsetWidth);
        });
        
        // Add padding and store width
        widths[column] = maxWidth + 32; // 16px padding on each side
        
        // Clean up
        document.body.removeChild(span);
    });
    
    return widths;
}

function setupTableStructure() {
    const tableContainer = document.querySelector('.table-container');
    if (!tableContainer) return;

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'table-wrapper';
    
    const table = tableContainer.querySelector('#data-table');
    if (table) {
        table.style.tableLayout = 'auto';
        tableWrapper.appendChild(table);
        tableContainer.appendChild(tableWrapper);
    }
}

function initializeTableScroll() {
    const tableWrapper = document.querySelector('.table-wrapper');
    if (!tableWrapper) return;

    // Create shadow indicators
    const leftShadow = document.createElement('div');
    leftShadow.className = 'shadow-indicator-left';
    const rightShadow = document.createElement('div');
    rightShadow.className = 'shadow-indicator-right';

    tableWrapper.parentElement.appendChild(leftShadow);
    tableWrapper.parentElement.appendChild(rightShadow);

    // Handle scroll events
    tableWrapper.addEventListener('scroll', () => {
        const maxScroll = tableWrapper.scrollWidth - tableWrapper.clientWidth;
        
        // Show/hide left shadow
        if (tableWrapper.scrollLeft > 0) {
            leftShadow.classList.add('show-shadow');
        } else {
            leftShadow.classList.remove('show-shadow');
        }
        
        // Show/hide right shadow
        if (tableWrapper.scrollLeft < maxScroll - 1) {
            rightShadow.classList.add('show-shadow');
        } else {
            rightShadow.classList.remove('show-shadow');
        }
    });

    // Trigger initial scroll check
    tableWrapper.dispatchEvent(new Event('scroll'));
}
// Call these functions after your table is populated
document.addEventListener('DOMContentLoaded', () => {
    setupTableStructure();
});
