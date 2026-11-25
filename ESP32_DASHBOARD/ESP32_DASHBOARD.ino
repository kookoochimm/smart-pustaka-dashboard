#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

// ================= WIFI =================

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

// ================= CLOUD BACKEND =================

const char* RFID_SCAN_URL =
  "https://smart-pustaka-dashboard-backend.onrender.com/api/rfid/scan";

// ================= RC522 WIRING =================

#define SS_PIN   5
#define RST_PIN  22
#define SCK_PIN  18
#define MISO_PIN 19
#define MOSI_PIN 23

MFRC522 rfid(SS_PIN, RST_PIN);

// ================= SCAN SETTINGS =================

String lastUID = "";

unsigned long lastScanTime = 0;

const unsigned long SCAN_COOLDOWN_MS = 2500;

// ================= WIFI CONFIGURATION =================

bool connectWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.println();
  Serial.println("Connecting to Laptop Hotspot...");

  // Stop previous connection attempt

  WiFi.disconnect(false, false);

  delay(500);

  // Configure Wi-Fi

  WiFi.mode(WIFI_STA);

  WiFi.setSleep(false);

  WiFi.setAutoReconnect(false);

  delay(300);

  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);

  // Start connection

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();

  // Wait maximum 20 seconds

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startAttempt < 20000
  ) {

    delay(500);

    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println("==============================");
    Serial.println("WIFI CONNECTED!");
    Serial.println("==============================");

    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());

    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("Signal Strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    Serial.print("Cloud API: ");
    Serial.println(RFID_SCAN_URL);

    return true;
  }

  Serial.println("WIFI CONNECTION FAILED!");

  WiFi.disconnect(false, false);

  return false;
}

// ================= UID HELPERS =================

String getUID() {

  String uid;

  uid.reserve(rfid.uid.size * 2);

  for (byte i = 0; i < rfid.uid.size; i++) {

    if (rfid.uid.uidByte[i] < 0x10) {
      uid += "0";
    }

    uid += String(
      rfid.uid.uidByte[i],
      HEX
    );
  }

  uid.toUpperCase();

  return uid;
}

// ================= UID VALIDATION =================

bool isSupportedUID(const String& uid) {

  if (uid.length() != 8 && uid.length() != 14) {
    return false;
  }

  for (unsigned int i = 0; i < uid.length(); i++) {

    const char c = uid.charAt(i);

    if (!(
      (c >= '0' && c <= '9') ||
      (c >= 'A' && c <= 'F')
    )) {

      return false;
    }
  }

  return true;
}

// ================= SEND UID TO CLOUD API =================

void sendUIDToBackend(const String& uid) {

  // Check Wi-Fi connection

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("Wi-Fi disconnected. Reconnecting...");

    if (!connectWiFi()) {

      Serial.println("UID not sent: Wi-Fi unavailable.");

      return;
    }
  }

  WiFiClientSecure secureClient;

  // For initial testing only

  secureClient.setInsecure();

  HTTPClient http;

  http.setTimeout(15000);

  Serial.println();
  Serial.println("Sending RFID UID to SMART PUSTAKA cloud...");

  if (!http.begin(secureClient, RFID_SCAN_URL)) {

    Serial.println("ERROR: Could not initialize HTTPS connection.");

    return;
  }

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  const String payload = "{\"uid\":\"" + uid + "\"}";

  Serial.print("UID: ");
  Serial.println(uid);

  const int httpCode = http.POST(payload);

  Serial.print("HTTP status: ");
  Serial.println(httpCode);

  if (httpCode > 0) {

    const String response = http.getString();

    Serial.print("API response: ");
    Serial.println(response);

    if (httpCode >= 200 && httpCode < 300) {

      Serial.println("SUCCESS: UID received by dashboard backend.");

    } else if (httpCode == 400) {

      Serial.println("ERROR 400: Backend rejected UID format.");

    } else if (httpCode == 404) {

      Serial.println("ERROR 404: Check Render API route.");

    } else if (httpCode == 405) {

      Serial.println("ERROR 405: HTTP method/route mismatch.");

    } else if (httpCode >= 500) {

      Serial.println("ERROR: Dashboard backend/server error.");

    } else {

      Serial.println("WARNING: Unexpected HTTP response.");
    }

  } else {

    Serial.print("HTTPS request failed: ");

    Serial.println(http.errorToString(httpCode));

    Serial.println("Check Wi-Fi, Render URL and internet access.");
  }

  http.end();

  secureClient.stop();
}

// ================= SETUP =================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();

  Serial.println("====================================");
  Serial.println(" SMART PUSTAKA DASHBOARD RFID");
  Serial.println(" ESP32 + RC522 + HTTPS CLOUD API");
  Serial.println("====================================");

  // RC522 initialization

  SPI.begin(
    SCK_PIN,
    MISO_PIN,
    MOSI_PIN,
    SS_PIN
  );

  rfid.PCD_Init();

  delay(100);

  const byte version = rfid.PCD_ReadRegister(
    rfid.VersionReg
  );

  Serial.print("RC522 firmware: 0x");

  Serial.println(version, HEX);

  if (version == 0x00 || version == 0xFF) {

    Serial.println(
      "WARNING: RC522 not detected. Check wiring and 3.3V power."
    );

  } else {

    Serial.println("RC522 initialized.");
  }

  // Wi-Fi initialization

  if (!connectWiFi()) {

    Serial.println("Wi-Fi unavailable.");
    Serial.println("Scanner will retry automatically.");

  }

  Serial.println();

  Serial.println("RFID scanner ready.");

  Serial.println(
    "Tap ADMIN card (8 hex characters) or scan target card/tag."
  );

  Serial.println("User/admin card: expected 8 hex characters.");

  Serial.println("Book tag: expected 14 hex characters.");

  Serial.println("====================================");
}

// ================= MAIN LOOP =================

void loop() {

  // Check Wi-Fi connection

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("Wi-Fi disconnected.");

    if (!connectWiFi()) {

      delay(5000);

      return;
    }
  }

  // Detect RFID card

  if (!rfid.PICC_IsNewCardPresent()) {

    delay(30);

    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {

    delay(30);

    return;
  }

  const String uid = getUID();

  const unsigned long now = millis();

  Serial.println();

  Serial.println("------------------------------------");

  Serial.print("Scanned UID: ");
  Serial.println(uid);

  Serial.print("UID length: ");
  Serial.println(uid.length());

  // Check duplicate scan

  const bool duplicate =
    (uid == lastUID &&
     now - lastScanTime < SCAN_COOLDOWN_MS);

  if (duplicate) {

    Serial.println("Duplicate scan ignored (cooldown).");

  } else if (!isSupportedUID(uid)) {

    Serial.println(
      "Unsupported UID length/format. Expected 8 or 14 hex characters."
    );

  } else {

    lastUID = uid;

    lastScanTime = now;

    sendUIDToBackend(uid);
  }

  rfid.PICC_HaltA();

  rfid.PCD_StopCrypto1();

  delay(150);
}
