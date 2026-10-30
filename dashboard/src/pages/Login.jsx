
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";
import "../pages/Login.css";

const RFID_API = `${API_URL}/dashboard-auth`;

function Login({ onLogin }) {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rfidReady, setRfidReady] = useState(false);

  const loginHandledRef = useRef(false);
  const lastErrorRef = useRef("");
  const onLoginRef = useRef(onLogin);
  const stopScanTimerRef = useRef(null);

  // Keep the latest onLogin callback without restarting RFID polling.
  useEffect(() => {
    onLoginRef.current = onLogin;
  }, [onLogin]);

  useEffect(() => {
    // React StrictMode may run setup -> cleanup -> setup in development.
    // Cancel a pending stop so an old cleanup cannot disable the new login scan.
    if (stopScanTimerRef.current !== null) {
      window.clearTimeout(stopScanTimerRef.current);
      stopScanTimerRef.current = null;
    }

    let mounted = true;
    let pollTimer = null;
    let polling = false;

    loginHandledRef.current = false;
    lastErrorRef.current = "";

    const pollRFIDResult = async () => {
      if (!mounted || polling || loginHandledRef.current) return;
      polling = true;
      try {
        const response = await axios.get(`${RFID_API}/scan-result`);
        if (!mounted || loginHandledRef.current) return;

        const result = response.data?.result;
        if (result?.status === "success" && result.token && result.user) {
          loginHandledRef.current = true;
          localStorage.setItem("token", result.token);
          localStorage.setItem("user", JSON.stringify(result.user));
          if (typeof onLoginRef.current === "function") onLoginRef.current(result);
          setError("");
          navigate("/menu", { replace: true });
        } else if (result?.status === "error" && result.message) {
          if (lastErrorRef.current !== result.message) {
            lastErrorRef.current = result.message;
            setError(result.message);
          }
        }
      } catch (err) {
        if (mounted) console.error("RFID login polling error:", err.response?.data || err.message);
      } finally {
        polling = false;
      }
    };

    const startLoginScan = async () => {
      try {
        setRfidReady(false);
        const response = await axios.post(`${RFID_API}/scan-mode`, { active: true });
        if (!mounted) return;
        if (response.data?.active !== true) {
          setError("Unable to activate RFID login mode.");
          return;
        }
        setRfidReady(true);
        await pollRFIDResult();
        if (mounted && !loginHandledRef.current) pollTimer = window.setInterval(pollRFIDResult, 700);
      } catch (err) {
        if (mounted) {
          setRfidReady(false);
          setError(err.response?.data?.message || "Unable to activate RFID login. Check the backend server.");
          console.error("Unable to activate RFID login:", err.response?.data || err.message);
        }
      }
    };

    startLoginScan();
    return () => {
      mounted = false;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      // Delay deactivation briefly; a StrictMode re-mount cancels this timer.
      stopScanTimerRef.current = window.setTimeout(() => {
        axios.post(`${RFID_API}/scan-mode`, { active: false }).catch((err) =>
          console.error("Unable to stop RFID login mode:", err.response?.data || err.message)
        );
        stopScanTimerRef.current = null;
      }, 1000);
    };
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(`${API_URL}/auth/login`, {
        username: username.trim(),
        password,
      });

      const data = response.data;

      if (
        data.success !== true ||
        !data.user?.username ||
        !data.token
      ) {
        setError(data.message || "Login failed. Please try again.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

      if (typeof onLoginRef.current === "function") {
        onLoginRef.current(data);
      }

      setUsername("");
      setPassword("");
      setError("");

      navigate("/menu", { replace: true });
    } catch (err) {
      console.error(
        "Login error:",
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.message ||
          (err.request
            ? "Unable to connect to the server. Check your backend."
            : "An unexpected error occurred.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-icon">📚</div>
          <h1>SMART PUSTAKA SYSTEM</h1>
          <p>Self-Service Kiosk Management</p>
        </div>

        <div className="login-heading">
          <h2>Welcome Back!</h2>
          <p>Sign in to access your admin account.</p>
        </div>

        <form onSubmit={handleLogin} autoComplete="off">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="login-user-field"
              type="text"
              placeholder="Enter your admin username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <div className="password-wrapper">
              <input
                id="password"
                name="login-secret-field"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />

              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "SIGNING IN..." : "LOGIN"}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {rfidReady
              ? "RFID Ready — Tap your admin card"
              : "Activating RFID reader..."}
          </p>

          <span>TVETMARA Sungai Petani</span>
        </div>
      </div>
    </div>
  );
}

export default Login;
