import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";
import "./MenuRecord.css";


function authConfig() {
  const token = localStorage.getItem("token");

  return {
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {},
  };
}

function MenuRecord() {
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  // Fetch records from MySQL through Express.
  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get(
        `${API_URL}/records`,
        authConfig()
      );

      const data = response.data;

      const list = Array.isArray(data)
        ? data
        : data.records || data.transactions || [];

      setRecords(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("FETCH RECORDS ERROR:", err);
      console.error("SERVER RESPONSE:", err.response?.data);

      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to load borrowing records."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Format a database date without changing its calendar day.
  const formatDate = (value) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Convert a date into searchable text, including month names.
  const getDateSearchText = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value).toLowerCase();
    }

    const monthNames = [
      "January", "February", "March", "April",
      "May", "June", "July", "August",
      "September", "October", "November", "December",
    ];

    return [
      value,
      formatDate(value),
      monthNames[date.getMonth()],
      date.getFullYear(),
      `${String(date.getDate()).padStart(2, "0")}/${String(
        date.getMonth() + 1
      ).padStart(2, "0")}/${date.getFullYear()}`,
    ]
      .join(" ")
      .toLowerCase();
  };

  // Determine whether this borrowing transaction has been returned.
  const isReturned = (record) => {
    const value = String(record.return_date ?? "")
      .trim()
      .toLocaleLowerCase();

    return value !== "" && value !== "not returned" &&
      value !== "null" && value !== "undefined";
  };

  // Apply Returned / Not Return filter, search and sorting.
  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    return [...records]
      .filter((record) => {
        if (filterStatus === "returned") return isReturned(record);
        if (filterStatus === "not-returned") return !isReturned(record);
        return true;
      })
      .filter((record) => {
        if (!query) return true;

        const searchableText = [
          record.book_title,
          record.username,
          record.borrow_date,
          record.due_date,
          record.return_date,
          getDateSearchText(record.borrow_date),
          getDateSearchText(record.due_date),
          getDateSearchText(record.return_date),
        ]
          .map((value) => String(value ?? ""))
          .join(" ")
          .toLocaleLowerCase();

        return searchableText.includes(query);
      })
      .sort((a, b) => {
        const dateA = new Date(a.borrow_date).getTime() || 0;
        const dateB = new Date(b.borrow_date).getTime() || 0;

        if (dateA !== dateB) {
          return sortOrder === "desc"
            ? dateB - dateA
            : dateA - dateB;
        }

        return sortOrder === "desc"
          ? Number(b.borrow_id || 0) - Number(a.borrow_id || 0)
          : Number(a.borrow_id || 0) - Number(b.borrow_id || 0);
      });
  }, [records, searchQuery, sortOrder, filterStatus]);

  // Group the filtered records by borrowing month.
  const groupedRecords = useMemo(() => {
    const groups = new Map();

    filteredRecords.forEach((record) => {
      const date = record.borrow_date
        ? new Date(record.borrow_date)
        : null;

      const validDate =
        date && !Number.isNaN(date.getTime());

      const key = validDate
        ? `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`
        : "unknown";

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: validDate
            ? date.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })
            : "Unknown Date",
          records: [],
        });
      }

      groups.get(key).records.push(record);
    });

    // Keep month order fixed: newest month first, oldest month last.
    // sortOrder changes only the records inside each month.
    return [...groups.values()].sort((a, b) => {
      if (a.key === "unknown") return 1;
      if (b.key === "unknown") return -1;

      return b.key.localeCompare(a.key);
    });
  }, [filteredRecords]);

  const handleSearch = (event) => {
    event.preventDefault();
    setSearchQuery(searchTerm.trim());
  };

  const clearSearch = () => {
    setSearchTerm("");
    setSearchQuery("");
  };

  // Open the custom confirmation dialog before marking the book as returned.
  const handleMarkReturned = () => {
    if (!selectedRecord?.borrow_id || isReturned(selectedRecord) || returning) {
      return;
    }

    setReturnError("");
    setShowReturnConfirm(true);
  };

  // Update the borrowing record after the admin confirms the return.
  const handleConfirmReturn = async () => {
    if (!selectedRecord?.borrow_id || isReturned(selectedRecord) || returning) {
      return;
    }

    try {
      setReturning(true);
      setReturnError("");

      await axios.patch(
        `${API_URL}/records/${selectedRecord.borrow_id}/returned`,
        {},
        authConfig()
      );

      setShowReturnConfirm(false);
      setSelectedRecord(null);
      await fetchRecords();
    } catch (err) {
      console.error("MARK BOOK RETURNED ERROR:", err);
      setReturnError(
        err.response?.data?.message ||
          err.message ||
          "Unable to update the return status."
      );
      setShowReturnConfirm(false);
    } finally {
      setReturning(false);
    }
  };

  return (
    <main className="menu-record-page">
      {/* Header */}
      <header className="menu-record-header">
        <div>
          <p className="menu-record-eyebrow">
            LIBRARY MANAGEMENT
          </p>

          <h1>RECORDS MANAGEMENT</h1>

          <p className="menu-record-subtitle">
            Manage and review library borrowing records.
          </p>
        </div>
      </header>

      {/* Search */}
      <form
        className="record-search-form"
        onSubmit={handleSearch}
      >
        <span
          className="record-search-icon"
          aria-hidden="true"
        >
          ⌕
        </span>

        <input
          className="record-search-input"
          type="text"
          value={searchTerm}
          onChange={(event) =>
            setSearchTerm(event.target.value)
          }
          placeholder="Search book title, username, date or month..."
          aria-label="Search borrowing records"
        />

        <button
          className="record-search-button"
          type="submit"
        >
          SEARCH
        </button>

        {(searchTerm || searchQuery) && (
          <button
            className="record-clear-button"
            type="button"
            onClick={clearSearch}
          >
            CLEAR
          </button>
        )}
      </form>

      {/* List heading and controls */}
      <div className="record-list-heading">
        <div>
          <h2>Records List</h2>
          <p>
            {filteredRecords.length}{" "}
            {filteredRecords.length === 1
              ? "record"
              : "records"}{" "}
            found
          </p>
        </div>

        <div className="record-list-controls">
          <div className="record-filter-wrap">
            <button
              type="button"
              className="record-filter-button"
              onClick={() => setFilterOpen((open) => !open)}
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
              FILTER <span aria-hidden="true">▾</span>
            </button>

            {filterOpen && (
              <div className="record-filter-menu" role="menu">
                <button
                  type="button"
                  className={filterStatus === "all" ? "active" : ""}
                  onClick={() => {
                    setFilterStatus("all");
                    setFilterOpen(false);
                  }}
                  role="menuitem"
                >
                  All Records
                </button>
                <button
                  type="button"
                  className={filterStatus === "returned" ? "active" : ""}
                  onClick={() => {
                    setFilterStatus("returned");
                    setFilterOpen(false);
                  }}
                  role="menuitem"
                >
                  Returned
                </button>
                <button
                  type="button"
                  className={filterStatus === "not-returned" ? "active" : ""}
                  onClick={() => {
                    setFilterStatus("not-returned");
                    setFilterOpen(false);
                  }}
                  role="menuitem"
                >
                  Not Return
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="record-sort-button"
            onClick={() =>
              setSortOrder((current) =>
                current === "desc" ? "asc" : "desc"
              )
            }
            title={
              sortOrder === "desc"
                ? "Oldest records first"
                : "Newest records first"
            }
            aria-label="Change record sorting order"
          >
            {sortOrder === "desc" ? "↓↑" : "↑↓"}
          </button>

          <button
            type="button"
            className="record-back-button"
            onClick={() => navigate("/menu")}
          >
            <span aria-hidden="true">←</span>
            BACK
          </button>
        </div>
      </div>

      {/* Loading and errors */}
      {loading && (
        <div className="record-empty-state">
          Loading borrowing records...
        </div>
      )}

      {!loading && error && (
        <div className="record-alert" role="alert">
          <span>{error}</span>

          <button type="button" onClick={fetchRecords}>
            RETRY
          </button>
        </div>
      )}

      {/* Records grouped by month */}
      {!loading && !error && (
        <section className="record-month-list">
          {groupedRecords.length === 0 ? (
            <div className="record-empty-state">
              <div
                className="record-empty-icon"
                aria-hidden="true"
              >
                ▤
              </div>

              <h3>No records found</h3>

              <p>
                {searchQuery
                  ? "No records match your search. Check the spelling or try another keyword."
                  : filterStatus === "returned"
                    ? "No returned records are available."
                    : filterStatus === "not-returned"
                      ? "No books are currently awaiting return."
                      : "No borrowing records are available in the database."}
              </p>
            </div>
          ) : (
            groupedRecords.map((group) => (
              <section
                className="record-month-group"
                key={group.key}
              >
                <div className="record-month-bar">
                  <span>{group.label}</span>

                  <span className="record-month-count">
                    {group.records.length}{" "}
                    {group.records.length === 1
                      ? "record"
                      : "records"}
                  </span>
                </div>

                <div className="record-month-content">
                  {group.records.map((record, index) => (
                    <article
                      className="record-item"
                      key={
                        record.borrow_id ??
                        `${group.key}-${index}`
                      }
                    >
                      <div className="record-item-details">
                        <div className="record-book-title">
                          {record.book_title || "-"}
                        </div>

                        <div className="record-user">
                          {record.deleted_user ? "Deleted User" : (record.username || "-")}
                        </div>
                      </div>

                      <div className="record-item-dates">
                        <div className="record-date-field">
                          <span>Borrow Date</span>

                          <strong>
                            {formatDate(record.borrow_date)}
                          </strong>
                        </div>

                        <div className="record-date-field">
                          <span>Due Date</span>
                          <strong className="record-due-date">
                            {formatDate(record.due_date)}
                          </strong>
                        </div>

                        <div className="record-date-field">
                          <span>Return Date</span>

                          <strong
                            className={
                              isReturned(record)
                                ? "record-returned"
                                : "record-pending"
                            }
                          >
                            {isReturned(record)
                              ? formatDate(record.return_date)
                              : "Not returned"}
                          </strong>
                        </div>
                      </div>

                      {/* Details button at far right */}
                      <button
                        type="button"
                        className="record-details-button"
                        onClick={() =>
                          setSelectedRecord(record)
                        }
                      >
                        DETAILS
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </section>
      )}

      {/* Details notification popup */}
      {selectedRecord && (
        <div
          className="record-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedRecord(null);
            }
          }}
        >
          <section
            className="record-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-modal-title"
          >
            <div className="record-modal-header">
              <div>
                <p className="menu-record-eyebrow">
                  LIBRARY MANAGEMENT
                </p>

                <h2 id="record-modal-title">
                  RECORD DETAILS
                </h2>
              </div>

              <button
                type="button"
                className="record-modal-close"
                onClick={() => setSelectedRecord(null)}
                aria-label="Close details"
              >
                ×
              </button>
            </div>

            <div className="record-modal-body">
              <div className="record-detail-row">
                <span>Book Title</span>
                <strong>
                  {selectedRecord.book_title || "-"}
                </strong>
              </div>

              <div className="record-detail-row">
                <span>Book Author</span>
                <strong>
                  {selectedRecord.author || "-"}
                </strong>
              </div>

              <div className="record-detail-row">
                <span>ISBN</span>
                <strong>{selectedRecord.book_isbn || "-"}</strong>
              </div>

              <div className="record-detail-row">
                <span>Call Number</span>
                <strong>{selectedRecord.book_call_number || "-"}</strong>
              </div>

              <div className="record-detail-row">
                <span>Username</span>
                <strong>
                  {selectedRecord.deleted_user ? "Deleted User" : (selectedRecord.username || "-")}
                </strong>
              </div>

              <div className="record-detail-row">
                <span>Matric Number</span>
                <strong>
                  {selectedRecord.matric_number || "-"}
                </strong>
              </div>

              <div className="record-detail-row">
                <span>Fine</span>
                <strong>
                  RM{" "}
                  {Number(selectedRecord.fine || 0).toFixed(2)}
                </strong>
              </div>

              <div className="record-detail-row">
                <span>Payment Status</span>
                <strong
                  className="record-payment-status"
                >
                  {selectedRecord.payment_status || "Not available"}
                </strong>
              </div>
            </div>

            {returnError && (
              <div className="record-alert" role="alert">
                {returnError}
              </div>
            )}

            {!isReturned(selectedRecord) && (
              <button
                type="button"
                className="record-modal-done"
                onClick={handleMarkReturned}
                disabled={returning}
              >
                {returning ? "UPDATING..." : "RETURNED"}
              </button>
            )}

            <button
              type="button"
              className="record-modal-done"
              onClick={() => {
                setReturnError("");
                setShowReturnConfirm(false);
                setSelectedRecord(null);
              }}
            >
              CLOSE
            </button>
          </section>
        </div>
      )}

      {/* Custom confirmation popup for marking a book as returned */}
      {showReturnConfirm && selectedRecord && (
        <div
          className="record-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !returning) {
              setShowReturnConfirm(false);
            }
          }}
        >
          <section
            className="record-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="record-confirm-title"
            aria-describedby="record-confirm-message"
          >
            <div className="record-confirm-icon" aria-hidden="true">
              ✓
            </div>

            <p className="record-confirm-eyebrow">
              LIBRARY MANAGEMENT
            </p>

            <h2 id="record-confirm-title">
              CONFIRM BOOK RETURN
            </h2>

            <p
              className="record-confirm-message"
              id="record-confirm-message"
            >
              Are you sure you want to mark this book as returned?
            </p>

            <div className="record-confirm-book">
              <span>BOOK TITLE</span>
              <strong>
                {selectedRecord.book_title || "Untitled book"}
              </strong>
            </div>

            <div className="record-confirm-actions">
              <button
                type="button"
                className="record-confirm-cancel"
                onClick={() => setShowReturnConfirm(false)}
                disabled={returning}
              >
                CANCEL
              </button>

              <button
                type="button"
                className="record-confirm-accept"
                onClick={handleConfirmReturn}
                disabled={returning}
              >
                {returning ? "UPDATING..." : "YES, RETURN BOOK"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default MenuRecord;
