#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <WebServer.h>

// ===================== KONFIGURASI =====================
const char* ssid     = "oths";
const char* password = "12345678";

#define BOT_TOKEN "8916018671:AAE9KODyqeoPfYemGsESkDYsN8gtsYwy1nQ"
#define CHAT_ID   "8728829519"

// ===================== PIN RELAY =====================
#define RELAY1_PIN 5
#define RELAY2_PIN 19
#define RELAY3_PIN 18
#define RELAY4_PIN 23

// ===================== PIN DHT11 =====================
#define DHT_PIN  4
#define DHT_TYPE DHT11

// ===================== INISIALISASI =====================
DHT dht(DHT_PIN, DHT_TYPE);
WiFiClientSecure client;
UniversalTelegramBot bot(BOT_TOKEN, client);
WebServer server(80); // Inisialisasi WebServer di port 80

// Status relay (true = ON, false = OFF)
bool relayStatus[4] = {false, false, false, false};
int relayPins[4]    = {RELAY1_PIN, RELAY2_PIN, RELAY3_PIN, RELAY4_PIN};

unsigned long lastTimeBotRan = 0;
const int botRequestDelay   = 1000; // Cek pesan setiap 1 detik

// Flag variasi sedang berjalan (non-blocking)
bool variasiRunning = false;
int  variasiType    = 0;   // 1 atau 2
int  variasiStep    = 0;   // langkah saat ini (0..19 untuk 5 siklus x 4 relay x 2 fase)
unsigned long variasiLastStep = 0;
const int VARIASI_DELAY = 500; // jeda antar relay dalam ms
String variasiChatId    = "";

// Urutan relay untuk tiap variasi (index 0-based)
int urutan1[4] = {0, 1, 2, 3}; // 1,2,3,4
int urutan2[4] = {0, 2, 1, 3}; // 1,3,2,4

// ===================== FUNGSI CORS =======================
// Agar aplikasi web (React) bisa mengakses IP secara local
void sendCORSHeader() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Access-Control-Allow-Private-Network", "true"); // Dibutuhkan oleh Chrome versi terbaru
}

// ===================== FUNGSI RELAY =====================
void setRelay(int index, bool state) {
  if(index < 0 || index > 3) return;
  relayStatus[index] = state;
  // Relay aktif LOW: LOW = ON, HIGH = OFF
  digitalWrite(relayPins[index], state ? LOW : HIGH);
}

// ===================== FUNGSI STATUS (Relay + Sensor) =====================
String getStatusAll() {
  float suhu       = dht.readTemperature();
  float kelembapan = dht.readHumidity();

  String msg = "📋 *Status ESP32*\n\n";

  msg += "🔌 *Relay:*\n";
  for (int i = 0; i < 4; i++) {
    msg += "  Relay " + String(i + 1) + " (Pin " + String(relayPins[i]) + "): ";
    msg += relayStatus[i] ? "✅ ON" : "❌ OFF";
    msg += "\n";
  }

  msg += "\n🌡️ *Sensor DHT11:*\n";
  if (isnan(suhu) || isnan(kelembapan)) {
    msg += "  ⚠️ Gagal membaca sensor!";
  } else {
    msg += "  Suhu      : " + String(suhu, 1) + " °C\n";
    msg += "  Kelembapan: " + String(kelembapan, 1) + " %";
  }
  return msg;
}

// ===================== WEBSERVER HANDLERS =================
void handleOptions() {
  sendCORSHeader();
  server.send(204);
}

void handleStatus() {
  float temp = dht.readTemperature();
  if (isnan(temp)) temp = 0.0;
  float hum = dht.readHumidity();
  if (isnan(hum)) hum = 0.0;
  
  StaticJsonDocument<200> doc;
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  JsonArray relays = doc.createNestedArray("relays");
  for (int i = 0; i < 4; i++) relays.add(relayStatus[i]);

  String response;
  serializeJson(doc, response);
  sendCORSHeader();
  server.send(200, "application/json", response);
}

