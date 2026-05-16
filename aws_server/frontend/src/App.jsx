/**
 * DeepFace Live — Ana Uygulama Bileşeni (App.jsx) — v2 Optimized
 * ================================================================
 * WebRTC P2P videosu: Tarayıcı kamerası → AWS Signaling → GPU Worker → P2P DeepFake
 *
 * v2 eklemeleri:
 *   - Performans kontrol paneli (çözünürlük/FPS profili seçimi)
 *   - Genişletilmiş istatistikler (RTT, jitter, paket kaybı, kare düşüşü)
 *   - Asenkron modül paneli (ses klonlama / toplantı kaydı / ekran paylaşımı)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { useMediaConstraints, QUALITY_PRESETS } from './hooks/useMediaConstraints';
import VideoTile from './components/VideoTile';


// Mevcut yüz modelleri
const FACE_MODELS = [
  { id: 'face1', label: 'Brad Pitt', emoji: '🧑' },
  { id: 'face2', label: 'Kıvanç Tatlıtuğ', emoji: '👩' },
  { id: 'face3', label: 'Azra', emoji: '🧔' },
  { id: 'face4', label: 'Hande Erçel', emoji: '👱' },
  { id: 'face5', label: 'Burak Özçivit', emoji: '🧓' },
  { id: 'face6', label: 'Aras Bulut İynemli', emoji: '👨‍🦰' },
];

// Bağlantı durumu -> Türkçe metin + dot class
const STATE_MAP = {
  idle: { text: 'Bağlantı bekleniyor', dotClass: 'status-dot--idle' },
  connecting: { text: 'Bağlanıyor…', dotClass: 'status-dot--connecting' },
  connected: { text: 'P2P Bağlandı — WebRTC', dotClass: 'status-dot--connected' },
  failed: { text: 'Bağlantı başarısız', dotClass: 'status-dot--error' },
  closed: { text: 'Bağlantı kapatıldı', dotClass: 'status-dot--idle' },
};

// Benzersiz istemci ID'si (her sayfa yüklemesinde yeni)
const CLIENT_ID = crypto.randomUUID?.() ?? `client-${Date.now()}`;

// AWS Signaling Server URL'si (env'den okunur, default localhost dev için)
const SIGNALING_URL = import.meta.env.VITE_SIGNALING_WS_URL ?? 'ws://localhost:8000';

const AUTO_SCENARIOS = {
  "is_gorusmesi": [
    { speaker: 1, text: "Merhaba, şirketimize yaptığınız başvuru için teşekkürler. Kendinizden bahseder misiniz?" },
    { speaker: 2, text: "Merhaba! Tabi ki, uzun yıllardır yazılım alanında çalışıyorum ve yapay zeka projeleri geliştiriyorum." },
    { speaker: 1, text: "Çok güzel. Peki stres altında çalışmak konusunda nasılsınız?" },
    { speaker: 2, text: "Stres altında oldukça sakin kalırım. Kriz anlarında çözüm üretmeyi severim." },
    { speaker: 1, text: "Harika. Teşekkürler, çok verimli bir görüşme oldu." }
  ],
  "komedi": [
    { speaker: 1, text: "Geçen gün yolda yürüyorum, bir baktım yerde 100 lira var..." },
    { speaker: 2, text: "Eee, ne yaptın? Hemen aldın mı?" },
    { speaker: 1, text: "Eğildim tam alacağım, bir de baktım kamera şakasıymış! Bari 200 koysaydınız dedim." },
    { speaker: 2, text: "Haha! Çok iyiymiş. Sonra ne oldu peki?" },
    { speaker: 1, text: "Sonra otobüse bindim. Şoför bana bir bakış attı... Sanki bileti ben değil de o basacak." }
  ],
  "felsefe": [
    { speaker: 1, text: "Sence yapay zeka bir gün gerçekten bilinç kazanabilir mi?" },
    { speaker: 2, text: "Zor bir soru. Bilincin tanımını bile tam yapamamışken makinelere bunu atfetmek güç." },
    { speaker: 1, text: "Haklısın. Ama düşünebilen ve öğrenebilen bir sistem, belli bir seviyeden sonra bilinci taklit edebilir." },
    { speaker: 2, text: "Taklit etmek ile gerçekten 'hissetmek' aynı şey mi peki? İşte bütün mesele bu." }
  ],
  "acik_oturum": [
    { speaker: 1, text: "Herkese iyi akşamlar. Açık oturumumuza hoş geldiniz. İlk sözü size vermek istiyorum, ne düşünüyorsunuz?" },
    { speaker: 2, text: "Teşekkürler. Ben bu konunun tamamen yanlış anlaşıldığını düşünüyorum. Asıl sorun çok daha derinlerde." },
    { speaker: 3, text: "İkinize de katılmıyorum. Bence konuyu çok abartıyorsunuz, olay sadece basit bir iletişim kopukluğu." },
    { speaker: 1, text: "Peki, bu noktada farklı fikirler var belli ki. Biraz daha detaylandırabilir misiniz?" },
    { speaker: 2, text: "Tabii, hemen anlatayım..." },
    { speaker: 3, text: "Bence de dinleyelim." }
  ]
};

export default function App() {
  const [faceModel, setFaceModel] = useState('face1');
  const [signalingUrl, setSignalingUrl] = useState(SIGNALING_URL);
  const [urlInput, setUrlInput] = useState(SIGNALING_URL);

  // ── Ses Simülasyonu Ayarları ──
  const [voiceModel, setVoiceModel] = useState('');
  const [customVoices, setCustomVoices] = useState([]);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [pitchAdjustment, setPitchAdjustment] = useState(0);
  const [emotion, setEmotion] = useState('neutral');
  const [isLiveMic, setIsLiveMic] = useState(false);

  // Otomatik Röportaj State'leri
  const [scenarioVoices, setScenarioVoices] = useState({});
  const [autoScenario, setAutoScenario] = useState('is_gorusmesi');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  // ── TTS Ayarları ──
  const [ttsInput, setTtsInput] = useState('');
  const [ttsHistory, setTtsHistory] = useState([]);

  // ── Röportaj Ekranı Ayarları ──
  const [interviewHistory, setInterviewHistory] = useState([]);
  const interviewContainerRef = useRef(null);

  useEffect(() => {
    if (interviewContainerRef.current) {
      interviewContainerRef.current.scrollTo({
        top: interviewContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [interviewHistory]);



  // ── useMediaConstraints — Çözünürlük/FPS kısıtları ──
  const { preset, setPreset, constraints, applyToStream, profile } = useMediaConstraints();

  // ── useWebRTC — Ana WebRTC bağlantısı ──
  const {
    connectionState, localStream, remoteStream, stats,
    startConnection, stopConnection, peerConnection,
  } = useWebRTC(signalingUrl, CLIENT_ID, faceModel, constraints);

  const stateInfo = STATE_MAP[connectionState] ?? STATE_MAP.idle;
  const isActive = connectionState === 'connected' || connectionState === 'connecting';

  useEffect(() => {
    // Sunucudan mevcut ses kayıtlarını çek
    fetch('http://localhost:8001/api/voices')
      .then(res => res.json())
      .then(data => {
        if (data.voices) {
          setCustomVoices(data.voices);
          if (data.voices.length > 0) {
            setVoiceModel(data.voices[0]);
            setScenarioVoices({
              1: data.voices[0],
              2: data.voices.length > 1 ? data.voices[1] : data.voices[0],
              3: data.voices.length > 2 ? data.voices[2] : data.voices[0]
            });
          }
        }
      })
      .catch(err => console.error("Ses listesi alınamadı:", err));
  }, []);

  const handleConnect = () => {
    setSignalingUrl(urlInput.trim());
    startConnection();
  };

  // Kalite profili değiştiğinde, açık stream'e de hemen uygula
  const handlePresetChange = (newPreset) => {
    setPreset(newPreset);
    if (localStream) applyToStream(localStream);
  };


  // ===========================================================================
  // Otomatik Röportaj Modu (2 Sesli Karşılıklı Sohbet)
  // ===========================================================================
  const playAutoInterview = async () => {
    if (isAutoPlaying) return;
    setIsAutoPlaying(true);

    const steps = AUTO_SCENARIOS[autoScenario];
    const uniqueSpeakers = [...new Set(steps.map(s => s.speaker))].sort();
    const voicesUsed = uniqueSpeakers.map(id => scenarioVoices[id] || voiceModel).join(', ');

    setInterviewHistory([{ type: 'system', text: `🎬 Otomatik Röportaj Başladı... (${voicesUsed})` }]);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const currentVoice = scenarioVoices[step.speaker] || voiceModel;
      const speakerName = currentVoice ? currentVoice.replace(/_/g, ' ').toUpperCase() : `Kişi ${step.speaker}`;
      const id = Date.now() + i;

      setInterviewHistory(prev => [...prev, { id, speaker: step.speaker, name: speakerName, text: step.text, status: 'loading' }]);

      try {
        const response = await fetch('http://localhost:8001/api/tts_only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: step.text,
            persona: currentVoice || voiceModel,
            rate: speakingRate,
            pitch: pitchAdjustment,
            emotion: emotion
          })
        });
        const data = await response.json();
        if (data.audio_url) {
          setInterviewHistory(prev => prev.map(item => item.id === id ? { ...item, status: 'done', audio_url: data.audio_url } : item));
          await new Promise((resolve) => {
            const audio = new Audio(data.audio_url);
            audio.onended = resolve;
            audio.onerror = resolve;
            audio.play().catch(resolve);
          });
        } else {
          setInterviewHistory(prev => prev.map(item => item.id === id ? { ...item, status: 'error' } : item));
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        setInterviewHistory(prev => prev.map(item => item.id === id ? { ...item, status: 'error' } : item));
        console.error("Auto play error:", err);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setIsAutoPlaying(false);
    setInterviewHistory(prev => [...prev, { type: 'system', text: "✅ Röportaj tamamlandı." }]);
  };

  // / Meeting Simulation handlers
  // ===========================================================================

  // ── SADECE TTS (Metinden Sese) Gönderimi ──
  const handleSendTTS = async () => {
    if (!ttsInput.trim()) return;
    const msg = ttsInput.trim();
    const id = Date.now();
    setTtsInput('');

    setTtsHistory(prev => [...prev, { id, text: msg, status: 'loading' }]);

    try {
      const response = await fetch('http://localhost:8001/api/tts_only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          persona: voiceModel,
          rate: speakingRate,
          pitch: pitchAdjustment,
          emotion: emotion
        })
      });

      if (!response.ok) throw new Error('API yanıt vermedi');

      const data = await response.json();

      if (data.audio_url) {
        setTtsHistory(prev => prev.map(item => item.id === id ? { ...item, status: 'done', audio_url: data.audio_url } : item));
        // İsteğe bağlı otomatik oynatma
        const audio = new Audio(data.audio_url);
        audio.play().catch(e => console.error("Audio playback error:", e));
      } else if (data.error) {
        setTtsHistory(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: data.error } : item));
      }
    } catch (err) {
      console.error(err);
      setTtsHistory(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: 'Bağlantı hatası' } : item));
    }
  };

  const handleMicClick = async () => {
    if (isLiveMic) return;
    setIsLiveMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'custom_voice.webm');

        try {
          const res = await fetch('http://localhost:8001/api/upload-voice', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.status === 'ok') {
            const newPersona = data.persona;
            setCustomVoices(prev => [...prev, newPersona]);
            setVoiceModel(newPersona);
            alert(`🎤 Sesiniz başarıyla klonlandı! (${newPersona})`);
          } else {
            alert("Ses yüklenirken bir hata oluştu: " + (data.message || data.detail || "Bilinmeyen hata"));
          }
        } catch (err) {
          console.error(err);
          alert("Ses yüklenemedi. API bağlantısını kontrol edin.");
        }
        setIsLiveMic(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 5000); // 5 seconds recording

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setIsLiveMic(false);
      alert("Mikrofon izni alınamadı.");
    }
  };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header__logo">
          <div className="header__logo-icon">🎭</div>
          <span>DeepFace Live</span>
        </div>
        <span className="header__badge">WebRTC · P2P · Optimized</span>
      </header>

      {/* ── Main ── */}
      <main className="main">

        <div className="left-column" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* ── Video Stage ── */}
          <section className="video-stage glass-card">
            <div className="video-stage__title">
              📡 Canlı Video Akışı
            </div>

            <div className="video-grid">
              <VideoTile
                stream={localStream}
                label={`Orijinal — ${profile.width}×${profile.height} @ ${profile.fps}fps`}
                placeholder="📷"
              />
              <VideoTile
                stream={remoteStream}
                label={"DeepFake (GPU)"}
                isDeepfake
                placeholder="🎭"
              />
            </div>

            {/* Status Bar */}
            <div className="status-bar" role="status" aria-live="polite">
              <span className={`status-dot ${stateInfo.dotClass}`} />
              <span>{stateInfo.text}</span>
              {connectionState === 'connected' && (
                <span style={{ marginLeft: 'auto', color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {stats.fps | 0} fps · {stats.bitrate} kbps · {stats.rtt}ms RTT
                </span>
              )}
            </div>
          </section>

          {/* ── TTS Stüdyosu ── */}
          <section className="chat-stage glass-card">
            <div className="chat-stage__title">
              🎙️ TTS Stüdyosu (Metinden Sese)
            </div>
            <div className="chat-history" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
              {ttsHistory.length === 0 && (
                <div style={{ color: 'var(--clr-text-muted)', textAlign: 'center', marginTop: '40px' }}>
                  Henüz ses sentezlenmedi. Aşağıdan bir metin yazıp sese çevirin.
                </div>
              )}
              {ttsHistory.map((item, index) => (
                <div key={item.id || index} className="glass-card" style={{ padding: '12px', margin: 0, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <p style={{ marginBottom: '10px', fontSize: '0.95rem', color: 'var(--clr-text)' }}><strong>Metin:</strong> {item.text}</p>
                  {item.status === 'loading' && <p style={{ color: 'var(--clr-primary)', fontSize: '0.85rem', margin: 0 }}>⏳ Ses sentezleniyor...</p>}
                  {item.status === 'error' && <p style={{ color: 'var(--clr-danger)', fontSize: '0.85rem', margin: 0 }}>❌ Hata: {item.error}</p>}
                  {item.status === 'done' && item.audio_url && (
                    <audio controls src={item.audio_url} style={{ width: '100%', height: '40px', outline: 'none' }} />
                  )}
                  {/* Geriye dönük uyumluluk için (eski mesajlar veya system mesajları) */}
                  {!item.status && <p style={{ color: 'var(--clr-text-muted)', fontSize: '0.85rem', margin: 0 }}>{item.type === 'system' ? 'Bilgi: ' : ''}{item.text}</p>}
                </div>
              ))}
            </div>
            <div className="chat-input-area">
              <input
                type="text"
                placeholder="Sese çevrilecek metni yazın..."
                value={ttsInput}
                onChange={e => setTtsInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendTTS()}
              />
              <button className="btn btn--primary" onClick={handleSendTTS} style={{ width: 'auto', padding: '0 24px' }}>Sentezle</button>
            </div>
          </section>

          {/* ── Röportaj Ekranı ── */}
          <section className="chat-stage glass-card" style={{ display: 'flex', flexDirection: 'column', height: '450px' }}>
            <div className="chat-stage__title">
              🎤 Otomatik Röportaj (Görüşme Kaydı)
            </div>
            <div ref={interviewContainerRef} className="chat-history" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: 'rgba(0,0,0,0.15)' }}>
              {interviewHistory.length === 0 && (
                <div style={{ color: 'var(--clr-text-muted)', textAlign: 'center', marginTop: '40px' }}>
                  Henüz bir röportaj başlatılmadı. Sağ menüden konuyu seçip "Röportajı Başlat" butonuna tıklayın.
                </div>
              )}
              {interviewHistory.map((item, index) => {
                if (item.type === 'system') {
                  return <div key={index} style={{ textAlign: 'center', color: 'var(--clr-text-muted)', fontSize: '0.8rem', margin: '8px 0' }}>{item.text}</div>;
                }
                const isRight = item.speaker === 2;
                return (
                  <div key={item.id || index} style={{ display: 'flex', flexDirection: 'column', alignItems: isRight ? 'flex-end' : 'flex-start', width: '100%' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)', marginBottom: '4px', marginLeft: isRight ? 0 : '8px', marginRight: isRight ? '8px' : 0 }}>
                      {item.name}
                    </span>
                    <div style={{
                      maxWidth: '80%',
                      padding: '12px 16px',
                      borderRadius: '16px',
                      borderBottomLeftRadius: !isRight ? '0px' : '16px',
                      borderBottomRightRadius: isRight ? '0px' : '16px',
                      backgroundColor: isRight ? 'var(--clr-primary)' : 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                    }}>
                      <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.4' }}>{item.text}</p>
                      {item.status === 'loading' && <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.7, margin: '8px 0 0 0' }}>⏳ Sentezleniyor...</p>}
                      {item.status === 'done' && item.audio_url && (
                        <audio controls src={item.audio_url} style={{ width: '100%', height: '35px', marginTop: '10px', outline: 'none' }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── Sidebar ── */}
        <aside className="sidebar">

          {/* Yüz Modeli Seçimi */}
          <div className="glass-card">
            <p className="sidebar__section-title">Yüz Modeli Seç</p>
            <div className="face-grid" role="radiogroup" aria-label="Yüz modeli seçimi">
              {FACE_MODELS.map(face => (
                <button
                  key={face.id}
                  id={`face-btn-${face.id}`}
                  className={`face-card${faceModel === face.id ? ' face-card--active' : ''}`}
                  onClick={() => setFaceModel(face.id)}
                  role="radio"
                  aria-checked={faceModel === face.id}
                  title={face.label}
                >
                  <span className="face-card__emoji">{face.emoji}</span>
                  <span>{face.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bağlantı Ayarları */}
          <div className="glass-card">
            <p className="sidebar__section-title">Bağlantı Ayarları</p>

            <div className="input-group" style={{ marginBottom: 14 }}>
              <label htmlFor="signaling-url-input">Signaling Server</label>
              <input
                id="signaling-url-input"
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="wss://your-aws-domain:8000"
                disabled={isActive}
              />
            </div>

            {!isActive ? (
              <button
                id="btn-connect"
                className="btn btn--primary"
                onClick={handleConnect}
                style={{ width: '100%', padding: '12px' }}
              >
                🚀 Bağlantıyı Başlat
              </button>
            ) : (
              <button
                id="btn-disconnect"
                className={`btn ${connectionState === 'connecting' ? 'btn--secondary' : 'btn--danger'}`}
                onClick={stopConnection}
                style={{ width: '100%', padding: '12px' }}
              >
                {connectionState === 'connecting' ? '⏳ Bağlanıyor…' : '⏹ Bağlantıyı Kes'}
              </button>
            )}
          </div>


          {/* ── Ses Simülasyonu Ayarları ── */}
          <div className="glass-card">
            <p className="sidebar__section-title">Ses Simülasyonu</p>

            <div className="input-group" style={{ marginBottom: 12 }}>
              <label htmlFor="voice-select">Ses Modeli</label>
              <select
                id="voice-select"
                className="select-input"
                value={voiceModel}
                onChange={e => setVoiceModel(e.target.value)}
              >
                {customVoices.length === 0 && <option value="" disabled>Kayıtlı ses yok</option>}
                {customVoices.map(voice => (
                  <option key={voice} value={voice}>🎤 {voice.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="slider-group">
              <label>Konuşma Hızı <span className="slider-val">{speakingRate}x</span></label>
              <input
                type="range"
                min="0.5" max="2.0" step="0.1"
                value={speakingRate}
                onChange={e => setSpeakingRate(parseFloat(e.target.value))}
              />
            </div>

            <div className="slider-group">
              <label>Ses Tonu (Pitch) <span className="slider-val">{pitchAdjustment} st</span></label>
              <input
                type="range"
                min="-12" max="12" step="1"
                value={pitchAdjustment}
                onChange={e => setPitchAdjustment(parseInt(e.target.value))}
              />
            </div>

            <div className="input-group" style={{ marginBottom: 16 }}>
              <label htmlFor="emotion-select">Duygu Tonu</label>
              <select
                id="emotion-select"
                className="select-input"
                value={emotion}
                onChange={e => setEmotion(e.target.value)}
              >
                <option value="neutral">Nötr (Varsayılan)</option>
                <option value="happy">Mutlu & Enerjik</option>
                <option value="serious">Ciddi & Otoriter</option>
              </select>
            </div>

            <button
              id="mic-btn"
              className={`btn ${isLiveMic ? 'btn--danger' : 'btn--primary'}`}
              onClick={handleMicClick}
              style={{ width: '100%', padding: '10px' }}
            >
              🎤 {isLiveMic ? 'Dinleniyor... (Durdur)' : 'Canlı Mikrofonu Kullan'}
            </button>
            <p style={{ fontSize: '0.65rem', color: 'var(--clr-text-muted)', marginTop: '8px', textAlign: 'center' }}>
              Ses Klonlama için mikrofondan canlı ses kaydet.
            </p>
          </div>

          {/* Otomatik Çok Kişili Röportaj Paneli */}
          <div className="glass-card">
            <p className="sidebar__section-title">🎤 Otomatik Röportaj (Senaryolu)</p>

            <div className="input-group" style={{ marginBottom: 15 }}>
              <label>Konu (Senaryo)</label>
              <select className="select-input" value={autoScenario} onChange={e => setAutoScenario(e.target.value)} disabled={isAutoPlaying}>
                <option value="is_gorusmesi">💼 İş Görüşmesi (2 Kişi)</option>
                <option value="komedi">🎭 Komedi / Şaka (2 Kişi)</option>
                <option value="felsefe">🧠 Felsefe & Yapay Zeka (2 Kişi)</option>
                <option value="acik_oturum">🗣️ Açık Oturum (3 Kişi)</option>
              </select>
            </div>

            {(() => {
              const currentSteps = AUTO_SCENARIOS[autoScenario];
              const uniqueSpeakers = [...new Set(currentSteps.map(s => s.speaker))].sort();

              return uniqueSpeakers.map(speakerId => (
                <div className="input-group" style={{ marginBottom: 10 }} key={speakerId}>
                  <label>Kişi {speakerId}'in Sesi</label>
                  <select
                    className="select-input"
                    value={scenarioVoices[speakerId] || ''}
                    onChange={e => setScenarioVoices(prev => ({ ...prev, [speakerId]: e.target.value }))}
                    disabled={isAutoPlaying}
                  >
                    {customVoices.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              ));
            })()}

            <button
              className={`btn ${isAutoPlaying ? 'btn--danger' : 'btn--primary'}`}
              onClick={playAutoInterview}
              style={{ width: '100%', padding: '10px', marginTop: '10px' }}
              disabled={isAutoPlaying}
            >
              {isAutoPlaying ? '⏳ Röportaj Oynatılıyor...' : '▶️ Röportajı Başlat'}
            </button>
            <p style={{ fontSize: '0.65rem', color: 'var(--clr-text-muted)', marginTop: '8px', textAlign: 'center' }}>
              Seçilen sesler, LLM API'sine gitmeden sabit senaryoyu sırayla okur.
            </p>
          </div>





          {/* Geliştirilmiş İstatistikler */}
          <div className="glass-card">
            <p className="sidebar__section-title">📊 Detaylı İstatistikler</p>
            <div>
              <div className="stat-row">
                <span className="stat-row__label">Protokol</span>
                <span className="stat-row__value stat-row__value--accent">WebRTC P2P</span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">Çözünürlük</span>
                <span className="stat-row__value">{stats.resolution}</span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">FPS</span>
                <span className={`stat-row__value ${connectionState === 'connected' ? 'stat-row__value--success' : ''}`}>
                  {connectionState === 'connected' ? `${stats.fps | 0}` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">Bit Hızı</span>
                <span className="stat-row__value">
                  {connectionState === 'connected' ? `${stats.bitrate} kbps` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">RTT (Gecikme)</span>
                <span className="stat-row__value">
                  {connectionState === 'connected' ? `${stats.rtt} ms` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">Jitter</span>
                <span className="stat-row__value">
                  {connectionState === 'connected' ? `${stats.jitter} ms` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">Paket Kaybı</span>
                <span className={`stat-row__value ${stats.packetsLost > 50 ? 'stat-row__value--danger' : ''}`}>
                  {connectionState === 'connected' ? stats.packetsLost : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">Kareler (alınan/düşen)</span>
                <span className="stat-row__value" style={{ fontSize: '0.75rem' }}>
                  {connectionState === 'connected'
                    ? `${stats.framesReceived} / ${stats.framesDropped}`
                    : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">Yüz Modeli</span>
                <span className="stat-row__value stat-row__value--accent">{faceModel}</span>
              </div>
              <div className="stat-row">
                <span className="stat-row__label">İstemci ID</span>
                <span className="stat-row__value" style={{ fontSize: '0.68rem', opacity: 0.6 }}>
                  {CLIENT_ID.slice(0, 12)}…
                </span>
              </div>
            </div>
          </div>

          {/* Mimari Bilgisi */}
          <div className="glass-card" style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)', lineHeight: 1.7 }}>
            <p className="sidebar__section-title">Mimari</p>
            <p>🌐 <strong style={{ color: 'var(--clr-text-primary)' }}>AWS t2.micro</strong><br />
              React UI + FastAPI Signaling<br />
              Video verisi geçmez.</p>
            <p style={{ marginTop: 8 }}>
              🖥️ <strong style={{ color: 'var(--clr-text-primary)' }}>Yerel GPU</strong><br />
              FastAPI + aiortc + CUDA<br />
              Face-Cache + Adaptif Skip<br />
              Ngrok ile dışarıya açıktır.
            </p>
          </div>
        </aside>
      </main>

      <footer className="footer">
        AI GENERATED — Bu sistem akademik amaçlıdır. Gerçek kişilere uygulanması yasaktır.
      </footer>
    </div>
  );
}
