import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import axios from "axios";

import { useNavigate } from "react-router-dom";

import API_URL from "../config";
import "./MenuUser.css";


// At least 8 characters, including uppercase, lowercase, and a digit.
const isStrongPassword = (password) =>
  password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
const PASSWORD_RULE_MESSAGE = "Password must be at least 8 characters and include uppercase, lowercase, and a number.";

function MenuUser() {

  const navigate = useNavigate();

  // States

  const [users, setUsers] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const [userToEdit, setUserToEdit] = useState(null);

  const [userToDelete, setUserToDelete] = useState(null);

  const [loading, setLoading] = useState(true);

  const [isDeleting, setIsDeleting] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  // RFID add-user popup state

  const [scannedUid, setScannedUid] = useState("");
  const [userUidFilter, setUserUidFilter] = useState("");
  const [borrowedBooks, setBorrowedBooks] = useState([]);
  const [borrowedBooksLoading, setBorrowedBooksLoading] = useState(false);
  const [borrowedBooksError, setBorrowedBooksError] = useState("");
  const [scannedUserInfo, setScannedUserInfo] = useState(null);
  const scannedUidRef = useRef("");
  const [addUserForm, setAddUserForm] = useState({

    fullname: "",

    username: "",

    matric_number: "",

    role: "Student",

    program: "-",

    password: "",

  });

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addMatricError, setAddMatricError] = useState("");

  const [scanNotice, setScanNotice] = useState("");

  // Get users from database

  const fetchUsers = useCallback(async () => {

    try {

      setLoading(true);

      setError("");

      const token = localStorage.getItem("token");

      const response = await axios.get(`${API_URL}/users`, {

        headers: token

          ? { Authorization: `Bearer ${token}` }

          : {},

      });

      const data = response.data;

      const userList = Array.isArray(data)

        ? data

        : Array.isArray(data.users)

        ? data.users

        : [];

      setUsers(userList);

    } catch (err) {

      console.error("FETCH USERS ERROR:", err);

      setError(

        err.response?.data?.message ||

          "Unable to load users from database."

      );

    } finally {

      setLoading(false);

    }

  }, []);

  useEffect(() => {

    fetchUsers();

  }, [fetchUsers]);

  // Tell the backend that MenuUser is open, then poll for an unknown RFID UID.

  useEffect(() => {
    let alive = true;
    let intervalId = null;
    let polling = false;
    const token = localStorage.getItem("token");
    const config = { headers: token ? { Authorization: `Bearer ${token}` } : {} };

    const pollScannedCard = async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await axios.get(`${API_URL}/users/pending-card`, config);
        if (!alive) return;
        const { uid, status, user, message } = response.data || {};
        const normalizedUid = String(uid || "").trim().toUpperCase();
        if (!normalizedUid || normalizedUid === scannedUidRef.current) return;
        scannedUidRef.current = normalizedUid;
        setError("");
        setSuccess("");
        if (status === "admin") {
          setScannedUid("");
          setUserUidFilter("");
          setScanNotice(message || "This is the ADMIN card. Scan a user's card instead.");
          return;
        }
        if (status === "exists") {
          setScannedUid("");
          setUserUidFilter(normalizedUid);
          setSearchTerm("");
          setSearchQuery("");
          setScanNotice("");
          return;
        }
        if (status === "unknown") {
          setUserUidFilter("");
          setBorrowedBooks([]);
          setScannedUserInfo(null);
          setBorrowedBooksError("");
          setScannedUid(normalizedUid);
          setAddUserForm({ fullname: "", username: "", matric_number: "", role: "Student", program: "-", password: "" });
          setScanNotice("");
        }
      } catch (err) {
        if (alive) setScanNotice(err.response?.data?.message || "Cannot receive RFID scan. Check backend connection and login token.");
      } finally {
        polling = false;
      }
    };

    const startRegistrationMode = async () => {
      try {
        const response = await axios.post(`${API_URL}/users/registration-mode`, { active: true }, config);
        if (!alive) return;
        if (response.data?.active !== true) {
          setScanNotice("Backend did not activate RFID registration mode. Please reopen Menu User.");
          return;
        }
        setScanNotice("");
        await pollScannedCard();
        if (alive) intervalId = window.setInterval(pollScannedCard, 700);
      } catch (err) {
        if (alive) setScanNotice(err.response?.data?.message || "Unable to activate RFID registration mode. Check that backend is running and login token is valid.");
      }
    };

    startRegistrationMode();
    return () => {
      alive = false;
      if (intervalId !== null) window.clearInterval(intervalId);
      axios.post(`${API_URL}/users/registration-mode`, { active: false }, config).catch(() => {});
    };
  }, []);

  const handleAddUserChange = (e) => {

    const { name, value } = e.target;

    setAddUserForm((prev) => ({ ...prev, [name]: value }));
    if (name === "matric_number") setAddMatricError("");
    if (name === "password") setError("");

  };

  const handleBackAddUser = async () => {

    if (isAddingUser) return;

    setScannedUid("");
    scannedUidRef.current = "";
    setScanNotice("");

    const token = localStorage.getItem("token");

    try {

      await axios.post(`${API_URL}/users/registration-mode`, { active: true }, {

        headers: token ? { Authorization: `Bearer ${token}` } : {},

      });

    } catch (err) {

      console.error("RESET SCANNED CARD ERROR:", err);

    }

  };

  const handleAddScannedUser = async (e) => {

    e.preventDefault();

    if (!scannedUid || isAddingUser) return;
    if (!isStrongPassword(addUserForm.password)) {
      setError(PASSWORD_RULE_MESSAGE);
      setSuccess("");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {

      setError("Login token not found. Please log in again.");

      return;

    }

    try {

      setIsAddingUser(true);

      setError("");
      setAddMatricError("");

      const response = await axios.post(`${API_URL}/users/register-scanned`, {

        uid: scannedUid,

        fullname: addUserForm.fullname.trim(),

        username: addUserForm.username.trim(),

        matric_number: addUserForm.matric_number.trim(),

        role: addUserForm.role,

        program: addUserForm.program,

        password: addUserForm.password,

      }, { headers: { Authorization: `Bearer ${token}` } });

      setSuccess(response.data?.message || "User added successfully.");
      setAddMatricError("");

      setScannedUid("");
      scannedUidRef.current = "";
      setAddUserForm({ fullname: "", username: "", matric_number: "", role: "Student", program: "-", password: "" });

      await fetchUsers();

    } catch (err) {
      const message = err.response?.data?.message || "Failed to add user.";
      if (/matric number/i.test(message) && /(same|already|exists|unique|duplicate)/i.test(message)) {
        setAddMatricError("Matric number cannot be same.");
        setError("");
      } else {
        setError(message);
      }

    } finally {

      setIsAddingUser(false);

    }

  };

  // Clear the selected UID and reset the pending scan so the same card can be scanned again.
  const handleClearUidFilter = async () => {
    setUserUidFilter("");
    setBorrowedBooks([]);
    setScannedUserInfo(null);
    setBorrowedBooksError("");
    setBorrowedBooksLoading(false);
    setScanNotice("");
    setSearchTerm("");
    setSearchQuery("");

    const token = localStorage.getItem("token");
    try {
      // This endpoint clears the backend's pending card while keeping registration mode active.
      await axios.post(
        `${API_URL}/users/registration-mode`,
        { active: true },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      // Reset only after the pending UID has been cleared, so polling cannot reselect it.
      scannedUidRef.current = "";
    } catch (err) {
      console.error("CLEAR USER UID FILTER ERROR:", err);
      setScanNotice("Could not reset RFID scan. Please check the backend connection.");
    }
  };

  // Search users and sort by fullname A-Z

  const filteredUsers = useMemo(() => {

    const search = searchQuery.trim().toLowerCase();

    return [...users]

      .filter((user) => {
        const username = String(user.username ?? "").trim().toUpperCase();
        const uid = String(user.uid ?? "").trim().toUpperCase();

        // Never show the ADMIN account in ordinary user management.
        if (username === "ADMIN") return false;

        // MenuUser only lists registered user cards with exactly 8 hexadecimal characters.
        if (!/^[0-9A-F]{8}$/.test(uid)) return false;

        if (userUidFilter && uid !== userUidFilter) return false;

        if (!search) return true;

        const fields = [

          user.username,

          user.fullname,

          user.matric_number,

          user.program,

        ];

        return fields.some((field) =>

          String(field ?? "")

            .toLowerCase()

            .includes(search)

        );

      })

      .sort((a, b) =>

        String(a.fullname ?? "").localeCompare(

          String(b.fullname ?? ""),

          "en",

          { sensitivity: "base" }

        )

      );

  }, [users, searchQuery, userUidFilter]);

  const [editForm, setEditForm] = useState({

    fullname: "",

    username: "",

    matric_number: "",

    program: "-",

    password: "",

  });

  const [isSaving, setIsSaving] = useState(false);
  const [editMatricError, setEditMatricError] = useState("");

  // Open Edit User popup

  const handleEditClick = (user) => {

    setError("");

    setSuccess("");
    setEditMatricError("");

    setUserToEdit(user);

    setEditForm({

      fullname: user.fullname ?? "",

      username: user.username ?? "",

      matric_number: user.matric_number ?? "",

      program: user.program ?? "-",

      password: "",

    });

  };

  // Update form input

  const handleEditChange = (e) => {

    const { name, value } = e.target;

    setEditForm((prev) => ({

      ...prev,

      [name]: value,

    }));
    if (name === "matric_number") setEditMatricError("");
    if (name === "password") setError("");

  };

  // Close Edit User popup

  const handleCancelEdit = () => {

    if (isSaving) return;

    setUserToEdit(null);

  };

  // Confirm Edit User

  const handleConfirmEdit = async (e) => {

    e.preventDefault();

    if (!userToEdit || isSaving) return;

    const token = localStorage.getItem("token");

    if (!token) {

      setError("Login token not found. Please log in again.");

      return;

    }

    const fullname = editForm.fullname.trim();

    const username = editForm.username.trim();

    const matric_number = editForm.matric_number.trim();

    const program = editForm.program;

    if (!fullname || !username || !matric_number) {

      setError("Please fill in all required fields.");

      return;

    }

    // Blank means keep the existing password; a new password must meet the rule.
    if (editForm.password !== "" && !isStrongPassword(editForm.password)) {
      setError(PASSWORD_RULE_MESSAGE);
      setSuccess("");
      return;
    }

    const payload = {

      fullname,

      username,

      matric_number,

      program,

    };

    // Only send a new password if the user entered one.

    if (editForm.password !== "") {

      payload.password = editForm.password;

    }

    try {

      setIsSaving(true);

      setError("");
      setEditMatricError("");

      setSuccess("");

      await axios.put(

        `${API_URL}/users/${userToEdit.user_id}`,

        payload,

        {

          headers: {

            Authorization: `Bearer ${token}`,

          },

        }

      );

      setUserToEdit(null);

      setSuccess("User updated successfully.");

      await fetchUsers();

    } catch (err) {

      console.error(

        "EDIT USER ERROR:",

        err.response?.status,

        err.response?.data || err.message

      );

      const message = err.response?.data?.message || "Failed to update user.";
      if (/matric number/i.test(message) && /(same|already|exists|unique|duplicate)/i.test(message)) {
        setEditMatricError("Matric number cannot be same.");
        setError("");
      } else {
        setError(message);
      }

    } finally {

      setIsSaving(false);

    }

  };

  // Open delete confirmation popup

  const handleDeleteClick = (user) => {

    setError("");

    setSuccess("");

    setUserToDelete(user);

  };

  // Cancel deletion

  const handleCancelDelete = () => {

    if (isDeleting) return;

    setUserToDelete(null);

  };

  // Confirm deletion

  const handleConfirmDelete = async () => {

    if (!userToDelete || isDeleting) return;

    const userId = userToDelete.user_id;

    if (userId == null) {

      setError("User ID is missing. Cannot delete this user.");

      setUserToDelete(null);

      return;

    }

    const token = localStorage.getItem("token");

    if (!token) {

      setError("Login token not found. Please log in again.");

      setUserToDelete(null);

      return;

    }

    try {

      setIsDeleting(true);

      setError("");

      setSuccess("");

      await axios.delete(`${API_URL}/users/${userId}`, {

        headers: {

          Authorization: `Bearer ${token}`,

        },

      });

      setUserToDelete(null);

      setSuccess("User deleted successfully.");

      await fetchUsers();

    } catch (err) {

      console.error(

        "DELETE USER ERROR:",

        err.response?.status,

        err.response?.data || err.message

      );

      setError(

        err.response?.data?.message ||

          "Failed to delete user."

      );

      setUserToDelete(null);

    } finally {

      setIsDeleting(false);

    }

  };

  // Page UI

  return (

    <div className="menu-user-page">

      {/* Header */}

      <header className="menu-user-header">

        <div>

          <p className="menu-user-eyebrow">LIBRARY MANAGEMENT</p>

          <h1>USER MANAGEMENT</h1>

          <p className="menu-user-description">Manage library user information.</p>

        </div>

      </header>

      {/* Search */}

      <form
        className="user-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSearchQuery(searchTerm.trim());
        }}
      >
        <div className="user-search-icon" aria-hidden="true">⌕</div>
        <input
          type="search"
          className="user-search-input"
          placeholder="Search username, fullname, matric number or program..."
          aria-label="Search username, fullname, matric number or program"
          value={searchTerm}
          onChange={(e) => {
            const value = e.target.value;
            setSearchTerm(value);
            if (value.trim() === "") setSearchQuery("");
          }}
        />
        <button type="submit" className="user-search-button">SEARCH</button>
        {searchQuery && (
          <button
            type="button"
            className="user-clear-button"
            onClick={() => { setSearchTerm(""); setSearchQuery(""); }}
          >
            CLEAR
          </button>
        )}
      </form>

      {/* Scan Card to Add New User */}

      <div className="scan-card-notice">

        <span className="scan-card-notice-icon">

          <svg

            viewBox="0 0 24 24"

            width="22"

            height="22"

            fill="none"

            stroke="currentColor"

            strokeWidth="2"

            strokeLinecap="round"

            strokeLinejoin="round"

            aria-hidden="true"

          >

            <rect x="2" y="5" width="20" height="14" rx="2" />

            <path d="M2 10h20" />

            <path d="M6 15h4" />

          </svg>

        </span>

        <span>Scan card to add new user</span>

      </div>

      {scanNotice && (

        <div className="user-message user-message-error" role="status">

          {scanNotice}

        </div>

      )}

      {/* Error message */}

      {error && (

        <div

          className="user-message user-message-error"

          role="alert"

        >

          {error}

        </div>

      )}

      {/* Success message */}

      {success && (

        <div

          className="user-message user-message-success"

          role="status"

        >

          {success}

        </div>

      )}

      {/* User list */}

      <section className="user-list-section">

        <div className="user-list-heading">
          <div className="user-list-heading-info">
            <h2>User Information</h2>
            <span>
              {userUidFilter
                ? `${filteredUsers.length} users · UID ${userUidFilter}`
                : `${filteredUsers.length} users`}
            </span>
            {userUidFilter && (
              <button type="button" className="user-back-button" onClick={handleClearUidFilter}>
                CLEAR UID FILTER
              </button>
            )}
          </div>
          <button
            type="button"
            className="user-back-button user-list-back-button"
            onClick={() => navigate("/menu")}
          >
            <span aria-hidden="true">←</span> BACK
          </button>
        </div>

        {loading ? (

          <div className="user-list-state">

            Loading users...

          </div>

        ) : filteredUsers.length === 0 ? (

          <div className="user-list-state">

            {searchQuery

              ? "No matching users found."

              : "No users found in the database."}

          </div>

        ) : (

          <div className="user-list">

            {filteredUsers.map((user) => (

              <div

                className="user-row"

                key={user.user_id}

              >

                {/* User information */}

                <div className="user-information">

                  <span className="user-information-name">

                    {user.fullname}

                  </span>

                  <div className="user-information-details">

                    <span>

                      <strong>USERNAME:</strong>{" "}

                      {user.username}

                    </span>

                    <span>

                      <strong>MATRIC NUMBER:</strong>{" "}

                      {user.matric_number || "-"}

                    </span>

                    <span>

                      <strong>PROGRAM:</strong>{" "}

                      {user.program || "-"}

                    </span>

                    <span>

                      <strong>ROLE:</strong>{" "}

                      {user.role || "-"}

                    </span>

                  </div>

                </div>

                {/* Edit button */}

                <button

                  type="button"

                  className="user-action-button user-edit-button"

                  onClick={() => handleEditClick(user)}

                  aria-label={`Edit ${user.fullname || user.username}`}

                  title="Edit user"

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

                {/* Delete button */}

                <button

                  type="button"

                  className="user-action-button user-delete-button"

                  onClick={() => handleDeleteClick(user)}

                  aria-label={`Delete ${user.fullname || user.username}`}

                  title="Delete user"

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

            ))}

          </div>

        )}

      </section>

      {/* Add User popup opened automatically after an unknown RFID card is scanned */}

      {scannedUid && (

        <div className="add-user-scan-overlay" role="presentation">

          <div className="add-user-scan-modal" role="dialog" aria-modal="true" aria-labelledby="add-scanned-user-title">

            <div className="add-user-scan-heading">

              <div className="add-user-scan-icon" aria-hidden="true">＋</div>

              <h2 id="add-scanned-user-title">Add New User</h2>

              <p>Unknown RFID card detected</p>

              <div className="add-user-scan-uid">CARD UID: <strong>{scannedUid}</strong></div>

            </div>

            <form className="add-user-scan-form" onSubmit={handleAddScannedUser}>

              <div className="add-user-scan-field">

                <label htmlFor="new-user-fullname">Fullname</label>

                <input id="new-user-fullname" name="fullname" value={addUserForm.fullname} onChange={handleAddUserChange} required autoFocus />

              </div>

              <div className="add-user-scan-field">

                <label htmlFor="new-user-username">Username</label>

                <input id="new-user-username" name="username" value={addUserForm.username} onChange={handleAddUserChange} required autoComplete="off" />

              </div>

              <div className="add-user-scan-field">

                <label htmlFor="new-user-matric">Matric Number</label>

                <input
                  id="new-user-matric"
                  name="matric_number"
                  value={addUserForm.matric_number}
                  onChange={handleAddUserChange}
                  required
                  aria-invalid={Boolean(addMatricError)}
                  aria-describedby={addMatricError ? "new-user-matric-error" : undefined}
                />
                {addMatricError && (
                  <small id="new-user-matric-error" role="alert" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontWeight: 600 }}>
                    {addMatricError}
                  </small>
                )}

              </div>

              <div className="add-user-scan-field">

                <label htmlFor="new-user-role">Role</label>

                <select id="new-user-role" name="role" value={addUserForm.role} onChange={handleAddUserChange} required>

                  <option value="Student">Student</option>

                  <option value="Academic Staff">Academic Staff</option>

                  <option value="Administrative Staff">Administrative Staff</option>

                </select>

              </div>

              <div className="add-user-scan-field">

                <label htmlFor="new-user-program">Program</label>

                <select id="new-user-program" name="program" value={addUserForm.program} onChange={handleAddUserChange} required>

                  {["-", "DNK", "DSK", "DSJ", "DTA", "DLA", "UTU", "STP"].map((program) => <option key={program} value={program}>{program}</option>)}

                </select>

              </div>

              <div className="add-user-scan-field">

                <label htmlFor="new-user-password">Password</label>

                <input id="new-user-password" type="password" name="password" value={addUserForm.password} onChange={handleAddUserChange} required minLength={8} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}" title="At least 8 characters, with uppercase, lowercase, and a number." autoComplete="new-password" aria-invalid={Boolean(addUserForm.password) && !isStrongPassword(addUserForm.password)} aria-describedby={addUserForm.password && !isStrongPassword(addUserForm.password) ? "new-user-password-help" : undefined} />
                {addUserForm.password && !isStrongPassword(addUserForm.password) && (
                  <small id="new-user-password-help" role="alert" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontWeight: 600 }}>
                    Password must be at least 8 characters and include uppercase, lowercase, and a number.
                  </small>
                )}

              </div>

              <div className="add-user-scan-actions">

                <button type="button" className="add-user-scan-back" onClick={handleBackAddUser} disabled={isAddingUser}>BACK</button>

                <button type="submit" className="add-user-scan-submit" disabled={isAddingUser}>{isAddingUser ? "ADDING..." : "ADD"}</button>

              </div>

            </form>

          </div>

        </div>

      )}

      {/* Delete confirmation popup */}

      {userToDelete && (

        <div

          className="delete-modal-overlay"

          onClick={handleCancelDelete}

        >

          <div

            className="delete-modal"

            role="dialog"

            aria-modal="true"

            aria-labelledby="delete-modal-title"

            onClick={(e) => e.stopPropagation()}

          >

            <div className="delete-modal-icon">

              <svg

                viewBox="0 0 24 24"

                width="28"

                height="28"

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

            </div>

            <h2 id="delete-modal-title">

              Confirm Delete

            </h2>

            <p className="delete-modal-message">

              Are you sure you want to delete{" "}

              <strong>

                {userToDelete.fullname ||

                  userToDelete.username}

              </strong>

              ?

            </p>

            <p className="delete-modal-warning">

              This action cannot be undone.

            </p>

            <div className="delete-modal-actions">

              <button

                type="button"

                className="delete-cancel-button"

                onClick={handleCancelDelete}

                disabled={isDeleting}

              >

                Cancel

              </button>

              <button

                type="button"

                className="delete-confirm-button"

                onClick={handleConfirmDelete}

                disabled={isDeleting}

              >

                {isDeleting ? "Deleting..." : "Confirm"}

              </button>

            </div>

          </div>

        </div>

      )}

      {/* Edit User popup */}

      {userToEdit && (

        <div

          className="edit-user-overlay"

          onClick={handleCancelEdit}

        >

          <div

            className="edit-user-modal"

            role="dialog"

            aria-modal="true"

            aria-labelledby="edit-user-title"

            onClick={(e) => e.stopPropagation()}

          >

            <div className="edit-user-heading">

              <div className="edit-user-icon">

                <svg

                  viewBox="0 0 24 24"

                  width="25"

                  height="25"

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

              </div>

              <h2 id="edit-user-title">Edit User</h2>

              <p>Update user information</p>

            </div>

            <form

              className="edit-user-form"

              onSubmit={handleConfirmEdit}

            >

              <div className="edit-user-field">

                <label htmlFor="edit-fullname">Fullname</label>

                <input

                  id="edit-fullname"

                  type="text"

                  name="fullname"

                  value={editForm.fullname}

                  onChange={handleEditChange}

                  required

                />

              </div>

              <div className="edit-user-field">

                <label htmlFor="edit-username">Username</label>

                <input

                  id="edit-username"

                  type="text"

                  name="username"

                  value={editForm.username}

                  onChange={handleEditChange}

                  required

                  autoComplete="off"

                />

              </div>

              <div className="edit-user-field">

                <label htmlFor="edit-matric">

                  Matric Number

                </label>

                <input

                  id="edit-matric"

                  type="text"

                  name="matric_number"

                  value={editForm.matric_number}

                  onChange={handleEditChange}

                  required
                  aria-invalid={Boolean(editMatricError)}
                  aria-describedby={editMatricError ? "edit-matric-error" : undefined}

                />
                {editMatricError && (
                  <small id="edit-matric-error" role="alert" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontWeight: 600 }}>
                    {editMatricError}
                  </small>
                )}

              </div>

              <div className="edit-user-field">

                <label htmlFor="edit-program">Program</label>

                <select

                  id="edit-program"

                  name="program"

                  value={editForm.program}

                  onChange={handleEditChange}

                  required

                >

                  {["-", "DNK", "DSK", "DSJ", "DTA", "DLA", "UTU", "STP"].map(

                    (program) => (

                      <option key={program} value={program}>

                        {program}

                      </option>

                    )

                  )}

                </select>

              </div>

              <div className="edit-user-field">

                <label htmlFor="edit-password">Password</label>

                <input

                  id="edit-password"

                  type="password"

                  name="password"

                  value={editForm.password}

                  onChange={handleEditChange}

                  placeholder="Leave blank to keep current password"
                  minLength={8}
                  pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}"
                  title="At least 8 characters, with uppercase, lowercase, and a number."
                  aria-invalid={Boolean(editForm.password) && !isStrongPassword(editForm.password)}
                  aria-describedby={editForm.password && !isStrongPassword(editForm.password) ? "edit-password-help" : undefined}
                  autoComplete="new-password"

                />
                {editForm.password && !isStrongPassword(editForm.password) && (
                  <small id="edit-password-help" role="alert" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontWeight: 600 }}>
                    Password must be at least 8 characters and include uppercase, lowercase, and a number.
                  </small>
                )}

              </div>

              <div className="edit-user-actions">

                <button

                  type="button"

                  className="edit-user-back"

                  onClick={handleCancelEdit}

                  disabled={isSaving}

                >

                  BACK

                </button>

                <button

                  type="submit"

                  className="edit-user-confirm"

                  disabled={isSaving}

                >

                  {isSaving ? "SAVING..." : "CONFIRM"}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>

  );

}

export default MenuUser;