void handleRelay() {
  sendCORSHeader();
  if (server.hasArg("id") && server.hasArg("state")) {
    int id = server.arg("id").toInt(); // 1..4
    int state = server.arg("state").toInt(); // 1 or 0
    if (id >= 1 && id <= 4) {
      setRelay(id - 1, state == 1);
      server.send(200, "application/json", "{\"status\":\"success\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid ID\"}");
    }
  } else {
    server.send(400, "application/json", "{\"status\":\"error\"}");
  }
}

void handleMacro() {
  sendCORSHeader();
  if (server.hasArg("action")) {
    String action = server.arg("action");
    if (action == "all_on") {
      for (int i = 0; i < 4; i++) setRelay(i, true);
    } else if (action == "all_off") {
      variasiRunning = false;
      for (int i = 0; i < 4; i++) setRelay(i, false);
    } else if (action == "v1") {
      variasiRunning = true;
      variasiType = 1;
      variasiStep = 0;
      variasiLastStep = millis();
    } else if (action == "v2") {
      variasiRunning = true;
      variasiType = 2;
      variasiStep = 0;
      variasiLastStep = millis();
    }
    server.send(200, "application/json", "{\"status\":\"success\"}");
  } else {
    server.send(400, "application/json", "{\"status\":\"error\"}");
  }
}

// ===================== KIRIM KEYBOARD MENU =====================
void sendMainMenu(String chat_id) {
  String keyboard = "[[\"r1_on\",\"r1_off\",\"r2_on\",\"r2_off\"],"
                    "[\"r3_on\",\"r3_off\",\"r4_on\",\"r4_off\"],"
                    "[\"all_on\",\"all_off\"],"
                    "[\"v1\",\"v2\"],"
                    "[\"status\",\"help\"]]";
  bot.sendMessageWithReplyKeyboard(chat_id, "🏠 *Menu Kontrol ESP32*\nPilih perintah:", "Markdown", keyboard, true);
}

// ===================== VARIASI NON-BLOCKING =====================
void tickVariasi() {
  if (!variasiRunning) return;
  if (millis() - variasiLastStep < VARIASI_DELAY) return;

  int* urutan = (variasiType == 1) ? urutan1 : urutan2;
  int siklus    = variasiStep / 8;
  int stepDalam = variasiStep % 8;
  bool faseON   = (stepDalam < 4);
  int relayIdx  = faseON ? stepDalam : (stepDalam - 4);
  int r = urutan[relayIdx];
  
  setRelay(r, faseON);
  
  variasiStep++;
  variasiLastStep = millis();

  if (variasiStep >= 40) {
    for (int i = 0; i < 4; i++) setRelay(i, false);
    variasiRunning = false;
    if (variasiChatId != "") {
      bot.sendMessage(variasiChatId, "✅ *Variasi " + String(variasiType) + " selesai!*\n\n" + getStatusAll(), "Markdown");
      variasiChatId = "";
    }
  }
}

