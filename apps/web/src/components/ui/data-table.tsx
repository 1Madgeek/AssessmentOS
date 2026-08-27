"use client";

import * as React from "react";
import {
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  dataTableFeatures,
  type DataTableFeatures,
} from "@/components/ui/data-table-features";
import { cn } from "@/lib/utils";

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  ariaLabel: string;
  emptyMessage?: string;
  pageSize?: number;
  className?: string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  ariaLabel,
  emptyMessage = "No results.",
  pageSize = 10,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useTable(
    {
      features: dataTableFeatures,
      data,
      columns,
      state: { sorting },
      onSortingChange: setSorting,
      initialState: {
        pagination: { pageIndex: 0, pageSize },
      },
    },
    (state) => ({
      pagination: state.pagination,
      sorting: state.sorting,
    }),
  );

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-hidden rounded-none border border-border">
        <Table aria-label={ariaLabel}>
          <TableHeader>
            {table.getFlatHeaders().map((header) => (
              <TableHead
                key={header.id}
                id={header.id}
                isRowHeader={header.index === 0}
                className={cn(
                  header.column.getCanSort() && "cursor-pointer select-none",
                )}
                onClick={
                  header.column.getCanSort()
                    ? header.column.getToggleSortingHandler()
                    : undefined
                }
              >
                {header.isPlaceholder ? null : (
                  <div className="flex items-center gap-1.5">
                    <table.FlexRender header={header} />
                    {header.column.getCanSort() ? (
                      header.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="size-3.5 opacity-70" />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="size-3.5 opacity-70" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-40" />
                      )
                    ) : null}
                  </div>
                )}
              </TableHead>
            ))}
          </TableHeader>
          <TableBody
            renderEmptyState={() => (
              <div className="py-8 text-center text-muted-foreground">
                {emptyMessage}
              </div>
            )}
          >
            {rows.map((row) => (
              <TableRow key={row.id} id={String(row.id)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              isDisabled={!table.getCanPreviousPage()}
              onPress={() => table.previousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={!table.getCanNextPage()}
              onPress={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { createColumnHelper } from "@tanstack/react-table";
export type { ColumnDef } from "@tanstack/react-table";
export type { DataTableFeatures };
