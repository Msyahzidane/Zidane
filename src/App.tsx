import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Wifi,
  WifiOff,
  Power,
  Settings,
  Thermometer,
  Droplets,
  Server,
  Terminal,
  Activity
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

// Define the shape of our historical sensor data
interface SensorData {
  time: string;
  temp: number;
  hum: number;
}

// Define command logging shape
interface CommandLog {
  id: string;
  command: string;
  timestamp: Date;
  latencyMs?: number;
  status: 'pending' | 'success' | 'error';
}

export default function App() {
  // App State
  const [ipAddress, setIpAddress] = useState<string>('10.64.143.35');
  const [ipInput, setIpInput] = useState<string>('10.64.143.35');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  
  // Device State
  const [relays, setRelays] = useState<boolean[]>([false, false, false, false]);
  const [currentTemp, setCurrentTemp] = useState<number>(0);
  const [currentHum, setCurrentHum] = useState<number>(0);
  const [sensorHistory, setSensorHistory] = useState<SensorData[]>([]);
  
  // Logs & Latency State
  const [commandHistory, setCommandHistory] = useState<CommandLog[]>([]);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  // Voice Command State
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [commandFeedback, setCommandFeedback] = useState<string>('');

  // Simulation interval ref
  const simulationRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Speech Recognition (Chrome/Edge only for now)
  const SpeechRecognition = 
    (window as any).SpeechRecognition || 
    (window as any).webkitSpeechRecognition;
  const recognition = useRef<any>(null);

  useEffect(() => {
    if (SpeechRecognition) {
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.lang = 'id-ID'; // Indonesian Language as per prompt context
      
      recognition.current.onresult = (event: any) => {
        const current = event.resultIndex;
        const transcriptText = event.results[current][0].transcript;
        setTranscript(transcriptText);
        processVoiceCommand(transcriptText.toLowerCase());
      };

      recognition.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognition.current?.stop();
    } else {
      if (recognition.current) {
        recognition.current.start();
        setIsListening(true);
        setTranscript('');
        setCommandFeedback('Mendengarkan...');
      } else {
        setCommandFeedback('Browser ini tidak mendukung Voice Recognition');
      }
    }
  };

  // Process Indonesian Voice Commands
  const processVoiceCommand = (cmd: string) => {
    let handled = false;
    
    // Relay Commands
    if (cmd.includes('nyalakan') || cmd.includes('hidupkan')) {
      if (cmd.includes('relay satu') || cmd.includes('relay 1')) { setRelay(0, true); handled = true; }
      else if (cmd.includes('relay dua') || cmd.includes('relay 2')) { setRelay(1, true); handled = true; }
      else if (cmd.includes('relay tiga') || cmd.includes('relay 3')) { setRelay(2, true); handled = true; }
      else if (cmd.includes('relay empat') || cmd.includes('relay 4')) { setRelay(3, true); handled = true; }
      else if (cmd.includes('semua') || cmd.includes('semuanya')) { handleMacro('all_on'); handled = true; }
    } 
    else if (cmd.includes('matikan') || cmd.includes('padamkan')) {
      if (cmd.includes('relay satu') || cmd.includes('relay 1')) { setRelay(0, false); handled = true; }
      else if (cmd.includes('relay dua') || cmd.includes('relay 2')) { setRelay(1, false); handled = true; }
      else if (cmd.includes('relay tiga') || cmd.includes('relay 3')) { setRelay(2, false); handled = true; }
      else if (cmd.includes('relay empat') || cmd.includes('relay 4')) { setRelay(3, false); handled = true; }
      else if (cmd.includes('semua') || cmd.includes('semuanya')) { handleMacro('all_off'); handled = true; }
    }
    
    // Macro Commands
    else if (cmd.includes('variasi satu') || cmd.includes('variasi 1')) { handleMacro('v1'); handled = true; }
    else if (cmd.includes('variasi dua') || cmd.includes('variasi 2')) { handleMacro('v2'); handled = true; }

    if (handled) {
      setCommandFeedback(`Perintah dijalankan: "${cmd}"`);
    } else {
      setCommandFeedback(`Perintah tidak dikenali: "${cmd}"`);
    }
  };

  // Direct IP Communication Methods
  // Since we don't have access to the actual hardware, this simulates the connection 
  // and acts as a placeholder for actual local IP fetch mechanisms.
  const addCommandLog = (command: string) => {
    const logId = Math.random().toString(36).substring(7);
    const newLog: CommandLog = {
      id: logId,
      command,
      timestamp: new Date(),
      status: 'pending'
    };
    setCommandHistory(prev => [newLog, ...prev].slice(0, 50));
    return logId;
  };

  const completeCommandLog = (id: string, latencyMs: number, status: 'success' | 'error') => {
    setCommandHistory(prev => prev.map(log => 
      log.id === id ? { ...log, latencyMs, status } : log
    ));
  };

  const fetchStatusFromESP32 = useCallback(async () => {
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      // Send request to REAL ESP32
      const response = await fetch(`http://${ipAddress}/api/status`, { 
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const data = await response.json();
      const latency = Math.round(performance.now() - start);

      setCurrentTemp(data.temperature || 0);
      setCurrentHum(data.humidity || 0);
      if (data.relays && Array.isArray(data.relays)) {
        setRelays(data.relays);
      }
      
      setSensorHistory(prev => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const newData = [...prev, { time: timeStr, temp: data.temperature || 0, hum: data.humidity || 0 }];
        if (newData.length > 20) newData.shift(); // Keep last 20 points
        return newData;
      });
      
      setIsConnected(true);
      setLastLatency(latency);
      setConnectionError('');
    } catch (error: any) {
      setIsConnected(false);
      let errorMsg = 'Gagal terhubung.';
      if (error.name === 'AbortError') {
         errorMsg = 'Koneksi timeout (ESP32 tidak merespon).';
      } else {
         errorMsg = error.message || 'Error jaringan (CORS/Private Network blocked).';
      }
      setConnectionError(`Error: ${errorMsg}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [ipAddress]);

  const setRelay = async (index: number, state: boolean) => {
    // Optimistic UI Update
    const newRelays = [...relays];
    newRelays[index] = state;
    setRelays(newRelays);
    
    const commandName = `Relay ${index + 1} ${state ? 'ON' : 'OFF'}`;
    const logId = addCommandLog(commandName);
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    try {
      await fetch(`http://${ipAddress}/api/relay?id=${index + 1}&state=${state ? 1 : 0}`, { 
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - start);
      completeCommandLog(logId, latency, 'success');
      setLastLatency(latency);
      setConnectionError('');
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error("Failed to set relay", e);
      setIsConnected(false);
      
      let errorMsg = 'Gagal mengirim perintah.';
      if (e.name === 'AbortError') {
         errorMsg = 'Koneksi timeout (ESP32 tidak merespon).';
      } else {
         errorMsg = e.message || 'Error jaringan (Failed to fetch).';
      }
      setConnectionError(`Error: ${errorMsg}`);
      
      completeCommandLog(logId, Math.round(performance.now() - start), 'error');
    }
  };

  const handleMacro = async (action: string) => {
    const logId = addCommandLog(`Makro: ${action.toUpperCase()}`);
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    try {
      if (action === 'all_on') setRelays([true, true, true, true]);
      if (action === 'all_off') setRelays([false, false, false, false]);
      
      await fetch(`http://${ipAddress}/api/macro?action=${action}`, { 
        method: 'GET',
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      setCommandFeedback(`Makro dijalankan: ${action.toUpperCase()}`);
      
      const latency = Math.round(performance.now() - start);
      completeCommandLog(logId, latency, 'success');
      setLastLatency(latency);
      setConnectionError('');
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error("Failed to execute macro", e);
      setIsConnected(false);
      
      let errorMsg = 'Gagal menjalankan makro.';
      if (e.name === 'AbortError') {
         errorMsg = 'Koneksi timeout (ESP32 tidak merespon).';
      } else {
         errorMsg = e.message || 'Error jaringan (Failed to fetch).';
      }
      setConnectionError(`Error: ${errorMsg}`);
      
      completeCommandLog(logId, Math.round(performance.now() - start), 'error');
    }
  };

  // Start polling
  useEffect(() => {
    if (simulationRef.current) clearInterval(simulationRef.current);
    
    // Simulate initial connection and periodic updates
    fetchStatusFromESP32();
    simulationRef.current = setInterval(() => {
      fetchStatusFromESP32();
    }, 2000);

    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current);
    };
  }, [ipAddress, fetchStatusFromESP32]);

  return (
    <div className="h-screen flex flex-col lg:grid lg:grid-cols-[280px_1fr] lg:grid-rows-[80px_1fr_100px] overflow-hidden bg-[#09090b] text-[#e4e4e7] font-sans">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col row-span-3 bg-[#111114] border-r border-[#27272a] p-6 z-10 relative">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Server className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">ESP32 CORE</span>
        </div>
        
        <nav className="flex flex-col gap-2">
          <div className="p-3 rounded-lg bg-[#27272a] text-white cursor-pointer font-medium">Dashboard</div>
          <div className="p-3 rounded-lg text-[#a1a1aa] hover:bg-[#27272a]/50 cursor-pointer transition-colors duration-200">Telegram Bot</div>
          <div className="p-3 rounded-lg text-[#a1a1aa] hover:bg-[#27272a]/50 cursor-pointer transition-colors duration-200">Sensor Logs</div>
          <div className="p-3 rounded-lg text-[#a1a1aa] hover:bg-[#27272a]/50 cursor-pointer transition-colors duration-200">Automation</div>
          <div className="p-3 rounded-lg text-[#a1a1aa] hover:bg-[#27272a]/50 cursor-pointer transition-colors duration-200">Network Config</div>
        </nav>

        <div className="mt-auto pt-10">
           <div className="text-[11px] text-[#71717a] uppercase mb-3 font-semibold tracking-wider">Direct IP Control</div>
           <div className="flex items-center justify-between bg-[#09090b] p-3 rounded-lg border border-[#27272a] cursor-default transition-colors">
             <span className="font-mono text-[13px] text-[#a1a1aa] transition-colors">{ipAddress}</span>
             <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
           </div>
        </div>
      </aside>

      {/* Header */}
      <header className="col-start-2 flex items-center justify-between px-6 lg:px-8 py-4 lg:py-0 border-b border-[#27272a] bg-[#09090b] z-10 relative shadow-sm">
        <div>
          <h1 className="text-lg m-0 font-semibold text-[#e4e4e7]">Home Automation Hub</h1>
          <p className="text-[13px] text-[#71717a] m-0 mt-1">Status: System operational and monitoring</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex gap-3">
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-[#27272a] text-white border border-[#3f3f46] hover:bg-[#3f3f46] transition-colors flex items-center gap-1 shadow-sm"
              title="Buka aplikasi ini di tab baru (di luar AI Studio iframe)"
            >
              Buka di Tab Baru ↗
            </a>
            <span className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-[#1e1b4b] text-[#818cf8] border border-[#312e81]">
              DIRECT MODE ACTIVE
            </span>
            <span className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${
              isConnected 
                ? 'bg-[#064e3b] text-[#34d399] border-[#065f46]'
                : 'bg-[#450a0a] text-[#f87171] border-[#7f1d1d]'
            }`}>
              ESP32 {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <a 
            href={window.location.href} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="sm:hidden p-2 bg-[#27272a] border border-[#3f3f46] rounded-lg text-white hover:bg-[#3f3f46] transition-colors"
          >
            ↗
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="col-start-2 p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 bg-[radial-gradient(circle_at_top_right,#18181b,#09090b)] overflow-y-auto">
        
        {/* Left Column: Relay Controls */}
        <section className="flex flex-col gap-4 shrink-0 h-min">
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 mb-2">
            <h2 className="text-[14px] text-[#71717a] m-0 mb-4 uppercase tracking-[0.1em] font-semibold flex items-center gap-2">
               <Wifi className="w-4 h-4 text-[#818cf8]" />
               Network Gateway
            </h2>
            <div className="flex items-center gap-0">
              <span className="px-3 py-2 bg-[#09090b] border border-[#3f3f46] border-r-0 rounded-l-lg text-[#71717a] text-sm h-[38px] flex items-center">http://</span>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                className="flex-1 w-full bg-[#09090b] border border-[#3f3f46] p-2 text-sm text-white focus:outline-none focus:border-[#10b981] transition-colors h-[38px]"
                placeholder="10.64.143.35"
              />
              <button 
                onClick={() => setIpAddress(ipInput)}
                className="bg-[#10b981] hover:bg-[#059669] text-white px-4 py-2 text-sm rounded-r-lg font-semibold transition-colors h-[38px]"
              >
                Connect
              </button>
            </div>
            
            {!isConnected && connectionError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="text-red-400 text-[12px] font-medium space-y-2 leading-relaxed">
                  <p>{connectionError}</p>
                  {connectionError.includes('timeout') ? (
                    <p className="text-[11px] text-red-300/80">Pastikan ESP32 menyala dan berada di jaringan yang sama. Coba ping {ipAddress} dari terminal.</p>
                  ) : (
                    <div className="text-[11px] text-red-300/80 pt-2 border-t border-red-500/20">
                       Browser memblokir koneksi API ke Local IP saat ini.<br/>
                       1. Klik tombol <strong>Buka di Tab Baru ↗</strong> di <strong>pojok kanan atas</strong> layar Anda.<br/>
                       2. Di tab browser yang baru terbuka, klik logo <strong>gembok/pengaturan situs</strong> di sebelah kiri URL.<br/>
                       3. Cari <strong>Insecure Content</strong> lalu ubah menjadi <strong>Allow / Izinkan</strong>.<br/>
                       4. Reload halaman dan koneksikan IP ESP32 lagi.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <h2 className="text-[14px] text-[#71717a] m-0 mt-2 uppercase tracking-[0.1em] font-semibold">Relay Controls</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {relays.map((isOn, idx) => (
              <div key={idx} className={`bg-[#18181b] border rounded-xl p-5 transition-all duration-300 ${
                isOn ? 'border-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.15)] bg-[#18181b]/90' : 'border-[#27272a] hover:border-[#3f3f46]'
              }`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="font-semibold text-[#e4e4e7]">Relay {idx + 1}</div>
                  <div 
                    onClick={() => setRelay(idx, !isOn)}
                    className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-300 ${
                      isOn ? 'bg-[#10b981]' : 'bg-[#3f3f46]'
                    }`}
                  >
                    <div className={`absolute w-5 h-5 bg-white rounded-full top-[2px] transition-all duration-300 shadow-sm ${
                      isOn ? 'left-[26px]' : 'left-[2px]'
                    }`} />
                  </div>
                </div>
                <div className="text-xs text-[#71717a] font-medium">
                  {['Living Room Chandelier', 'Master Bedroom Fan', 'Garden Water Pump', 'External Floodlight'][idx]}
                </div>
                <div className={`text-[10px] mt-2 font-mono ${isOn ? 'text-[#10b981]' : 'text-[#71717a]'}`}>
                  PIN: GPIO {['5', '19', '18', '23'][idx]}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-5 bg-[#09090b] border border-dashed border-[#3f3f46] rounded-xl text-[#a1a1aa] text-[13px]">
            <strong className="block mb-3 text-[#e4e4e7] uppercase text-[11px] tracking-wider">Variasi Program / Makro</strong>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleMacro('all_on')} className="px-4 py-2 text-xs rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#10b981]/50 hover:bg-[#10b981]/10 text-[#10b981] transition-all font-medium">Semua ON</button>
              <button onClick={() => handleMacro('all_off')} className="px-4 py-2 text-xs rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#ef4444]/50 hover:bg-[#ef4444]/10 text-[#ef4444] transition-all font-medium">Semua OFF</button>
              <button onClick={() => handleMacro('v1')} className="px-4 py-2 text-xs rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#818cf8]/50 hover:bg-[#818cf8]/10 text-[#818cf8] transition-all font-medium">▶ Variasi 1</button>
              <button onClick={() => handleMacro('v2')} className="px-4 py-2 text-xs rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#c084fc]/50 hover:bg-[#c084fc]/10 text-[#c084fc] transition-all font-medium">▶ Variasi 2</button>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-4">
             <h3 className="text-[14px] text-[#71717a] m-0 uppercase tracking-[0.1em] font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#818cf8]" />
                Command History
             </h3>
             <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 max-h-[250px] overflow-y-auto flex flex-col gap-2 relative">
                {commandHistory.length === 0 ? (
                  <p className="text-[#71717a] text-sm text-center py-8">Belum ada perintah terekam.</p>
                ) : (
                  commandHistory.map(log => (
                    <div key={log.id} className="flex items-center justify-between py-2 border-b border-[#27272a] last:border-0">
                      <div className="flex items-center gap-3">
                         <div className={`w-2 h-2 rounded-full ${log.status === 'pending' ? 'bg-yellow-500 animate-pulse' : log.status === 'success' ? 'bg-[#10b981]' : 'bg-red-500'}`} />
                         <span className={`text-[13px] ${log.status === 'pending' ? 'text-[#a1a1aa]' : 'text-[#e4e4e7]'}`}>{log.command}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-mono">
                         <span className="text-[#71717a]">{log.timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                         {log.latencyMs !== undefined && (
                           <span className={`w-[45px] text-right ${log.latencyMs < 100 ? 'text-[#10b981]' : log.latencyMs < 300 ? 'text-yellow-500' : 'text-red-500'}`}>{log.latencyMs}ms</span>
                         )}
                      </div>
                    </div>
                  ))
                )}
             </div>
          </div>
        </section>

        {/* Right Column: Sensor Analytics */}
        <section className="flex flex-col gap-4 pb-8 shrink-0 h-min">
          <h2 className="text-[14px] text-[#71717a] m-0 uppercase tracking-[0.1em] font-semibold">Sensor Analytics</h2>
          
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 hover:border-[#3f3f46] transition-colors h-48 flex flex-col justify-between">
            <div className="flex justify-between items-center z-10 relative">
              <span className="text-[#a1a1aa] text-[14px] font-medium flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-[#ef4444]" />
                Temperature (DHT11)
              </span>
              <span className="text-[28px] font-bold text-[#ef4444] tracking-tight">{currentTemp.toFixed(1)}°C</span>
            </div>
            <div className="h-[90px] w-full -mx-6 px-6 -mb-6 relative overflow-hidden -mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sensorHistory} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111114', borderColor: '#27272a', borderRadius: '0.5rem', color: '#e4e4e7', fontSize: '12px' }}
                    itemStyle={{ color: '#ef4444', fontWeight: 600 }} 
                    labelStyle={{ display: 'none' }}
                  />
                  <Area type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTemp)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 hover:border-[#3f3f46] transition-colors h-48 flex flex-col justify-between">
            <div className="flex justify-between items-center z-10 relative">
              <span className="text-[#a1a1aa] text-[14px] font-medium flex items-center gap-2">
                <Droplets className="w-4 h-4 text-[#3b82f6]" />
                Humidity (DHT11)
              </span>
              <span className="text-[28px] font-bold text-[#3b82f6] tracking-tight">{currentHum.toFixed(1)}%</span>
            </div>
            <div className="h-[90px] w-full -mx-6 px-6 -mb-6 relative overflow-hidden -mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sensorHistory} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111114', borderColor: '#27272a', borderRadius: '0.5rem', color: '#e4e4e7', fontSize: '12px' }}
                    itemStyle={{ color: '#3b82f6', fontWeight: 600 }} 
                    labelStyle={{ display: 'none' }}
                  />
                  <Area type="monotone" dataKey="hum" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorHum)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
        </section>
      </main>

      {/* Footer Status */}
      <footer className="col-start-2 border-t border-[#27272a] px-8 py-4 lg:py-0 flex flex-col sm:flex-row gap-4 items-center justify-between bg-[#09090b] z-10 relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button
            onClick={toggleListening}
            className={`w-14 h-14 shrink-0 rounded-full flex items-center justify-center border transition-all duration-300 ${
              isListening 
                ? 'bg-[#18181b] border-[#ef4444] text-[#ef4444] shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                : 'bg-[#27272a] border-[#3f3f46] text-[#a1a1aa] hover:text-white hover:border-[#4f4f56]'
            }`}
          >
            <Mic className={`w-6 h-6 transition-transform ${isListening ? 'scale-110' : ''}`} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#71717a] uppercase font-semibold tracking-wider">Voice Assistant</div>
            <div className={`text-[14px] font-medium truncate ${isListening ? 'text-[#e4e4e7]' : 'text-[#a1a1aa]'}`}>
               {isListening ? 'Listening...' : (transcript ? `"${transcript}"` : (commandFeedback || 'Ketuk mic untuk perintah suara'))}
            </div>
          </div>
        </div>
        
        <div className="text-left w-full sm:w-auto sm:text-right hidden sm:block">
          <div className="text-[11px] text-[#71717a] font-medium">Uptime: 04d 12h 45m</div>
          <div className={`text-[12px] font-medium ${isConnected ? (lastLatency && lastLatency > 300 ? 'text-red-500' : 'text-[#10b981]') : 'text-[#71717a]'}`}>
             Direct Link Latency: {isConnected ? (lastLatency !== null ? `${lastLatency}ms` : '...') : '--'}
          </div>
        </div>
      </footer>
    </div>
  );
}

