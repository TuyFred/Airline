import React, { useEffect, useMemo, useState } from 'react';

/**
 * Reusable pagination utilities.
 *
 * - usePagination: returns the slice of `items` for the current page plus
 *   helpers to navigate.
 * - Pagination: a presentational component that renders the navigation
 *   controls (Prev / page numbers / Next) and a small status line.
 *
 * Default page size is 5 items, which is the project-wide standard.
 */

export function usePagination(items, pageSize = 5) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [page, setPage] = useState(1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [totalPages, page]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  return {
    page,
    setPage,
    totalPages,
    total,
    pageSize,
    pagedItems,
    rangeStart: total === 0 ? 0 : (page - 1) * pageSize + 1,
    rangeEnd: Math.min(total, page * pageSize)
  };
}

function buildPageNumbers(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const result = [];
  let prev = 0;
  Array.from(pages)
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b)
    .forEach((n) => {
      if (n - prev > 1) result.push('…');
      result.push(n);
      prev = n;
    });
  return result;
}

/**
 * PaginatedList: renders a paginated body using its own internal hook.
 * Useful inside .map() loops where you cannot call hooks per-iteration.
 *
 *   <PaginatedList items={rows} pageSize={5} label="bookings">
 *     {(paged) => paged.map((row) => <Row key={row.id} row={row} />)}
 *   </PaginatedList>
 */
export function PaginatedList({ items, pageSize = 5, label = 'items', children, compact, emptyState = null }) {
  const pager = usePagination(items, pageSize);
  if (!pager.total) return emptyState;
  return (
    <>
      {children(pager.pagedItems, pager)}
      <Pagination {...pager} label={label} compact={compact} />
    </>
  );
}

export default function Pagination({
  page,
  setPage,
  totalPages,
  total,
  rangeStart,
  rangeEnd,
  label = 'items',
  compact = false
}) {
  if (!totalPages || totalPages <= 1) {
    if (!total) return null;
    return (
      <div className="pagination-bar pagination-only-info">
        <span className="pagination-info">
          {total} {label}
        </span>
      </div>
    );
  }

  const numbers = buildPageNumbers(page, totalPages);

  return (
    <div className={`pagination-bar${compact ? ' pagination-compact' : ''}`}>
      <span className="pagination-info">
        {rangeStart}–{rangeEnd} of {total} {label}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          ‹ Prev
        </button>
        {numbers.map((n, idx) => (
          n === '…' ? (
            <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
          ) : (
            <button
              key={`page-${n}`}
              type="button"
              className={`pagination-btn pagination-page${n === page ? ' active' : ''}`}
              onClick={() => setPage(n)}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          )
        ))}
        <button
          type="button"
          className="pagination-btn"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
