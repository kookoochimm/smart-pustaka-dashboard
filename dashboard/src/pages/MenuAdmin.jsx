import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";
import "./MenuAdmin.css";

const tokenConfig = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
const emptyForm = { username: "", password: "", figure: "", uid: "" };

export default function MenuAdmin() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [modal, setModal] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [photoName, setPhotoName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const photoRef = useRef(null);

  const loadData = useCallback(async () => {
    const config = tokenConfig();
    const [me, list] = await Promise.all([axios.get(`${API_URL}/admins/me`, config), axios.get(`${API_URL}/admins`, config)]);
    setAdmin(me.data); setAdmins(list.data || []);
  }, []);

  useEffect(() => { loadData().catch((e) => setError(e.response?.data?.message || "Unable to load admin details.")); }, [loadData]);

  useEffect(() => {
    if (!scanActive) return undefined;
    let alive = true;
    let timer;
    let polling = false;
    const stopBackendScan = async () => {
      try { await axios.post(`${API_URL}/admins/scan-mode`, { active: false }, tokenConfig()); } catch {}
    };
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        // Match MenuUser's polling request: send only the Bearer token.
        // The timestamp query parameter is enough to avoid cached scan results.
        const { data } = await axios.get(
          `${API_URL}/admins/scan-result?_t=${Date.now()}`,
          tokenConfig()
        );
        if (!alive || !data || !data.status) return;
        if (data.status === "success" && data.uid) {
          setForm((old) => ({ ...old, uid: String(data.uid).toUpperCase() }));
          setNotice(`New RFID UID detected: ${data.uid}`);
          setError("");
          setScanActive(false);
          await stopBackendScan();
        } else if (data.status === "error") {
          setError(data.message || "Unable to use this RFID card.");
          setScanActive(false);
          await stopBackendScan();
        }
      } catch (e) {
        if (alive) {
          setError(e.response?.data?.message || "RFID scan failed. Check the backend connection.");
          setScanActive(false);
          await stopBackendScan();
        }
      } finally {
        polling = false;
      }
    };
    poll();
    timer = window.setInterval(poll, 600);
    return () => {
      alive = false;
      window.clearInterval(timer);
      stopBackendScan();
    };
  }, [scanActive]);

  const startScan = async (kind) => {
    setError(""); setNotice("Tap the new 8-character RFID admin card on the reader.");
    setForm((old) => ({ ...old, uid: "" }));
    try {
      const response = await axios.post(
        `${API_URL}/admins/scan-mode`,
        { active: true, mode: kind },
        tokenConfig()
      );

      if (response.data?.active !== true) {
        setScanActive(false);
        setError("Backend did not activate admin RFID scan mode. Please try again.");
        return;
      }

      setScanActive(true);
    } catch (e) {
      setScanActive(false);
      setError(e.response?.data?.message || "Could not activate RFID scanning.");
    }
  };
  const stopScan = async () => { setScanActive(false); try { await axios.post(`${API_URL}/admins/scan-mode`, { active: false }, tokenConfig()); } catch {} };

  const onPhoto = (file) => {
    setError(""); if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { setError("Choose a JPG, PNG, WEBP or GIF image."); return; }
    if (file.size > 30 * 1024 * 1024) { setError("Photo must not exceed 30 MB."); return; }
    const reader = new FileReader(); reader.onload = () => { setForm((old) => ({ ...old, figure: String(reader.result || "") })); setPhotoName(file.name); }; reader.readAsDataURL(file);
  };
  const openModal = (name, initial = emptyForm) => { setError(""); setNotice(""); setForm({ ...emptyForm, ...initial }); setPhotoName(""); setModal(name); };
  const closeModal = async () => { await stopScan(); setModal(""); setError(""); setNotice(""); };
  const submit = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    if (!form.username.trim() || !form.password) { setError("Username and password are required."); return; }
    if ((modal === "add" || modal === "replace") && !/^[0-9A-F]{8}$/i.test(form.uid)) { setError("Scan a valid 8-character hexadecimal RFID UID first."); return; }
    setBusy(true);
    try {
      if (modal === "edit") await axios.put(`${API_URL}/admins/me`, { username: form.username.trim(), password: form.password, figure: form.figure }, tokenConfig());
      if (modal === "replace") await axios.post(`${API_URL}/admins/replace-card`, { username: form.username.trim(), password: form.password, figure: form.figure, uid: form.uid }, tokenConfig());
      if (modal === "add") await axios.post(`${API_URL}/admins`, { username: form.username.trim(), password: form.password, figure: form.figure, uid: form.uid }, tokenConfig());
      await closeModal(); await loadData(); setNotice(modal === "edit" ? "Admin details updated." : modal === "replace" ? "Admin card and details replaced." : "New librarian added.");
    } catch (e) { setError(e.response?.data?.message || "Unable to save admin information."); }
    finally { setBusy(false); }
  };
  const openDeleteModal = (item) => {
    setError(""); setNotice(""); setDeletePassword(""); setDeleteTarget(item); setModal("delete");
  };
  const deleteAdmin = async (event) => {
    event.preventDefault(); setError("");
    if (!deleteTarget || !deletePassword) { setError("Enter the password for this admin account to confirm deletion."); return; }
    setBusy(true);
    try {
      await axios.delete(`${API_URL}/admins/${deleteTarget.admin_id}`, { ...tokenConfig(), data: { password: deletePassword } });
      setModal(""); setDeleteTarget(null); setDeletePassword(""); await loadData(); setNotice("Librarian removed.");
    } catch (e) { setError(e.response?.data?.message || "Unable to remove librarian."); }
    finally { setBusy(false); }
  };
  const removePhoto = () => { setForm((old) => ({ ...old, figure: "" })); setPhotoName(""); if (photoRef.current) photoRef.current.value = ""; };

  return <div className="admin-page">
    <header className="admin-page-header"><div><p className="eyebrow">LIBRARY MANAGEMENT</p><h1>ADMIN PROFILE</h1><p>Manage your administrator account and library staff.</p></div><button className="admin-back" onClick={() => navigate("/menu")}>← BACK TO DASHBOARD</button></header>
    {error && !modal && <div className="admin-alert error">{error}<button onClick={() => setError("")}>×</button></div>}
    {notice && !modal && <div className="admin-alert success">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    {admin && <section className="admin-profile-card">
      <button className="profile-photo" onClick={() => openModal("photo", { ...admin, uid: admin.uid || "" })} title="Upload or change profile photo">{admin.figure ? <img src={admin.figure} alt="Admin profile" /> : <span>♟</span>}<span className="photo-hover">＋ Change photo</span></button>
      <div className="admin-info-grid"><div><span>Username</span><strong>{admin.username}</strong></div><div><span>Role</span><strong className="role-pill">Administrator</strong></div><div><span>RFID UID</span><strong>{admin.uid}</strong></div><div><span>Member Since</span><strong>{admin.created_at ? new Date(admin.created_at).toLocaleString() : "—"}</strong></div></div>
      <div className="profile-actions"><button className="primary-btn" onClick={() => openModal("edit", { ...admin, password: admin.password || "" })}>✎ Change Details</button><button className="danger-outline" onClick={() => openModal("replace", { ...emptyForm })}>🗑️ Remove Old Card</button></div>
    </section>}
    <section className="staff-section"><div className="staff-heading"><div><h2>LIBRARY STAFF (LIBRARIANS)</h2><p>Manage librarian accounts who can access the system.</p></div><button className="primary-btn" onClick={() => admins.length >= 3 ? setError("The admins table can contain a maximum of 3 accounts.") : openModal("add")}>＋ Add New Librarian</button></div>
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>No.</th><th>Photo</th><th>Username</th><th>RFID UID</th><th>Role</th><th>Date Added</th><th>Action</th></tr></thead><tbody>{admins.map((item, i) => <tr key={item.admin_id}><td>{i + 1}</td><td><div className="staff-avatar">{item.figure ? <img src={item.figure} alt="" /> : "♟"}</div></td><td>{item.username}</td><td>{item.uid}</td><td><span className="role-pill">Administrator</span></td><td>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</td><td className="staff-actions">{Number(item.admin_id) !== Number(admin?.admin_id) && <button className="delete-icon" aria-label="Remove librarian" title="Remove" onClick={() => openDeleteModal(item)}>🗑️</button>}</td></tr>)}</tbody></table></div>
    </section>
    {modal && <div className="admin-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title"><button className="modal-x" onClick={closeModal} aria-label="Close">×</button><div className="modal-symbol">{modal === "delete" ? "🗑️" : modal === "add" ? "＋" : modal === "replace" ? "🗑️" : modal === "photo" ? "📷" : "✎"}</div><h2 id="admin-modal-title">{modal === "delete" ? "Confirm Delete" : modal === "add" ? "Add New Librarian" : modal === "replace" ? "Replace Admin Card" : modal === "photo" ? "Update Profile Photo" : "Change Admin Details"}</h2><p className="modal-subtitle">{modal === "delete" ? "Enter the password belonging to this admin account to confirm removal." : modal === "replace" ? "Confirm your current account before replacing its RFID card." : modal === "add" ? "Create another administrator account." : modal === "photo" ? "Upload a profile image, up to 30 MB." : "Update the account information saved in the database."}</p>
      {error && <div className="modal-error">{error}</div>}{notice && <div className="modal-notice">{notice}</div>}
      {modal === "delete" ? <form onSubmit={deleteAdmin} className="delete-admin-form">
        <p className="delete-confirm-text">Are you sure you want to delete <strong>{deleteTarget?.username}</strong>?</p>
        <p className="delete-warning-text">This action cannot be undone.</p>
        <label className="delete-password-label">Enter this admin's password<input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" required autoFocus /></label>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={closeModal}>Cancel</button><button type="submit" className="confirm-delete-btn" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button></div>
      </form> : modal === "photo" ? <div className="photo-only"><button className="upload-circle" onClick={() => photoRef.current?.click()}>{form.figure ? <img src={form.figure} alt="Preview" /> : <span>📷<small>Upload photo</small></span>}</button><input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /><p>{photoName || "JPG, PNG, WEBP or GIF · Max 30 MB"}</p><div className="modal-actions"><button className="secondary-btn" onClick={closeModal}>Cancel</button><button className="primary-btn" onClick={async () => { setBusy(true); try { await axios.put(`${API_URL}/admins/me`, { username: admin.username, password: admin.password || "", figure: form.figure }, tokenConfig()); await closeModal(); await loadData(); } catch (e) { setError(e.response?.data?.message || "Photo upload failed."); } finally { setBusy(false); } }} disabled={busy}>Save Photo</button><button className="secondary-btn" onClick={removePhoto}>Remove Photo</button></div></div> : <form onSubmit={submit}>
        <div className="admin-form-grid"><label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" required /></label><label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required /></label>
        <div className="admin-form-full"><span className="field-label">Profile photo</span><div className="upload-row"><button type="button" className="upload-mini" onClick={() => photoRef.current?.click()}>{form.figure ? <img src={form.figure} alt="Preview" /> : <span>📷</span>}</button><div><button type="button" className="secondary-btn compact" onClick={() => photoRef.current?.click()}>Upload photo</button><button type="button" className="text-danger" onClick={removePhoto}>Remove photo</button><p className="help-text">Maximum file size: 30 MB. Optional.</p></div></div><input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></div>
        {(modal === "add" || modal === "replace") && <label className="admin-form-full">New RFID UID <div className="uid-row"><input value={form.uid} readOnly placeholder="Scan an 8-character UID" /><button type="button" className="secondary-btn" onClick={() => startScan(modal)}>{scanActive ? "Scanning…" : "Scan card"}</button></div></label>}</div>
        {modal === "replace" && <p className="help-text">Your username and password must match the currently signed-in admin account.</p>}
        {notice && <div className="modal-notice">{notice}</div>}
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={closeModal}>Cancel</button><button type="submit" className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Confirm"}</button></div>
      </form>}
    </section></div>}
  </div>;
}