// ===================== PROSES PESAN TELEGRAM =====================
void handleNewMessages(int numNewMessages) {
  for (int i = 0; i < numNewMessages; i++) {
    String chat_id = bot.messages[i].chat_id;
    String text    = bot.messages[i].text;
    String from    = bot.messages[i].from_name;

    if (chat_id != CHAT_ID) {
      bot.sendMessage(chat_id, "⛔ Akses ditolak.", "");
      continue;
    }

    if (text == "/start" || text == "help" || text == "/help") {
      String msg = "👋 Halo, *" + from + "*!\n\n";
      bot.sendMessage(chat_id, msg, "Markdown");
      sendMainMenu(chat_id);
    }
    else if (text == "menu" || text == "/menu") sendMainMenu(chat_id);
    else if (text == "status" || text == "/status") bot.sendMessage(chat_id, getStatusAll(), "Markdown");
    else if (text == "all_on") {
      if (variasiRunning) bot.sendMessage(chat_id, "⚠️ Variasi sedang berjalan, tunggu selesai.", "");
      else {
        for (int r = 0; r < 4; r++) setRelay(r, true);
        bot.sendMessage(chat_id, "✅ *Semua Relay ON!*\n\n" + getStatusAll(), "Markdown");
      }
    }
    else if (text == "all_off") {
      variasiRunning = false;
      for (int r = 0; r < 4; r++) setRelay(r, false);
      bot.sendMessage(chat_id, "❌ *Semua Relay OFF!*\n\n" + getStatusAll(), "Markdown");
    }
    else if (text == "r1_on") { setRelay(0, true); bot.sendMessage(chat_id, "✅ *Relay 1 ON*", "Markdown"); }
    else if (text == "r1_off") { setRelay(0, false); bot.sendMessage(chat_id, "❌ *Relay 1 OFF*", "Markdown"); }
    else if (text == "r2_on") { setRelay(1, true); bot.sendMessage(chat_id, "✅ *Relay 2 ON*", "Markdown"); }
    else if (text == "r2_off") { setRelay(1, false); bot.sendMessage(chat_id, "❌ *Relay 2 OFF*", "Markdown"); }
    else if (text == "r3_on") { setRelay(2, true); bot.sendMessage(chat_id, "✅ *Relay 3 ON*", "Markdown"); }
    else if (text == "r3_off") { setRelay(2, false); bot.sendMessage(chat_id, "❌ *Relay 3 OFF*", "Markdown"); }
    else if (text == "r4_on") { setRelay(3, true); bot.sendMessage(chat_id, "✅ *Relay 4 ON*", "Markdown"); }
    else if (text == "r4_off") { setRelay(3, false); bot.sendMessage(chat_id, "❌ *Relay 4 OFF*", "Markdown"); }
    else if (text == "v1") {
      if (variasiRunning) bot.sendMessage(chat_id, "⚠️ Variasi sedang berjalan!", "");
      else {
        variasiRunning = true; variasiType = 1; variasiStep = 0; variasiLastStep = millis(); variasiChatId = chat_id;
        bot.sendMessage(chat_id, "▶️ *Variasi 1 dimulai!*\nUrutan: 1→2→3→4, sebanyak 5 siklus.", "Markdown");
      }
    }
    else if (text == "v2") {
      if (variasiRunning) bot.sendMessage(chat_id, "⚠️ Variasi sedang berjalan!", "");
      else {
        variasiRunning = true; variasiType = 2; variasiStep = 0; variasiLastStep = millis(); variasiChatId = chat_id;
        bot.sendMessage(chat_id, "▶️ *Variasi 2 dimulai!*\nUrutan: 1→3→2→4, sebanyak 5 siklus.", "Markdown");
      }
    }
    else {
      bot.sendMessage(chat_id, "❓ Perintah tidak dikenal. Ketik `help` untuk daftar perintah.", "Markdown");
    }
  }
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);

  for (int i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], HIGH);
  }

  dht.begin();

  Serial.println("\nMenghubungkan ke WiFi: ");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\n✅ WiFi Terhubung! IP: ");
  Serial.println(WiFi.localIP());

  client.setCACert(TELEGRAM_CERTIFICATE_ROOT);

  // Mendaftarkan Enpoints Web Server
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);
  server.on("/api/relay", HTTP_GET, handleRelay);
  server.on("/api/relay", HTTP_OPTIONS, handleOptions);
  server.on("/api/macro", HTTP_GET, handleMacro);
  server.on("/api/macro", HTTP_OPTIONS, handleOptions);

  server.begin();
  Serial.println("✅ Web Server HTTP berjalan (Port 80)");

  bot.sendMessage(CHAT_ID, "🚀 *ESP32 Bot Aktif!*\n📡 IP: " + WiFi.localIP().toString() + "\nKetik `help` untuk memulai.", "Markdown");
}

// ===================== LOOP =====================
void loop() {
  tickVariasi();
  server.handleClient(); // Handle permintaan HTTP/Web

  if (millis() - lastTimeBotRan > botRequestDelay) {
    int numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    while (numNewMessages) {
      handleNewMessages(numNewMessages);
      numNewMessages = bot.getUpdates(bot.last_message_received + 1);
    }
    lastTimeBotRan = millis();
  }
}
