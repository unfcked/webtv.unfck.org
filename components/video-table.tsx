'use client';

import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type ColumnFiltersState,
  type SortingState,
  type Column,
} from '@tanstack/react-table';
import { Video } from '@/lib/un-api';

// Extend column meta to include filter components
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    filterComponent?: (props: { column: Column<TData, TValue>; options?: string[] }) => JSX.Element;
    filterOptions?: string[];
  }
}

const columnHelper = createColumnHelper<Video>();

function SelectFilter({ column, options = [] }: { column: Column<Video, unknown>; options?: string[] }) {
  const filterValue = column.getFilterValue() as string;
  
  return (
    <select
      value={filterValue || ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function TextFilter({ column }: { column: Column<Video, unknown> }) {
  const filterValue = column.getFilterValue() as string;
  
  return (
    <input
      type="text"
      value={filterValue || ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Filter..."
      className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function DateFilter({ column, options = [] }: { column: Column<Video, unknown>; options?: string[] }) {
  const filterValue = column.getFilterValue() as string;
  
  return (
    <select
      value={filterValue || ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">All dates</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function VideoTable({ videos }: { videos: Video[] }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'status', desc: false }, // Live first, then scheduled, then finished
    { id: 'scheduledTime', desc: true }
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Extract unique values for dropdowns
  const uniqueBodies = useMemo(() => 
    Array.from(new Set(videos.map(v => v.body).filter(Boolean) as string[])).sort(),
    [videos]
  );

  // Extract unique date labels for filtering
  const uniqueDates = useMemo(() => {
    const dateLabels = new Set<string>();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    videos.forEach(v => {
      const time = v.scheduledTime;
      if (!time) return;
      
      const date = new Date(time);
      const videoDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      if (videoDate.getTime() === tomorrow.getTime()) {
        dateLabels.add('Tomorrow');
      } else if (videoDate.getTime() === today.getTime()) {
        dateLabels.add('Today');
      } else if (videoDate.getTime() === yesterday.getTime()) {
        dateLabels.add('Yesterday');
      } else {
        dateLabels.add(date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        }));
      }
    });

    return Array.from(dateLabels);
  }, [videos]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('scheduledTime', {
        header: 'When',
        cell: (info) => {
          const time = info.getValue();
          if (!time) return new Date(info.row.original.date).toLocaleDateString();
          
          const date = new Date(time);
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const videoDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          
          let dateStr;
          if (videoDate.getTime() === tomorrow.getTime()) {
            dateStr = 'Tomorrow';
          } else if (videoDate.getTime() === today.getTime()) {
            dateStr = 'Today';
          } else if (videoDate.getTime() === yesterday.getTime()) {
            dateStr = 'Yesterday';
          } else {
            // For older dates, show weekday + date
            dateStr = date.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            });
          }
          
          const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          return `${dateStr} ${timeStr}`;
        },
        size: 160,
        enableColumnFilter: true,
        filterFn: (row, columnId, filterValue) => {
          const time = row.getValue(columnId) as string | null;
          if (!time) return false;
          
          const date = new Date(time);
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const videoDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          
          let dateStr;
          if (videoDate.getTime() === tomorrow.getTime()) {
            dateStr = 'Tomorrow';
          } else if (videoDate.getTime() === today.getTime()) {
            dateStr = 'Today';
          } else if (videoDate.getTime() === yesterday.getTime()) {
            dateStr = 'Yesterday';
          } else {
            dateStr = date.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            });
          }
          
          return dateStr === filterValue;
        },
        meta: {
          filterComponent: DateFilter,
          filterOptions: uniqueDates,
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const status = info.getValue();
          const styles = {
            finished: 'bg-gray-100 text-gray-700 border-gray-300',
            live: 'bg-red-50 text-red-700 border-red-300 font-semibold',
            scheduled: 'bg-blue-50 text-blue-700 border-blue-300',
          };
          const labels = {
            finished: 'Finished',
            live: '🔴 Live',
            scheduled: 'Scheduled',
          };
          return (
            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs border ${styles[status]}`}>
              {labels[status]}
            </span>
          );
        },
        size: 100,
        sortingFn: (rowA, rowB) => {
          // Custom sorting: live -> scheduled -> finished
          const order = { live: 0, scheduled: 1, finished: 2 };
          return order[rowA.original.status] - order[rowB.original.status];
        },
        enableColumnFilter: true,
        meta: {
          filterComponent: SelectFilter,
          filterOptions: ['live', 'scheduled', 'finished'],
        },
      }),
      columnHelper.accessor('cleanTitle', {
        header: 'Title',
        cell: (info) => (
          <a
            href={info.row.original.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {info.getValue()}
          </a>
        ),
        size: 400,
        enableColumnFilter: true,
        meta: {
          filterComponent: TextFilter,
        },
      }),
      columnHelper.accessor('body', {
        header: 'Body',
        cell: (info) => info.getValue() || '—',
        size: 140,
        enableColumnFilter: true,
        meta: {
          filterComponent: SelectFilter,
          filterOptions: uniqueBodies,
        },
      }),
    ],
    [uniqueBodies, uniqueDates]
  );

  const table = useReactTable({
    data: videos,
    columns,
    state: {
      columnFilters,
      sorting,
      globalFilter,
    },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  const hasFilters = globalFilter || columnFilters.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <input
          type="text"
          placeholder="Search all columns..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {hasFilters && (
          <button
            onClick={() => {
              setGlobalFilter('');
              setColumnFilters([]);
            }}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
          >
            Clear All Filters
          </button>
        )}
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {table.getFilteredRowModel().rows.length} of {videos.length} videos
        </div>
      </div>
      
      {columnFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {columnFilters.map((filter) => (
            <div key={filter.id} className="bg-muted px-3 py-1 rounded-full flex items-center gap-2">
              <span className="font-medium">{filter.id}:</span>
              <span>{String(filter.value)}</span>
              <button
                onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
                className="hover:text-primary"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <>
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/80"
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ width: header.getSize() }}
                      >
                        <div className="flex items-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: ' ↑',
                            desc: ' ↓',
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr key={`${headerGroup.id}-filter`} className="border-t">
                    {headerGroup.headers.map((header) => {
                      const FilterComponent = header.column.columnDef.meta?.filterComponent;
                      const filterOptions = header.column.columnDef.meta?.filterOptions;
                      
                      return (
                        <th key={header.id} className="px-4 py-2">
                          {header.column.getCanFilter() && FilterComponent ? (
                            <FilterComponent 
                              column={header.column} 
                              options={filterOptions || []} 
                            />
                          ) : null}
                        </th>
                      );
                    })}
                  </tr>
                </>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ««
          </button>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            «
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            »
          </button>
          <button
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            »»
          </button>
        </div>
        
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>

        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          className="px-3 py-1 border rounded"
        >
          {[25, 50, 100, 200].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

