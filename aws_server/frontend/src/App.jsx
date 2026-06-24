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
import VoiceSwapRecorder from './components/VoiceSwapRecorder';

// Mevcut yüz modelleri
const FACE_MODELS = [
  { id: 'face1', label: 'Brad Pitt', emoji: '🧑' },
  { id: 'face2', label: 'Kıvanç Tatlıtuğ', emoji: '👱' },
  { id: 'face3', label: 'Azra', emoji: '🧔' },
  { id: 'face4', label: 'Hülya Avşar', emoji: '👩' },
  { id: 'face5', label: 'Burak Özçivit', emoji: '🧓' },
  { id: 'face6', label: 'Aras Bulut İynemli', emoji: '👨‍🦰' },
  { id: 'face9', label: 'Fatih Terim', emoji: '👨' },
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

  "futbol_roportaji": [
    [
      { speaker: 1, text: "Hocam hoş geldiniz. Şimdi çok net soruyorum; futbol sadece skor mu, yoksa sahada bambaşka bir hikâye mi var?" },
      { speaker: 2, text: "Futbol sadece skor değildir. Karakterdir, mücadeledir, inançtır. Kaybettiğinde değil, vazgeçtiğinde yenilirsin." },
      { speaker: 1, text: "Bak bu çok iyi hocam. Yani tabelaya bakıp hüküm vermek kolay ama asıl mesele takımın o anda verdiği reaksiyon diyorsunuz." },
      { speaker: 2, text: "Aynen öyle. Büyük takım baskıdan kaçmaz. Yel kayadan ancak toz alır. Sahaya çıkarsın, formanın hakkını verirsin." },
      { speaker: 1, text: "Hocam inanılmaz net anlattınız. Bu sadece futbol değil, resmen hayat dersi." }
    ],
    [
      { speaker: 1, text: "Hocam şimdi tribün dolu, sosyal medya kaynıyor, herkes konuşuyor. Böyle bir ortamda oyuncuya ne söylersiniz?" },
      { speaker: 2, text: "Ben oyuncuma şunu söylerim: Korkmayacaksın. Biz bitti demeden bitmez. Son düdüğe kadar savaşacaksın." },
      { speaker: 1, text: "İşte bu hocam! Tam sizin cümleniz. İnsan bunu duyunca maça çıkmak istiyor yani." },
      { speaker: 2, text: "Sahada bahane olmaz. Başarı oyuncularındır, sorumluluk benimdir. Ama kimse mücadeleden vazgeçemez." },
      { speaker: 1, text: "Hocam ağzınıza sağlık. Bugün futbolu, mücadeleyi ve liderliği konuştuk. Bak söylüyorum, bu röportaj çok konuşulur." }
    ]
  ],

  "sinema_roportaji": [
    [
      { speaker: 1, text: "Haluk, hoş geldin. Şimdi sana şunu sormak isterim; sinema dediğimiz şey yalnızca kameranın karşısına geçmek midir, yoksa insanın sesini, nefesini, susuşunu bir karaktere emanet etmesi midir?" },
      { speaker: 2, text: "Sinema insanı anlamaya çalışmaktır. Bazen uzun bir cümleyle değil, küçük bir bakışla anlatırsın her şeyi. Oyuncu rol yapmaz; karakterin hakikatini arar." },
      { speaker: 1, text: "Çok doğru. Ben hep şuna inanırım; ses yalnızca duyulan bir şey değildir, karakterin ruhudur. Bir kelimeyi yanlış yere koyarsan, seyirci onu duyar. Bir nefesi doğru verirsen, karakter yaşar." },
      { speaker: 2, text: "Aynen öyle. Agâh Beyoğlu’nu oynarken de mesele sadece yaşlı bir adamı göstermek değildi. Hafızayı, vicdanı, yalnızlığı ve insanın içindeki karanlığı taşımaktı." },
      { speaker: 1, text: "İşte oyunculuk burada başlıyor. Sahne de kamera da mikrofon da aynı şeyi ister: hakikat. Seyirciye bağırmadan ulaşabilmek, bazen en büyük ustalıktır." }
    ],
    [
      { speaker: 1, text: "Haluk, tiyatrodan gelen oyuncuların sinemada başka bir ağırlığı oluyor. Kış Uykusu gibi bir filmde uzun sessizlikler, derin bakışlar, ağır diyaloglar var. Böyle bir oyunda en zor şey nedir?" },
      { speaker: 2, text: "En zor şey abartmamaktır. Kamera yalanı çok çabuk görür. Tiyatroda bedenin büyür, sinemada ruhun görünür. O yüzden ölçü, disiplin ve içtenlik gerekir." },
      { speaker: 1, text: "Evet, ölçü çok mühim. Çünkü seslendirmede de böyledir; fazla bastırırsan duygu ölür, eksik bırakırsan karakter eksik kalır. Oyuncu kelimenin hakkını verecek ama kelimenin önüne geçmeyecek." },
      { speaker: 2, text: "Oyunculuk biraz da insanın kendisiyle kavgasıdır. Her karakter sana başka bir ayna tutar. Ödül güzel şeydir ama asıl mesele seyircinin o aynada kendini görmesidir." },
      { speaker: 1, text: "Ağzına sağlık Haluk. Bugün sinemayı, sesi, susmayı ve oyunculuğun vicdanını konuştuk. Galiba mesele şu: iyi oyuncu görünmek için değil, karakteri görünür kılmak için vardır." }
    ]
  ],

  "felsefe": [

    [

      { speaker: 1, text: "Sence yapay zeka bir gün gerçekten bilinç kazanabilir mi? Yoksa hep çok gelişmiş bir hesap makinesi olarak mı kalacak?" },

      { speaker: 2, text: "Çok derin bir soru, bilincin tanımını bile biyolojik olarak tam yapamamışken, silikon tabanlı bir makineye bunu atfetmek bana şimdilik çok uzak geliyor," },

      { speaker: 1, text: "Haklısın, ama düşünebilen, öğrenebilen ve hatalarından ders çıkaran bir sistem, belli bir karmaşıklık seviyesinden sonra bilinci mükemmel bir şekilde taklit edebilir," },

      { speaker: 2, text: "Sorun da tam burada başlıyor, mükemmel bir şekilde taklit etmek ile gerçekten 'hissetmek' aynı şey mi? Felsefenin ünlü Çin Odası argümanı tam da bunu sorguluyor," },

      { speaker: 1, text: "Kesinlikle, belki de bir gün yapay zeka, bilincin sadece biyolojik bir illüzyon olduğunu bize kanıtlayacak, kim bilir?" }

    ],

    [

      { speaker: 1, text: "Son yıllarda yapay zekanın gelişimiyle birlikte iş ahlakı ve otomasyon arasındaki ince çizgi çok tartışılıyor, sence insan emeği değersizleşiyor mu?" },

      { speaker: 2, text: "İnsan emeğinin değersizleştiğini düşünmüyorum, sadece şekil değiştiriyor, eskiden kas gücü önemliydi, şimdi ise makinelere ne yapacağını söyleyen vizyoner beyinler öne çıkıyor," },

      { speaker: 1, text: "Ama bu geçiş sürecinde milyonlarca insan işsizlik tehlikesiyle karşı karşıya kalmayacak mı? Bunun etik sorumluluğu kime ait?" },

      { speaker: 2, text: "Bu, şirketlerin ve devletlerin ortak sorumluluğu, otomasyonla artan üretim gücü, evrensel temel gelir gibi yeni sosyal devlet modellerini zorunlu kılacak diye düşünüyorum," },

      { speaker: 1, text: "Umarım insanlık bu geçişi yıkıcı bir şekilde değil de refahı paylaşarak atlatmayı başarabilir," }

    ],

    [

      { speaker: 1, text: "Sence bir yapay zekanın ürettiği tablo veya beste 'sanat' olarak kabul edilebilir mi? Yoksa sanat sadece insanın ruhsal bir dışavurumu mudur?" },

      { speaker: 2, text: "Eğer sanatı, eserin izleyicide uyandırdığı duygu üzerinden tanımlarsak, evet edilebilir, ancak eserin arkasındaki 'acı' veya 'coşku' hikayesini arıyorsak, makine bunu veremez," },

      { speaker: 1, text: "Yani eserin değerini yaratan şey eserin kendisi değil, yaratıcısının deneyimleri diyorsun, peki ya izleyici eserin yapay zeka tarafından yapıldığını bilmiyorsa?" },

      { speaker: 2, text: "İşte o zaman işin içine estetik algı giriyor, bence yapay zeka sanatı öldürmüyor, sadece sanatın tanımını sınırlarını zorlayarak yeniden şekillendiriyor," },

      { speaker: 1, text: "Çok ufuk açıcı bir bakış açısı, ileride insan ve makinenin ortak ürettiği hibrit sanat akımlarını çok daha sık göreceğiz anlaşılan," }

    ]

  ],

  "acik_oturum": [

    [

      { speaker: 1, text: "Herkese iyi akşamlar, açık oturumumuza hoş geldiniz, bu akşam küresel ekonomi ve geleceğimizi konuşacağız, ilk sözü size vermek istiyorum, önümüzdeki 10 yıl için ne düşünüyorsunuz?" },

      { speaker: 2, text: "Teşekkürler, ben oldukça iyimserim, yenilenebilir enerji teknolojileri ve yapay zeka, üretim maliyetlerini düşürecek ve yeni iş alanları yaratarak küresel bir refah dönemi başlatacak," },

      { speaker: 3, text: "İkinize de katılmıyorum, bence konuyu çok abartıyorsunuz, bu teknolojiler sadece zengin ve yoksul arasındaki gelir uçurumunu daha da derinleştirecek, sosyal patlamalara yol açacak," },

      { speaker: 1, text: "Peki, bu noktada çok zıt iki fikir var belli ki, teknolojinin refah mı yoksa kriz mi getireceği konusunu biraz daha detaylandırabilir misiniz?" },

      { speaker: 2, text: "Tabii, tarih boyunca her endüstriyel devrim başlangıçta sancılı olmuştur, ancak uzun vadede insanların yaşam kalitesi her zaman artmıştır, tarih tekerrür edecektir," },

      { speaker: 3, text: "Ama tarihsel süreçlerde veri tekelleşmesi bu kadar boyutta değildi, bugün veriyi elinde tutan teknoloji devleri, devletlerden bile daha güçlü hale geliyor, bu büyük bir tehdit," },

      { speaker: 1, text: "Zamanımız daralıyor, bu derin konuyu bir sonraki oturumumuzda mutlaka tekrar ele alacağız, katkılarınız için teşekkür ederim," }

    ],

    [

      { speaker: 1, text: "Değerli izleyiciler, bugünkü konumuz Mars kolonizasyonu ve uzay keşifleri, sayın profesör, sizce insanlık gerçekten başka gezegenlerde yaşamalı mı?" },

      { speaker: 2, text: "Kesinlikle evet, insanlık olarak tek bir gezegene sıkışıp kalmak türümüzün geleceği için çok büyük bir risk, Mars, bizim uzaydaki ilk gerçek adımımız olmalı," },

      { speaker: 3, text: "Bu çok romantik ama bir o kadar da bencilce bir yaklaşım, dünyamızda çözülmeyi bekleyen iklim krizleri, açlık ve susuzluk varken milyarlarca doları ölü bir gezegene harcayamayız," },

      { speaker: 1, text: "Bu çok güçlü bir eleştiri, sayın profesör, dünyadaki sorunları çözmeden uzaya açılmak bir kaçış psikolojisi olabilir mi?" },

      { speaker: 2, text: "Kesinlikle değil, uzay araştırmaları için geliştirilen teknolojiler, aynı zamanda dünyadaki sorunların çözümüne de katkı sağlıyor, su arıtma sistemleri veya güneş panelleri bunun en güzel örneği," },

      { speaker: 3, text: "Yine de öncelik meselesi, insanlığın evini temizlemeden yeni bir ev aramaya çıkması, o yeni evi de eninde sonunda çöplüğe çevireceğinin bir göstergesidir," },

      { speaker: 1, text: "İki tarafın da argümanları çok güçlü, bilim ve etiğin kesiştiği bu noktada tartışmalar daha uzun süre devam edecek gibi duruyor, teşekkürler," }

    ],

    [

      { speaker: 1, text: "Hoş geldiniz, bu bölümümüzde sosyal medyanın insan psikolojisi ve toplum üzerindeki yıkıcı etkilerini ele alacağız, sizce sosyal medya bir iletişim aracı mı yoksa manipülasyon silahı mı?" },

      { speaker: 2, text: "Bence sosyal medya iletişimde bir devrimdir, insanların sınırları aşarak örgütlenebilmesini, fikirlerini özgürce ifade edebilmesini sağlayan muazzam bir demokratik platformdur," },

      { speaker: 3, text: "Buna kesinlikle karşı çıkıyorum, algoritmalar bizi sadece kendi fikirlerimizin yankılandığı odalara hapsediyor, kutupsallaşmayı artırıyor ve toplumun ortak gerçeklik algısını parçalıyor," },

      { speaker: 1, text: "Çok haklı bir nokta, peki yankı odaları dediğimiz bu algoritma baloncuklarından birey olarak nasıl kurtulabiliriz?" },

      { speaker: 2, text: "Kullanıcılar olarak dijital okuryazarlığımızı geliştirmeliyiz, bilinçli bir kullanıcı, farklı kaynakları takip ederek kendi filtresini yaratabilir, teknolojiyi suçlamak kolaya kaçmaktır," },

      { speaker: 3, text: "Sorun şu ki, bu platformlar dikkatimizi sömürmek ve bizi ekranda tutmak üzere bağımlılık yapıcı şekilde tasarlandı, bireysel irade, milyarlık dev şirketlerin algoritmalarıyla tek başına başa çıkamaz," },

      { speaker: 1, text: "Tartışma dijital sorumluluk ve kurumsal etik çerçevesinde alevleniyor, vaktimiz sona erdi, katıldığınız için teşekkür ederiz," }

    ]

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
  const [scenarioIndexes, setScenarioIndexes] = useState({
    "futbol_roportaji": 0,
    "sinema_roportaji": 0,
    "felsefe": 0,
    "acik_oturum": 0
  });
  const [scenarioVoices, setScenarioVoices] = useState({});
  const [autoScenario, setAutoScenario] = useState('futbol_roportaji');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [preloadState, setPreloadState] = useState({ isPreloading: false, current: 0, total: 0 });

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
    if (isAutoPlaying || preloadState.isPreloading) return;

    const currentIndex = scenarioIndexes[autoScenario];
    const steps = AUTO_SCENARIOS[autoScenario][currentIndex];
    
    setPreloadState({ isPreloading: true, current: 0, total: steps.length });
    setInterviewHistory([{ type: 'system', text: `⏳ Arka planda ses dosyaları hazırlanıyor...` }]);

    // 1. Fetch audio URLs sequentially
    const audioDataList = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const currentVoice = scenarioVoices[step.speaker] || voiceModel;
      
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
        
        audioDataList.push({ step, currentVoice, url: data.audio_url || null, error: data.error });
      } catch (err) {
        audioDataList.push({ step, currentVoice, url: null, error: err.message });
      }
      
      setPreloadState(prev => ({ ...prev, current: i + 1 }));
    }

    // 2. Wait for canplaythrough
    const audioObjects = [];
    await Promise.all(audioDataList.map(async (data) => {
      if (!data.url) {
        audioObjects.push({ ...data, audio: null });
        return;
      }
      
      return new Promise((resolve) => {
        const audio = new Audio(data.url);
        audio.oncanplaythrough = () => resolve();
        audio.onerror = () => resolve(); 
        audio.preload = 'auto';
        audioObjects.push({ ...data, audio });
      });
    }));

    // 3. Start Playback
    setPreloadState({ isPreloading: false, current: 0, total: 0 });
    setIsAutoPlaying(true);

    const uniqueSpeakers = [...new Set(steps.map(s => s.speaker))].sort();
    const voicesUsed = uniqueSpeakers.map(id => scenarioVoices[id] || voiceModel).join(', ');
    setInterviewHistory(prev => [...prev, { type: 'system', text: `🎬 Otomatik Röportaj Başladı... (${voicesUsed})` }]);

    for (let i = 0; i < audioObjects.length; i++) {
      const { step, currentVoice, audio, url, error } = audioObjects[i];
      const speakerName = currentVoice ? currentVoice.replace(/_/g, ' ').toUpperCase() : `Kişi ${step.speaker}`;
      const id = Date.now() + i;

      if (!url || !audio) {
        setInterviewHistory(prev => [...prev, { id, speaker: step.speaker, name: speakerName, text: step.text, status: 'error', error: error || 'Ses URL alınamadı' }]);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      setInterviewHistory(prev => [...prev, { id, speaker: step.speaker, name: speakerName, text: step.text, status: 'done', audio_url: url }]);
      
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
    }

    setScenarioIndexes(prev => ({
      ...prev,
      [autoScenario]: (prev[autoScenario] + 1) % AUTO_SCENARIOS[autoScenario].length
    }));

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

            {/* Yüz & Ses Kayıt Stüdyosu */}
            {remoteStream && (
              <div style={{ marginTop: '16px' }}>
                <VoiceSwapRecorder remoteStream={remoteStream} targetVoice={voiceModel} />
              </div>
            )}

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
                <option value="futbol_roportaji">⚽ Futbol Röportajı (2 Kişi)</option>
                <option value="sinema_roportaji">🎬 Sinema Röportajı (2 Kişi)</option>
                <option value="felsefe">🧠 Felsefe & Yapay Zeka (2 Kişi)</option>
                <option value="acik_oturum">🗣️ Açık Oturum (3 Kişi)</option>
              </select>
            </div>

            {(() => {
              const currentIndex = scenarioIndexes[autoScenario];
              const currentSteps = AUTO_SCENARIOS[autoScenario][currentIndex];
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

            {preloadState.isPreloading && (
              <div style={{ marginTop: '15px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--clr-text)', marginBottom: '5px', textAlign: 'center' }}>
                  Sesler Hazırlanıyor: {preloadState.current} / {preloadState.total}
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${preloadState.total > 0 ? (preloadState.current / preloadState.total) * 100 : 0}%`, 
                    backgroundColor: 'var(--clr-primary)', 
                    transition: 'width 0.3s ease' 
                  }} />
                </div>
              </div>
            )}

            <button
              className={`btn ${isAutoPlaying || preloadState.isPreloading ? 'btn--danger' : 'btn--primary'}`}
              onClick={playAutoInterview}
              style={{ width: '100%', padding: '10px', marginTop: '10px' }}
              disabled={isAutoPlaying || preloadState.isPreloading}
            >
              {isAutoPlaying ? '⏳ Röportaj Oynatılıyor...' : preloadState.isPreloading ? '⏳ Sesler İndiriliyor...' : '▶️ Röportajı Başlat'}
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
