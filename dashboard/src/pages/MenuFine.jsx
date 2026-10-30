import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";
import "./MenuFine.css";


function authConfig() {
  const token = localStorage.getItem("token");

  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

function MenuFine() {
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFine, setSelectedFine] = useState(null);
  const [paymentConfirm, setPaymentConfirm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payingId, setPayingId] = useState(null);
  const [notice, setNotice] = useState("");

  const fetchFines = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get(`${API_URL}/records`, authConfig());
      const data = response.data;
      const list = Array.isArray(data)
        ? data
        : data.records || data.transactions || [];

      setRecords(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("FETCH FINES ERROR:", err);
      console.error("SERVER RESPONSE:", err.response?.data);
      setError(
        err.response?.data?.message ||
          "Unable to load fine records from database."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFines();
  }, [fetchFines]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (paymentConfirm && payingId === null) {
          setPaymentConfirm(null);
        } else if (selectedFine) {
          setSelectedFine(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paymentConfirm, selectedFine, payingId]);

  const formatDate = (value) => {
    if (
      !value ||
      ["null", "undefined", "not returned"].includes(
        String(value).trim().toLowerCase()
      )
    ) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatMoney = (value) => `RM ${Number(value || 0).toFixed(2)}`;

  const isPaid = (record) =>
    String(record?.payment_status || "").trim().toLowerCase() === "paid";

  const filteredFines = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return records
      .filter((record) => Number(record.late_days) > 0)
      .filter((record) => {
        // Only show outstanding fines. Paid records disappear from this list.
        const paymentStatus = String(record.payment_status ?? "")
          .trim()
          .toLowerCase()
          .replace(/[_-]+/g, " ");

        return paymentStatus === "not pay";
      })
      .filter((record) => {
        if (!query) return true;

        return [
          record.username,
          record.matric_number,
          record.book_title,
          record.book_call_number,
          record.borrow_date,
          record.due_date,
          record.return_date,
          record.late_days,
          record.fine,
          record.payment_status,
        ]
          .map((value) => String(value ?? ""))
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(
        (a, b) =>
          Number(b.late_days || 0) - Number(a.late_days || 0)
      );
  }, [records, searchQuery]);

  const handleSearch = (event) => {
    event.preventDefault();
    setSearchQuery(searchTerm.trim());
  };

  const clearSearch = () => {
    setSearchTerm("");
    setSearchQuery("");
  };

  const handleMarkPaid = (record) => {
    if (isPaid(record) || payingId !== null) return;
    setPaymentConfirm(record);
  };

  const confirmMarkPaid = async () => {
    const record = paymentConfirm;
    if (!record || payingId !== null) return;

    try {
      setPayingId(record.borrow_id);
      setError("");
      setNotice("");

      await axios.patch(
        `${API_URL}/fines/${record.borrow_id}/paid`,
        {},
        authConfig()
      );

      const updatedRecord = { ...record, payment_status: "paid" };

      setRecords((previous) =>
        previous.map((item) =>
          String(item.borrow_id) === String(record.borrow_id)
            ? { ...item, payment_status: "paid" }
            : item
        )
      );

      setSelectedFine((previous) =>
        previous &&
        String(previous.borrow_id) === String(record.borrow_id)
          ? { ...previous, payment_status: "paid" }
          : previous
      );

      setPaymentConfirm(null);
      setNotice(
        `Payment recorded successfully for ${updatedRecord.username || "this user"}.`
      );
    } catch (err) {
      console.error("UPDATE PAYMENT ERROR:", err);
      setError(
        err.response?.data?.message ||
          "Unable to update payment status."
      );
      setPaymentConfirm(null);
    } finally {
      setPayingId(null);
    }
  };

  return (
    <main className="menu-fine-page">
      <header className="menu-fine-header">
        <div>
          <p className="menu-fine-eyebrow">LIBRARY MANAGEMENT</p>
          <h1>FINE MANAGEMENT</h1>
          <p className="menu-fine-subtitle">
            Manage overdue book fines and payment status.
          </p>
        </div>
      </header>

      <form className="fine-search-form" onSubmit={handleSearch}>
        <span className="fine-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="fine-search-input"
          type="text"
          value={searchTerm}
          onChange={(event) => {
            const value = event.target.value;
            setSearchTerm(value);
            // Update the filter as the user types, matching MenuRecord's
            // case-insensitive partial-text search behaviour.
            setSearchQuery(value.trim());
          }}
          placeholder="Search username, book title or matric number..."
          aria-label="Search fine records"
        />
        <button className="fine-search-button" type="submit">
          SEARCH
        </button>
        {(searchTerm || searchQuery) && (
          <button
            className="fine-clear-button"
            type="button"
            onClick={clearSearch}
          >
            CLEAR
          </button>
        )}
      </form>

      <div className="fine-list-heading">
        <div>
          <h2>Fine List</h2>
          <p>
            {filteredFines.length}{" "}
            {filteredFines.length === 1 ? "record" : "records"} with late
            days greater than zero
          </p>
        </div>
        <button
          type="button"
          className="fine-back-button"
          onClick={() => navigate("/menu")}
        >
          <span aria-hidden="true">←</span> BACK
        </button>
      </div>

      {notice && (
        <div className="fine-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {loading && (
        <div className="fine-empty-state">Loading fine records...</div>
      )}

      {!loading && error && (
        <div className="fine-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={fetchFines}>
            RETRY
          </button>
        </div>
      )}

      {!loading && !error && (
        <section className="fine-list">
          {filteredFines.length === 0 ? (
            <div className="fine-empty-state">
              <div className="fine-empty-icon" aria-hidden="true">
                ✓
              </div>
              <h3>No fine records found</h3>
              <p>
                No borrowing records with late days greater than zero match
                your search.
              </p>
            </div>
          ) : (
            filteredFines.map((record) => (
              <article className="fine-item" key={record.borrow_id}>
                <div className="fine-item-main">
                  <div className="fine-book-title">
                    {record.book_title || "-"}
                  </div>
                  <div className="fine-username">
                    {record.username || "-"}
                  </div>
                </div>

                <div className="fine-item-data">
                  <div className="fine-data-field">
                    <span>Late Days</span>
                    <strong>{record.late_days}</strong>
                  </div>
                  <div className="fine-data-field">
                    <span>Fine Amount</span>
                    <strong className="fine-amount">
                      {formatMoney(record.fine)}
                    </strong>
                  </div>
                </div>

                <div className="fine-item-actions">
                  <button
                    type="button"
                    className="fine-details-button"
                    onClick={() => setSelectedFine(record)}
                  >
                    DETAILS
                  </button>
                  <button
                    type="button"
                    className={`fine-paid-button ${
                      isPaid(record) ? "is-paid" : ""
                    }`}
                    disabled={isPaid(record) || payingId === record.borrow_id}
                    onClick={() => handleMarkPaid(record)}
                  >
                    {payingId === record.borrow_id
                      ? "SAVING..."
                      : isPaid(record)
                        ? "PAID"
                        : "PAID"}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {selectedFine && (
        <div
          className="fine-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedFine(null);
            }
          }}
        >
          <section
            className="fine-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fine-modal-title"
          >
            <div className="fine-modal-header">
              <div>
                <p className="menu-fine-eyebrow">LIBRARY MANAGEMENT</p>
                <h2 id="fine-modal-title">FINE DETAILS</h2>
              </div>
              <button
                type="button"
                className="fine-modal-close"
                onClick={() => setSelectedFine(null)}
                aria-label="Close fine details"
              >
                ×
              </button>
            </div>

            <div className="fine-modal-body">
              <div className="fine-detail-row">
                <span>Username</span>
                <strong>{selectedFine.username || "-"}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Matric Number</span>
                <strong>{selectedFine.matric_number || "-"}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Book Title</span>
                <strong>{selectedFine.book_title || "-"}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Book Call Number</span>
                <strong>{selectedFine.book_call_number || "-"}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Borrow Date</span>
                <strong>{formatDate(selectedFine.borrow_date)}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Due Date</span>
                <strong>{formatDate(selectedFine.due_date)}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Return Date</span>
                <strong>{formatDate(selectedFine.return_date)}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Late Days</span>
                <strong>{selectedFine.late_days}</strong>
              </div>
              <div className="fine-detail-row">
                <span>Fine Amount</span>
                <strong className="fine-detail-amount">
                  {formatMoney(selectedFine.fine)}
                </strong>
              </div>
              <div className="fine-detail-row">
                <span>Payment Status</span>
                <strong
                  className={
                    isPaid(selectedFine)
                      ? "fine-status-paid"
                      : "fine-status-unpaid"
                  }
                >
                  {isPaid(selectedFine) ? "Paid" : "Not Paid"}
                </strong>
              </div>
            </div>

            <div className="fine-modal-actions">
              <button
                type="button"
                className="fine-modal-done"
                onClick={() => setSelectedFine(null)}
              >
                CLOSE
              </button>
              <button
                type="button"
                className="fine-paid-button"
                disabled={
                  isPaid(selectedFine) ||
                  payingId === selectedFine.borrow_id
                }
                onClick={() => handleMarkPaid(selectedFine)}
              >
                {isPaid(selectedFine) ? "PAID" : "MARK AS PAID"}
              </button>
            </div>
          </section>
        </div>
      )}

      {paymentConfirm && (
        <div
          className="fine-confirm-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              payingId === null
            ) {
              setPaymentConfirm(null);
            }
          }}
        >
          <section
            className="fine-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fine-confirm-title"
          >
            <div className="fine-confirm-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M3 10h18M7 15h4" />
              </svg>
            </div>

            <h2 id="fine-confirm-title">Confirm Payment</h2>
            <p className="fine-confirm-message">
              Are you sure you have received payment from{" "}
              <strong>{paymentConfirm.username || "-"}</strong>?
            </p>

            <div className="fine-confirm-summary">
              <div>
                <span>Book Title</span>
                <strong>{paymentConfirm.book_title || "-"}</strong>
              </div>
              <div>
                <span>Fine Amount</span>
                <strong className="fine-confirm-amount">
                  {formatMoney(paymentConfirm.fine)}
                </strong>
              </div>
            </div>

            <p className="fine-confirm-warning">
              This will mark the fine as paid.
            </p>

            <div className="fine-confirm-actions">
              <button
                type="button"
                className="fine-confirm-cancel"
                onClick={() => setPaymentConfirm(null)}
                disabled={payingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fine-confirm-submit"
                onClick={confirmMarkPaid}
                disabled={payingId !== null}
              >
                {payingId !== null ? "Processing..." : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default MenuFine;
