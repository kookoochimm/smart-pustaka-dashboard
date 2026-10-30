
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import "./Menu.css";

function Menu({ onLogout }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [adminProfile, setAdminProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  });

  const API_URL = "http://localhost:5002/api";

  const authConfig = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    },
  });

  useEffect(() => {
    let active = true;

    axios
      .get(`${API_URL}/admins/me`, authConfig())
      .then(({ data }) => {
        if (!active) return;

        // Ambil username sebenar daripada database
        setAdminProfile((previous) => {
          const updatedProfile = {
            ...previous,
            ...data,
            username: data.username,
            fullname: data.username,
          };

          localStorage.setItem("user", JSON.stringify(updatedProfile));

          return updatedProfile;
        });
      })
      .catch((error) => {
        console.error(
          "Unable to load admin profile:",
          error.response?.data || error.message
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const menuItems = [
    { label: "USERS", path: "/menuuser", icon: "👤" },
    { label: "BOOKS", path: "/menubook", icon: "🕮" },
    { label: "RECORDS", path: "/menurecord", icon: "🗃️" },
    { label: "FINE", path: "/menufine", icon: "💰" },
  ];

  const dashboardItems = [
    {
      label: "USERS",
      path: "/menuuser",
      icon: "👤",
      description: "Manage library users",
    },
    {
      label: "BOOKS",
      path: "/menubook",
      icon: "🕮",
      description: "Manage book collection",
    },
    {
      label: "RECORD",
      path: "/menurecord",
      icon: "🗃️",
      description: "View borrowing records",
    },
    {
      label: "FINE",
      path: "/menufine",
      icon: "💰",
      description: "Manage overdue fines",
    },
  ];

  const handleLogout = () => {
    setSidebarOpen(false);

    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/", { replace: true });
    }
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Username sebenar admin yang sedang login
  const currentUsername =
    adminProfile.username || adminProfile.fullname || "Admin";

  return (
    <div
      className={`menu-container ${
        sidebarOpen ? "sidebar-open" : ""
      }`}
    >
      {/* OVERLAY */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className="menu-sidebar"
        aria-hidden={!sidebarOpen}
      >
        {/* ADMIN PROFILE */}
        <div className="sidebar-profile">
          <button
            type="button"
            className="sidebar-profile-trigger"
            onClick={() => {
              closeSidebar();
              navigate("/menuadmin");
            }}
            aria-label="Open admin profile"
          >
            <div className="admin-avatar">
              {adminProfile.figure ? (
                <img
                  src={adminProfile.figure}
                  alt="Admin profile"
                />
              ) : (
                <span>♟</span>
              )}
            </div>

            <h3>{currentUsername}</h3>
            <p>Administrator</p>
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="sidebar-navigation">
          {menuItems.map((item) => (
            <Link
              to={item.path}
              className="sidebar-link"
              key={item.label}
              onClick={closeSidebar}
              tabIndex={sidebarOpen ? 0 : -1}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* LOGOUT */}
        <button
          type="button"
          className="logout-button"
          onClick={handleLogout}
          tabIndex={sidebarOpen ? 0 : -1}
        >
          <span className="logout-icon">↪</span>
          LOG OUT
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="menu-main">
        {/* HEADER */}
        <header className="menu-header">
          <div className="header-left">
            <button
              type="button"
              className="menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={
                sidebarOpen ? "Close menu" : "Open menu"
              }
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? "✕" : "☰"}
            </button>

            <div className="header-title">
              <h1>WELCOME BACK, {currentUsername}!!</h1>

              <p className="header-description">
                Manage your library system in one place.
              </p>
            </div>
          </div>
        </header>

        {/* DASHBOARD SECTION */}
        <section className="dashboard-section">
          <div className="dashboard-grid">
            {dashboardItems.map((item) => (
              <Link
                to={item.path}
                className={`dashboard-card card-${item.label.toLowerCase()}`}
                key={item.label}
              >
                <div className="dashboard-card-top">
                  <div className="dashboard-icon">
                    {item.icon}
                  </div>

                  <span className="card-arrow">↗</span>
                </div>

                <div className="dashboard-card-bottom">
                  <h3>{item.label}</h3>

                  <p>{item.description}</p>

                  <span className="card-view">
                    View details →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="menu-footer">
          <p>RFID Library Self-Service System</p>
          <span>TVETMARA Sungai Petani</span>
        </footer>
      </main>
    </div>
  );
}

export default Menu;
