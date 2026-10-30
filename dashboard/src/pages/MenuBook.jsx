import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";
import "./MenuBook.css";

const PROGRAMS = ["-", "DNK", "DSK", "DSJ", "DTA", "DLA", "UTU", "STP"];

const EMPTY_FORM = {
  uid: "",
  title: "",
  author: "",
  publisher: "",
  published: "",
  call_number: "",
  isbn: "-",
  edition: "-",
  page_count: "",
  program: "-",
  synopsis: "",
  figure: "",
  status: "returned",
};

function authConfig() {
  const token = localStorage.getItem("token");
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

function MenuBook() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const lastScannedUidRef = useRef("");
  const [scanNotification, setScanNotification] = useState("");

  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [bookToEdit, setBookToEdit] = useState(null);
  const [bookToDelete, setBookToDelete] = useState(null);
  const [bookToDetail, setBookToDetail] = useState(null);
  const [scannedUid, setScannedUid] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ==========================================
  // LOAD BOOKS
  // ==========================================
  const fetchBooks = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get(
        `${API_URL}/books`,
        authConfig()
      );

      const data = response.data;

      setBooks(
        Array.isArray(data)
          ? data
          : Array.isArray(data.books)
            ? data.books
            : []
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to load books from database."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // ==========================================
  // RFID SCAN MODE + MINI NOTIFICATION
  // ==========================================
  useEffect(() => {
    let alive = true;
    let notificationTimer;
    let interval = null;
    let polling = false;

    const config = authConfig();
    const pollBookScan = async () => {
      if (polling) return;
      polling = true;
      try {
        const { data } = await axios.get(
          `${API_URL}/books/scan-mode?_t=${Date.now()}`,
          {
            ...config,
            headers: {
              ...config.headers,
              "Cache-Control": "no-cache",
              "Pragma": "no-cache"
            }
          }
        );
        if (!alive) return;
        const uid = String(data?.pendingUid || "").trim().toUpperCase();
        const scanStatus = String(data?.scanStatus || "idle");
        if (!uid || uid === lastScannedUidRef.current) return;
        lastScannedUidRef.current = uid;
        setScannedUid(uid);
        setSearchTerm("");
        setSearchQuery("");
        setError("");
        setSuccess("");
        if (scanStatus === "exists") {
          await fetchBooks();
          if (!alive) return;
          setScanNotification(`Book UID ${uid} found. The list is filtered to this UID.`);
        } else {
          setForm({ ...EMPTY_FORM, uid });
          setBookToEdit(null);
          setScanNotification(`Unknown book detected: ${uid}. Add Book form opened.`);
          setIsAddOpen(true);
        }
        clearTimeout(notificationTimer);
        notificationTimer = window.setTimeout(() => { if (alive) setScanNotification(""); }, 4500);
      } catch (err) {
        if (alive) console.error("Book scan polling error:", err.response?.data || err.message);
      } finally {
        polling = false;
      }
    };

    const enableBookScan = async () => {
      try {
        const { data } = await axios.post(`${API_URL}/books/scan-mode`, { active: true }, config);
        if (!alive) return;
        if (data?.active !== true) {
          setError("Backend did not activate book RFID scan mode.");
          return;
        }
        await pollBookScan();
        if (alive) interval = window.setInterval(pollBookScan, 700);
      } catch (err) {
        if (alive) setError(err.response?.data?.message || "Unable to activate book RFID scan mode. Check backend and login token.");
      }
    };

    enableBookScan();
    return () => {
      alive = false;
      if (interval !== null) window.clearInterval(interval);
      clearTimeout(notificationTimer);
      axios.post(`${API_URL}/books/scan-mode`, { active: false }, config).catch(() => {});
      axios.post(`${API_URL}/books/scan-cancel`, {}, config).catch(() => {});
    };
  }, [fetchBooks]);

  // ==========================================
  // SEARCH AND SORT BOOKS
  // ==========================================
  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return [...books]
      .filter((book) => {
        const uid = String(book.uid ?? "").replace(/\s+/g, "").trim().toUpperCase();

        if (scannedUid && uid !== scannedUid) return false;
        if (!query) return true;

        return [
          book.title,
          book.author,
          book.call_number,
          book.isbn,
          book.publisher,
          book.uid,
        ].some((field) =>
          String(field ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) =>
        String(a.title ?? "").localeCompare(
          String(b.title ?? ""),
          "en",
          { sensitivity: "base" }
        )
      );
  }, [books, searchQuery, scannedUid]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchTerm);
  };

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  // ==========================================
  // FORM INPUT
  // ==========================================
  const handleFormChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ==========================================
  // COMPRESS BOOK COVER IMAGE
  // ==========================================
  const compressImage = (
    source,
    maxDimension = 1000,
    quality = 0.72
  ) =>
    new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        try {
          const scale = Math.min(
            1,
            maxDimension /
              Math.max(
                image.naturalWidth,
                image.naturalHeight
              )
          );

          const canvas = document.createElement("canvas");

          canvas.width = Math.max(
            1,
            Math.round(image.naturalWidth * scale)
          );

          canvas.height = Math.max(
            1,
            Math.round(image.naturalHeight * scale)
          );

          const context = canvas.getContext("2d");

          if (!context) {
            reject(
              new Error("Unable to process this image.")
            );
            return;
          }

          context.fillStyle = "#ffffff";
          context.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
          );

          context.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
          );

          const compressed = canvas.toDataURL(
            "image/jpeg",
            quality
          );

          if (
            compressed.length > 1000000 &&
            quality > 0.4
          ) {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(
                    new Error("Unable to compress this image.")
                  );
                  return;
                }

                const reader = new FileReader();

                reader.onload = () =>
                  resolve(String(reader.result || ""));

                reader.onerror = () =>
                  reject(
                    new Error("Unable to read compressed image.")
                  );

                reader.readAsDataURL(blob);
              },
              "image/jpeg",
              0.45
            );

            return;
          }

          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      };

      image.onerror = () =>
        reject(
          new Error("The selected file is not a readable image.")
        );

      image.src = source;
    });

  // ==========================================
  // HANDLE BOOK COVER UPLOAD
  // ==========================================
  const handleFigureChange = async (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(
        "Image must be 10 MB or smaller before compression."
      );
      e.target.value = "";
      return;
    }

    try {
      setError("");

      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () =>
          resolve(String(reader.result || ""));

        reader.onerror = () =>
          reject(
            new Error("Unable to read the selected image.")
          );

        reader.readAsDataURL(file);
      });

      const compressed = await compressImage(source);

      if (compressed.length > 1000000) {
        setError(
          "Image is still too large after compression. Please choose another image."
        );

        e.target.value = "";
        return;
      }

      setForm((previous) => ({
        ...previous,
        figure: compressed,
      }));
    } catch (err) {
      setError(
        err.message ||
        "Unable to process the selected image."
      );

      e.target.value = "";
    }
  };

  // ==========================================
  // OPEN ADD BOOK MODAL MANUALLY
  // ==========================================
  const openAddPopup = () => {
    setScannedUid("");
    resetMessages();
    setBookToEdit(null);
    setForm({ ...EMPTY_FORM });
    setIsAddOpen(true);
  };

  // ==========================================
  // OPEN EDIT BOOK MODAL
  // ==========================================
  const openEditPopup = (book) => {
    resetMessages();
    setIsAddOpen(false);
    setBookToEdit(book);

    setForm({
      uid: book.uid ?? "",
      title: book.title ?? "",
      author: book.author ?? "",
      publisher: book.publisher ?? "",
      published: book.published ?? "",
      call_number: book.call_number ?? "",
      isbn: book.isbn ?? "-",
      edition: book.edition ?? "-",
      page_count: String(book.page_count ?? ""),
      program: book.program ?? "-",
      status: book.status ?? "returned",
      synopsis: book.synopsis ?? "",
      figure: book.figure ?? "",
    });
  };

  // ==========================================
  // CLOSE ADD/EDIT MODAL
  // ==========================================
  const closePopup = (force = false) => {
    if (isSaving && !force) return;

    const scannedUID = !bookToEdit ? form.uid : "";
    setIsAddOpen(false);
    setBookToEdit(null);
    setForm({ ...EMPTY_FORM });

    if (scannedUID) {
      // If the Add Book popup was opened for an unknown scanned UID,
      // clear the UID filter on cancel so the full book list is shown again.
      setScannedUid("");
      setScanNotification("");
      lastScannedUidRef.current = "";
      axios.post(`${API_URL}/books/scan-cancel`, {}, authConfig()).catch(() => {});
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ==========================================
  // ADD OR UPDATE BOOK
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSaving) return;

    const token = localStorage.getItem("token");

    if (!token) {
      setError("Login token not found. Please log in again.");
      return;
    }

    let figure = form.figure || null;

    try {
      if (
        figure &&
        figure.startsWith("data:image/")
      ) {
        figure = await compressImage(
          figure,
          1000,
          0.68
        );
      }
    } catch (imageError) {
      setError(
        imageError.message ||
        "Unable to process the book image."
      );
      return;
    }

    if (figure && figure.length > 1000000) {
      setError(
        "Book image is too large after compression. Please choose another image."
      );
      return;
    }

    const payload = {
      uid: bookToEdit
        ? bookToEdit.uid
        : form.uid.trim(),

      title: form.title.trim(),
      author: form.author.trim(),
      publisher: form.publisher.trim(),
      published: form.published.trim(),
      call_number: form.call_number.trim(),
      isbn: form.isbn.trim() || "-",
      edition: form.edition.trim() || "-",
      page_count: Number(form.page_count),

      program:
        form.program === "-"
          ? "-"
          : form.program,

      status: form.status,
      synopsis: form.synopsis.trim(),
      figure,
    };

    if (
      !payload.uid ||
      !payload.title ||
      !payload.author ||
      !payload.publisher ||
      !payload.published ||
      !payload.call_number ||
      !Number.isInteger(payload.page_count) ||
      payload.page_count < 1 ||
      !payload.program ||
      !payload.status ||
      !payload.synopsis
    ) {
      setError(
        "Scan a new RFID UID and complete all required book fields."
      );
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setSuccess("");

      if (bookToEdit) {
        await axios.put(
          `${API_URL}/books/${bookToEdit.book_id}`,
          payload,
          authConfig()
        );

        setSuccess("Book updated successfully.");
      } else {
        await axios.post(
          `${API_URL}/books`,
          payload,
          authConfig()
        );

        setSuccess("Book added successfully.");
      }

      closePopup(true);
      await fetchBooks();
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to save book details."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // DELETE BOOK
  // ==========================================
  const confirmDelete = async () => {
    if (!bookToDelete || isDeleting) return;

    try {
      setIsDeleting(true);
      setError("");

      await axios.delete(
        `${API_URL}/books/${bookToDelete.book_id}`,
        authConfig()
      );

      setBooks((previous) =>
        previous.filter(
          (book) =>
            book.book_id !== bookToDelete.book_id
        )
      );

      setSuccess("Book deleted successfully.");
      setBookToDelete(null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to delete book."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // ==========================================
  // RENDER MENU BOOK
  // ==========================================
  return (
    <div className="menu-book-page">

      <header className="menu-book-header">
        <div>
          <p className="menu-book-eyebrow">
            LIBRARY MANAGEMENT
          </p>

          <h1>BOOK MANAGEMENT</h1>

          <p className="menu-book-subtitle">
            Manage book details and book cover images.
          </p>
        </div>
      </header>

      <form
        className="book-search-form"
        onSubmit={handleSearch}
      >
        <div
          className="book-search-icon"
          aria-hidden="true"
        >
          ⌕
        </div>

        <input
          className="book-search-input"
          value={searchTerm}
          onChange={(e) =>
            setSearchTerm(e.target.value)
          }
          placeholder="Search book title, author or call number..."
          aria-label="Search book title, author or call number"
        />

        <button
          className="book-search-button"
          type="submit"
        >
          SEARCH
        </button>

        {searchQuery && (
          <button
            type="button"
            className="book-clear-button"
            onClick={() => {
              setSearchTerm("");
              setSearchQuery("");
            }}
          >
            CLEAR
          </button>
        )}
      </form>

      <div
        className="book-scan-notice"
        role="note"
      >
        <span
          className="book-scan-notice-icon"
          aria-hidden="true"
        >
          ⌁
        </span>

        <span>Scan book to add new book</span>
      </div>

      {error && (
        <div
          className="book-alert book-alert-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {(!scannedUid || filteredBooks.length > 0) && (
        <>
      <div className="book-list-heading">
        <div>
          <h2>Book List</h2>

          <p>
            {filteredBooks.length}{" "}
            {filteredBooks.length === 1 ? "book" : "books"} found
            {scannedUid ? ` for UID ${scannedUid}` : ""}
          </p>
          {scannedUid && (
            <button
              type="button"
              className="book-clear-scan-filter"
              onClick={() => {
                setScannedUid("");
                setScanNotification("");
                lastScannedUidRef.current = "";
                axios.post(`${API_URL}/books/scan-cancel`, {}, authConfig()).catch(() => {});
              }}
            >
              CLEAR UID FILTER
            </button>
          )}
        </div>

        <button
          type="button"
          className="book-back-button book-list-back-button"
          onClick={() => navigate("/menu")}
        >
          <span aria-hidden="true">←</span> BACK
        </button>
      </div>

      <section
        className="book-list"
        aria-live="polite"
      >
        {loading ? (
          <div className="book-empty-state">
            Loading books...
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="book-empty-state">
            <div
              className="book-empty-icon"
              aria-hidden="true"
            >
              ▤
            </div>

            <h3>No books found</h3>

            <p>
              {searchQuery
                ? "Try another title, author or call number."
                : "Add a book to get started."}
            </p>
          </div>
        ) : (
          filteredBooks.map((book) => (
            <article
              className="book-row"
              key={book.book_id}
            >
              <div className="book-figure-wrap">
                {book.figure ? (
                  <img
                    className="book-figure"
                    src={book.figure}
                    alt={`Cover of ${book.title}`}
                  />
                ) : (
                  <div
                    className="book-figure-placeholder"
                    aria-label="No book image"
                  >
                    <span aria-hidden="true">▤</span>
                    <small>NO IMAGE</small>
                  </div>
                )}
              </div>

              <div className="book-information">
                <div className="book-title-line">
                  <h3>
                    {book.title || "Untitled Book"}
                  </h3>

                  <span
                    className={`book-status ${
                      String(book.status).toLowerCase() ===
                      "borrowed"
                        ? "is-borrowed"
                        : "is-available"
                    }`}
                  >
                    {String(book.status).toLowerCase() ===
                    "borrowed"
                      ? "BORROWED"
                      : "AVAILABLE"}
                  </span>
                </div>

                <div className="book-information-details">
                  <p>
                    <span>Author</span>
                    <strong>{book.author || "-"}</strong>
                  </p>

                  <p>
                    <span>Call Number</span>
                    <strong>{book.call_number || "-"}</strong>
                  </p>

                  <p>
                    <span>ISBN</span>
                    <strong>{book.isbn || "-"}</strong>
                  </p>

                  <p>
                    <span>Publisher</span>
                    <strong>{book.publisher || "-"}</strong>
                  </p>

                  <p>
                    <span>Published</span>
                    <strong>{book.published || "-"}</strong>
                  </p>

                  <p>
                    <span>Program</span>
                    <strong>{book.program ?? "-"}</strong>
                  </p>
                </div>

              </div>

              <div className="book-row-actions">
                <button
                  type="button"
                  className="book-detail-button"
                  onClick={() => setBookToDetail(book)}
                >
                  DETAIL
                </button>

                <button
                  type="button"
                  className="book-action-button book-edit-button"
                  onClick={() => openEditPopup(book)}
                  aria-label={`Edit ${book.title}`}
                  title="Edit book"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="21"
                    height="21"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m16 4 4 4" />
                    <path d="M4 20l4.5-1 11-11a2.12 2.12 0 0 0-3-3l-11 11L4 20z" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="book-action-button book-delete-button"
                  onClick={() => {
                    resetMessages();
                    setBookToDelete(book);
                  }}
                  aria-label={`Delete ${book.title}`}
                  title="Delete book"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="21"
                    height="21"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="m19 6-1 14H6L5 6" />
                    <path d="M10 11v5M14 11v5" />
                  </svg>
                </button>
              </div>
            </article>
          ))
        )}
      </section>
        </>
      )}

      {/* ADD OR EDIT BOOK MODAL */}
      {(isAddOpen || bookToEdit) && (
        <div
          className="book-modal-overlay"
          onClick={closePopup}
        >
          <div
            className="book-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="book-modal-heading">
              <div
                className="book-modal-icon"
                aria-hidden="true"
              >
                {bookToEdit ? "✎" : "＋"}
              </div>

              <h2 id="book-modal-title">
                {bookToEdit
                  ? "Edit Book"
                  : "Add New Book"}
              </h2>

              <p>
                {bookToEdit
                  ? "Update the book information below."
                  : "Scan a new RFID book tag, then complete every field."}
              </p>
            </div>

            <form
              className="book-modal-form"
              onSubmit={handleSubmit}
            >
              {!bookToEdit && (
                <div className="book-modal-field book-modal-field-wide">
                  <label htmlFor="book-uid">
                    RFID UID / Sticker Code *
                  </label>

                  <input
                    id="book-uid"
                    name="uid"
                    value={form.uid}
                    readOnly
                    required
                    placeholder="Scan RFID sticker to populate UID"
                  />

                  <small>
                    Required so the kiosk can identify this
                    book's RFID sticker.
                  </small>
                </div>
              )}

              <div className="book-modal-field">
                <label htmlFor="book-title">
                  Book Title *
                </label>

                <input
                  id="book-title"
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-author">
                  Author *
                </label>

                <input
                  id="book-author"
                  name="author"
                  value={form.author}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-publisher">Publisher *</label>
                <input id="book-publisher" name="publisher" value={form.publisher} onChange={handleFormChange} required />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-published">Published *</label>
                <input id="book-published" name="published" value={form.published} onChange={handleFormChange} required placeholder="e.g. 2003 or 2003-09-25" />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-call-number">
                  Call Number *
                </label>

                <input
                  id="book-call-number"
                  name="call_number"
                  value={form.call_number}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-isbn">ISBN</label>
                <input id="book-isbn" name="isbn" value={form.isbn} onChange={handleFormChange} placeholder="-" />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-edition">Edition</label>
                <input id="book-edition" name="edition" value={form.edition} onChange={handleFormChange} placeholder="-" />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-page-count">Page Count *</label>
                <input id="book-page-count" type="number" name="page_count" min="1" step="1" value={form.page_count} onChange={handleFormChange} required />
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-program">
                  Program
                </label>

                <select
                  id="book-program"
                  name="program"
                  value={form.program}
                  onChange={handleFormChange}
                  required
                >
                  {PROGRAMS.map((program) => (
                    <option
                      key={program}
                      value={program}
                    >
                      {program}
                    </option>
                  ))}
                </select>
              </div>

              <div className="book-modal-field">
                <label htmlFor="book-status">
                  Status *
                </label>

                <select
                  id="book-status"
                  name="status"
                  value={form.status}
                  onChange={handleFormChange}
                  required
                >
                  <option value="borrowed">
                    borrowed
                  </option>

                  <option value="returned">
                    returned
                  </option>
                </select>
              </div>

              <div className="book-modal-field book-modal-field-wide">
                <label htmlFor="book-synopsis">
                  Synopsis
                </label>

                <textarea
                  id="book-synopsis"
                  name="synopsis"
                  value={form.synopsis}
                  onChange={handleFormChange}
                  rows="3"
                  required
                  placeholder="Write a short description of the book..."
                />
              </div>

              <div className="book-modal-field book-modal-field-wide">
                <label htmlFor="book-figure">
                  Book Figure / Cover Image
                </label>

                <input
                  ref={fileInputRef}
                  id="book-figure"
                  type="file"
                  accept="image/*"
                  onChange={handleFigureChange}
                />

                <small>
                  Image file up to 10 MB before compression.
                  The system compresses it before saving.
                </small>

                {form.figure && (
                  <div className="book-image-preview-wrap">
                    <img
                      className="book-image-preview"
                      src={form.figure}
                      alt="Book cover preview"
                    />

                    <button
                      type="button"
                      className="book-remove-image"
                      onClick={() => {
                        setForm((previous) => ({
                          ...previous,
                          figure: "",
                        }));

                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      Remove image
                    </button>
                  </div>
                )}
              </div>

              <div className="book-modal-actions">
                <button
                  type="button"
                  className="book-modal-secondary"
                  onClick={closePopup}
                  disabled={isSaving}
                >
                  BACK
                </button>

                <button
                  type="submit"
                  className="book-modal-primary"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "SAVING..."
                    : bookToEdit
                      ? "SAVE CHANGES"
                      : "ADD BOOK"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOOK DETAIL MINI POPUP */}
      {bookToDetail && (
        <div className="book-modal-overlay" onClick={() => setBookToDetail(null)}>
          <div className="book-detail-modal" role="dialog" aria-modal="true" aria-labelledby="book-detail-title" onClick={(e) => e.stopPropagation()}>
            <div className="book-modal-heading">
              <div className="book-modal-icon" aria-hidden="true">▤</div>
              <h2 id="book-detail-title">Book Details</h2>
              <p>Complete information for this book.</p>
            </div>
            <div className="book-detail-content">
              {[
                ["Book title", bookToDetail.title],
                ["Author", bookToDetail.author],
                ["Publisher", bookToDetail.publisher],
                ["Published", bookToDetail.published],
                ["Call number", bookToDetail.call_number],
                ["ISBN", bookToDetail.isbn],
                ["Edition", bookToDetail.edition],
                ["Page Count", bookToDetail.page_count],
                ["Synopsis", bookToDetail.synopsis],
              ].map(([label, value]) => (
                <div className="book-detail-item" key={label}>
                  <span>{label}</span>
                  <strong>{value === null || value === undefined || value === "" ? "-" : String(value)}</strong>
                </div>
              ))}
            </div>
            <div className="book-modal-actions">
              <button type="button" className="book-modal-secondary" onClick={() => setBookToDetail(null)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE BOOK CONFIRMATION */}
      {bookToDelete && (
        <div
          className="book-modal-overlay"
          onClick={() =>
            !isDeleting && setBookToDelete(null)
          }
        >
          <div
            className="book-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="book-delete-icon"
              aria-hidden="true"
            >
              !
            </div>

            <h2 id="book-delete-title">
              Delete Book?
            </h2>

            <p>
              Are you sure you want to delete{" "}
              <strong>{bookToDelete.title}</strong>?
            </p>

            <p className="book-delete-warning">
              This action cannot be undone.
            </p>

            <div className="book-modal-actions">
              <button
                type="button"
                className="book-modal-secondary"
                onClick={() => setBookToDelete(null)}
                disabled={isDeleting}
              >
                CANCEL
              </button>

              <button
                type="button"
                className="book-modal-danger"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "DELETING..." : "DELETE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MenuBook;
